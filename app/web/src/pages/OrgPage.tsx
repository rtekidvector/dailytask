import { useMemo, useState } from "react";
import type { MemberDTO } from "@shared/schemas";
import { Avatar, PersonLink } from "../components/ui";
import { fmtShort, today } from "../lib/format";
import { awayOn } from "../lib/leaves";
import { useLeaves, useMeta, useTasks } from "../lib/queries";
import { addDays } from "@shared/time";
import { useViewer } from "../lib/viewer";

type Level = "owner" | "boss" | "head" | "member";
const LEVEL: Record<Level, string> = { owner: "Pemilik", boss: "Admin penuh", head: "Kepala unit", member: "Anggota" };
const NOUNIT = "Tanpa unit";

interface Person { key: string; name: string; role: string; level: Level; unit: string; m?: MemberDTO; reports: string }

/** Owner → full admins → unit heads → members. Built only from the team list: who administers which unit, and who belongs to it. */
function useOrg() {
  const { team, me } = useViewer();
  const owner = useMeta(true).data?.owner;
  return useMemo(() => {
    const ownerM = owner ? team.find(m => m.email === owner.email) : undefined;
    const top: Person[] = owner ? [{ key: owner.email, name: ownerM?.name ?? owner.name, role: ownerM?.role || "Pemilik aplikasi", level: "owner", unit: "", m: ownerM, reports: "—" }] : [];
    const bosses = team.filter(m => m.isAdmin && !m.adminGroups.length && m.email !== owner?.email);
    const topNames = [...top, ...bosses.map(b => ({ name: b.name }))].map(p => p.name).join(", ") || "—";
    const bossP: Person[] = bosses.map(b => ({ key: b.email, name: b.name, role: b.role || "Admin", level: "boss", unit: "", m: b, reports: top[0]?.name ?? "—" }));
    const units = [...new Set(team.map(m => m.group).filter(Boolean))].sort();
    const byUnit = units.map(u => {
      const heads = team.filter(m => m.isAdmin && m.adminGroups.includes(u));
      const headNames = heads.map(h => h.name).join(", ");
      const members = team.filter(m => !m.isAdmin && m.group === u);
      return {
        unit: u,
        heads: heads.map<Person>(h => ({ key: h.email, name: h.name, role: h.role || "Admin unit", level: "head", unit: u, m: h, reports: topNames })),
        members: members.map<Person>(x => ({ key: x.email, name: x.name, role: x.role, level: "member", unit: u, m: x, reports: headNames || topNames })),
      };
    });
    const loose = team.filter(m => !m.isAdmin && !m.group).map<Person>(x => ({ key: x.email, name: x.name, role: x.role, level: "member", unit: NOUNIT, m: x, reports: topNames }));
    const looseHeads = team.filter(m => m.isAdmin && m.adminGroups.length && !m.adminGroups.some(g => units.includes(g)));
    const all = [...top, ...bossP, ...byUnit.flatMap(u => [...u.heads, ...u.members]), ...looseHeads.map<Person>(h => ({ key: h.email, name: h.name, role: h.role || "Admin unit", level: "head", unit: h.adminGroups.join(", "), m: h, reports: topNames })), ...loose];
    // an admin who heads several units appears under each one; the table lists them once
    const uniq = [...new Map(all.map(p => [p.key, p])).values()];
    return { top, bossP, byUnit, loose, uniq, me: me.email };
  }, [team, owner, me.email]);
}

function Node({ p, open }: { p: Person; open?: number }) {
  const away = !!p.m && !!awayOn(useLeaves(true).data ?? [], p.m.email, today());
  return (
    <div className={"onode " + p.level}>
      {p.m ? <Avatar m={p.m} /> : <span className="avatar">{p.name[0]}</span>}
      <div style={{ minWidth: 0 }}><b className="clamp1" title={p.name}>{p.m ? <PersonLink email={p.m.email}>{p.name}</PersonLink> : p.name}</b><small className="clamp1" title={p.role}>{p.role || LEVEL[p.level]}</small></div>
      {away && <span className="ocnt" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>Cuti</span>}
      {!away && open !== undefined && <span className="ocnt" title="Tugas belum selesai">{open}</span>}
    </div>
  );
}

export function OrgView() {
  const { policy } = useViewer();
  const org = useOrg();
  const [tab, setTab] = useState("bagan"), [unit, setUnit] = useState(""), [q, setQ] = useState("");
  const tq = useTasks(addDays(today(), -30), policy.isManager);
  const openOf = (email?: string) => policy.isManager && email ? (tq.data ?? []).filter(t => t.email === email && t.status !== "done").length : undefined;
  const units = org.byUnit.map(u => u.unit);
  const rows = org.uniq.filter(p => (!unit || p.unit === unit || (unit === NOUNIT && !p.unit)) && (!q.trim() || (p.name + " " + p.role).toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <div className="seg" role="group" aria-label="Tampilan struktur" style={{ justifySelf: "start" }}>
        <button aria-pressed={tab === "bagan"} onClick={() => setTab("bagan")}>Bagan</button><button aria-pressed={tab === "tabel"} onClick={() => setTab("tabel")}>Tabel</button>
      </div>
      {tab === "bagan" ? (
        <section className="bc"><div className="heatwrap"><div className="org">
          <div className="otop">{[...org.top, ...org.bossP].map(p => <Node key={p.key} p={p} open={openOf(p.m?.email)} />)}</div>
          <div className="ostem" />
          <div className="ounits">
            {org.byUnit.map(u => (
              <div key={u.unit} className="ounit">
                <div className="ulabel">{u.unit}<span>{u.members.length}</span></div>
                {u.heads.map(h => <Node key={h.key} p={h} open={openOf(h.m?.email)} />)}
                <div className="omembers">{u.members.map(m => <Node key={m.key} p={m} open={openOf(m.m?.email)} />)}{!u.members.length && <small className="muted">Belum ada anggota</small>}</div>
              </div>))}
            {org.loose.length > 0 && <div className="ounit"><div className="ulabel">{NOUNIT}<span>{org.loose.length}</span></div><div className="omembers">{org.loose.map(m => <Node key={m.key} p={m} open={openOf(m.m?.email)} />)}</div></div>}
          </div>
        </div></div></section>
      ) : (
        <section className="bc">
          <div className="bc-h"><h3>Daftar anggota</h3>
            <select className="input" value={unit} onChange={e => setUnit(e.target.value)} aria-label="Unit" style={{ width: "auto" }}><option value="">Semua unit</option>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>
            <label className="searchbox"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau jabatan…" aria-label="Cari anggota" /></label></div>
          <div className="heatwrap"><table className="htable otable">
            <thead><tr><th>Nama</th><th>Jabatan</th><th>Unit</th><th>Peran</th><th>Atasan</th>{policy.isManager && <th style={{ textAlign: "right" }}>Tugas aktif</th>}<th>Terakhir masuk</th></tr></thead>
            <tbody>{rows.map(p => (
              <tr key={p.key}>
                <td><span className="nm">{p.m ? <Avatar m={p.m} /> : <span className="avatar">{p.name[0]}</span>}<b>{p.name}</b></span></td>
                <td>{p.role || "—"}</td><td>{p.unit || "—"}</td><td><span className={"stpill " + (p.level === "member" ? "" : p.level === "head" ? "doing" : "done")}>{LEVEL[p.level]}</span></td>
                <td>{p.reports}</td>{policy.isManager && <td style={{ textAlign: "right", fontWeight: 700 }}>{openOf(p.m?.email) ?? "—"}</td>}
                <td className="muted">{p.m?.seenAt ? fmtShort(new Date(p.m.seenAt).toISOString().slice(0, 10)) : "Belum pernah"}</td>
              </tr>))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
