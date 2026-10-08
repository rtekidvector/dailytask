import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, CalendarClock, CheckCheck, Flag, FolderKanban, History, Search, Sparkles, Users } from "lucide-react";
import type { MemberDTO, TaskDTO } from "@shared/schemas";
import { addDays, atMs } from "@shared/time";
import { DAYN, fmtShort, today } from "../lib/format";
import { weekStart } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import { Art, PromoScene } from "./Illus";
import { Avatar, PersonLink, tally } from "./ui";

const sameDelta = (n: number, unit: string) => <span className={"delta" + (n < 0 ? " bad" : n === 0 ? " flat" : "")}>{n > 0 ? "+" : ""}{n} {unit}</span>;

function Hero({ tasks, all, date, people }: { tasks: TaskDTO[]; all: TaskDTO[]; date: string; people: MemberDTO[] }) {
  const [, go] = useLocation();
  const { newTask } = useUi();
  const c = tally(tasks), pct = tasks.length ? Math.round(c.done / tasks.length * 100) : 0;
  const prevDone = all.filter(t => t.date === addDays(date, -1) && t.status === "done").length;
  const days = Array.from({ length: 14 }, (_, i) => addDays(date, i - 13));
  const cols = days.map(d => { const l = all.filter(t => t.date === d); const done = l.filter(t => t.status === "done").length; return { done: Math.min(done, 6), open: Math.min(l.length - done, 6 - Math.min(done, 6)) }; });
  return (
    <section className="bc hero" aria-label="Progres">
      <div className="bc-h"><span className="bc-ico"><CheckCheck size={18} /></span><h3>{date === today() ? "Progres hari ini" : "Progres " + fmtShort(date)}</h3>
        {people.length > 0 && <span className="avatars" title="Sedang punya tugas aktif">{people.slice(0, 4).map(m => <Avatar key={m.email} m={m} />)}{people.length > 4 && <span className="avatar sm">+{people.length - 4}</span>}</span>}</div>
      <div className="row1">
        <div style={{ display: "grid", gap: 10 }}>
          <div className="big">{pct}<small>%</small></div>
          {sameDelta(c.done - prevDone, "dari kemarin")}
          <p className="muted" style={{ fontSize: ".82rem" }}>{tasks.length ? `${c.done} dari ${tasks.length} tugas selesai · ${c.doing} dikerjakan` : "Belum ada tugas pada hari ini"}</p>
        </div>
        <div className="pixels" role="img" aria-label="Tugas selesai dan terbuka 14 hari terakhir">
          {cols.map((k, i) => <div key={i}>{Array.from({ length: 6 }, (_, j) => <i key={j} className={j < k.done ? "" : j < k.done + k.open ? "l" : "g"} />)}</div>)}
        </div>
      </div>
      <div className="acts">
        <button className="btn blue" onClick={() => newTask()}>Tambah tugas</button>
        <button className="btn primary" onClick={() => go("/papan")}>Buka papan</button>
        <button className="btn" onClick={() => go("/laporan")}>Laporan</button>
      </div>
    </section>
  );
}

function StatDone({ all, date }: { all: TaskDTO[]; date: string }) {
  const [, go] = useLocation();
  const wk = weekStart(date), inW = (t: TaskDTO, from: string) => t.date >= from && t.date <= addDays(from, 6);
  const done = all.filter(t => t.status === "done" && inW(t, wk)), prev = all.filter(t => t.status === "done" && inW(t, addDays(wk, -7))).length;
  const onTime = done.filter(t => !t.due || (t.doneAt ?? 0) <= atMs(t.date, t.due)).length;
  return (
    <section className="bc s3 link" role="link" tabIndex={0} onClick={() => go("/daftar?st=done")} onKeyDown={e => e.key === "Enter" && go("/daftar?st=done")} aria-label="Lihat tugas selesai">
      <div className="bc-h"><span className="bc-ico green"><CheckCheck size={18} /></span><h3>Selesai</h3><span className="muted" style={{ fontSize: ".74rem", fontWeight: 600 }}>Minggu ini</span></div>
      <div className="mid-n">{done.length}<small> tugas</small></div>
      {sameDelta(done.length - prev, "dari minggu lalu")}
      <p className="muted" style={{ fontSize: ".8rem", marginTop: "auto" }}><b style={{ color: "var(--ink)" }}>{onTime}</b> tepat waktu{done.length ? ` (${Math.round(onTime / done.length * 100)}%)` : ""}</p>
    </section>
  );
}

function StatOpen({ all }: { all: TaskDTO[] }) {
  const [, go] = useLocation();
  const open = all.filter(t => t.status !== "done"), now = Date.now();
  const late = open.filter(t => t.date < today() || (t.due && now > atMs(t.date, t.due))).length;
  const hi = open.filter(t => t.priority === "urgent" || t.priority === "high").length, rest = open.length - hi;
  return (
    <section className="bc s3 link" role="link" tabIndex={0} onClick={() => go("/daftar?st=open")} onKeyDown={e => e.key === "Enter" && go("/daftar?st=open")} aria-label="Lihat tugas yang belum selesai">
      <div className="bc-h"><span className="bc-ico red"><Flag size={18} /></span><h3>Terlambat</h3><span className="muted" style={{ fontSize: ".74rem", fontWeight: 600 }}>{open.length} terbuka</span></div>
      <div className="mid-n">{late}<small> tugas</small></div>
      <span className={"delta" + (late ? " bad" : "")}>{late ? "Perlu ditindak" : "Semua tepat waktu"}</span>
      <div style={{ marginTop: "auto", display: "grid", gap: 8 }}>
        <div className="split" aria-hidden="true"><i style={{ flex: late || 0.0001 }} /><i style={{ flex: Math.max(0, hi - 0) || 0.0001, background: "var(--blue)" }} /><i style={{ flex: rest || 0.0001, background: "var(--volt)" }} /></div>
        <div className="legend"><span style={{ ["--k" as string]: "var(--ink)" }}>Terlambat {late}</span><span style={{ ["--k" as string]: "var(--blue)" }}>Prioritas tinggi {hi}</span><span style={{ ["--k" as string]: "var(--volt)" }}>Lainnya {rest}</span></div>
      </div>
    </section>
  );
}

function Gauge({ pct }: { pct: number }) {
  return (
    <svg width="190" height="104" viewBox="0 0 200 110" aria-hidden="true">
      <path d="M20 100a80 80 0 0 1 160 0" fill="none" stroke="#2a2c33" strokeWidth="16" strokeLinecap="round" pathLength="100" />
      <path d="M20 100a80 80 0 0 1 160 0" fill="none" stroke="var(--blue)" strokeWidth="16" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(pct, 1)} 100`} style={{ transition: "stroke-dasharray .6s ease" }} />
    </svg>
  );
}

function Goals({ all }: { all: TaskDTO[] }) {
  const { projects } = useViewer();
  const [, go] = useLocation();
  const rows = useMemo(() => projects.filter(p => !p.archived).map(p => { const l = all.filter(t => t.projectId === p.id), d = l.filter(t => t.status === "done").length; return { p, total: l.length, done: d, pct: l.length ? Math.round(d / l.length * 100) : 0 }; }).sort((a, b) => b.total - a.total), [projects, all]);
  const [pick, setPick] = useState<string | null>(null);
  const cur = rows.find(r => r.p.id === pick) ?? rows[0];
  return (
    <section className="bc s3">
      <div className="bc-h"><span className="bc-ico"><FolderKanban size={18} /></span><h3>Proyek</h3><button className="go" onClick={() => go("/proyek")} aria-label="Buka proyek"><ArrowUpRight size={16} /></button></div>
      {cur ? <>
        <div className="gauge-card" role="link" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => go("/proyek/" + cur.p.id)} onKeyDown={e => e.key === "Enter" && go("/proyek/" + cur.p.id)} aria-label={`Buka detail ${cur.p.name}`}><h4 className="clamp2">{cur.p.name}</h4><Gauge pct={cur.pct} /><div className="gv">{cur.pct}%</div><div className="tg">{cur.done} dari {cur.total} tugas selesai</div></div>
        <div className="plist">
          {rows.filter(r => r !== cur).slice(0, 3).map(r => (
            <button key={r.p.id} className="prow" data-c={r.p.color} onClick={() => setPick(r.p.id)} aria-label={`Tampilkan ${r.p.name}`}>
              <span className="pn"><span className="clamp1">{r.p.name}</span></span><span className="pg">{r.pct}%<i><b style={{ width: `${r.pct}%` }} /></i></span><ArrowUpRight size={14} />
            </button>))}
        </div>
      </> : <div className="emptyart" style={{ padding: 0 }}><Art name="tasks" /><b>Belum ada proyek</b></div>}
    </section>
  );
}

function Flow({ all, date }: { all: TaskDTO[]; date: string }) {
  const { setDate } = useUi();
  const [span, setSpan] = useState<7 | 14>(7);
  const [hov, setHov] = useState<number | null>(null);
  const start = addDays(weekStart(date), span === 14 ? -7 : 0);
  const days = Array.from({ length: span }, (_, i) => addDays(start, i));
  const data = days.map(d => { const l = all.filter(t => t.date === d), done = l.filter(t => t.status === "done").length; return { d, done, open: l.length - done }; });
  const max = Math.max(1, ...data.map(x => x.done + x.open));
  const tip = hov === null ? null : data[hov];
  return (
    <section className="bc s5">
      <div className="bc-h"><span className="bc-ico"><Sparkles size={18} /></span><h3>Arus kerja</h3>
        <div className="seg" role="group" aria-label="Rentang"><button aria-pressed={span === 7} onClick={() => setSpan(7)}>Minggu</button><button aria-pressed={span === 14} onClick={() => setSpan(14)}>2 minggu</button></div></div>
      <div className="flow" style={{ ["--n" as string]: span }} onMouseLeave={() => setHov(null)}>
        {tip && <div className="flowtip" style={{ left: `${((hov! + .5) / span) * 100}%`, top: 4 }}>
          <b>{fmtShort(tip.d)}</b>
          <div style={{ ["--k" as string]: "var(--volt)" }}><span>Selesai</span>{tip.done}</div>
          <div style={{ ["--k" as string]: "var(--blue)" }}><span>Terbuka</span>{tip.open}</div>
        </div>}
        {data.map((x, i) => (
          <button key={x.d} className={x.d === date ? "sel" : ""} onMouseEnter={() => setHov(i)} onFocus={() => setHov(i)} onBlur={() => setHov(null)} onClick={() => setDate(x.d)} aria-label={`${fmtShort(x.d)}: ${x.done} selesai, ${x.open} terbuka`}>
            <span className="col2">
              <i className="o" style={{ height: `${x.open / max * 100}%` }} /><i className="d" style={{ height: `${x.done / max * 100}%` }} />
            </span>
            <span>{span === 7 ? DAYN[(new Date(x.d + "T12:00:00").getDay())] : Number(x.d.slice(8))}</span>
          </button>))}
      </div>
      <div className="legend"><span style={{ ["--k" as string]: "var(--volt)" }}>Selesai</span><span style={{ ["--k" as string]: "var(--blue)" }}>Terbuka</span></div>
    </section>
  );
}

function Side({ all, idle }: { all: TaskDTO[]; idle?: number }) {
  const [, go] = useLocation();
  const { policy } = useViewer();
  const due = all.filter(t => t.status !== "done" && t.date === today() && t.due).sort((a, b) => a.due!.localeCompare(b.due!));
  const upcoming = all.filter(t => t.status !== "done" && t.date > today()).length;
  return (
    <div className="s4" style={{ display: "grid", gap: 16, alignContent: "stretch" }}>
      <section className="bc promo">
        <span className="pill">Rekap</span><h3>Pantau ketepatan waktu dan beban kerja</h3>
        <button className="btn primary small" style={{ alignSelf: "flex-start" }} onClick={() => go("/laporan")}>Lihat laporan</button>
        <div className="illo"><PromoScene /></div>
      </section>
      <div className="minis">
        <section className="bc link" role="link" tabIndex={0} onClick={() => go("/kalender")} onKeyDown={e => e.key === "Enter" && go("/kalender")} aria-label="Buka kalender"><div className="bc-h"><span className="bc-ico lime"><CalendarClock size={17} /></span><span className="lbl">Tenggat hari ini</span></div><div className="mid-n">{due.length}</div><span className="lbl">{due[0] ? `Berikutnya ${due[0].due}` : "Tidak ada"}</span></section>
        <section className="bc link" role="link" tabIndex={0} onClick={() => go(policy.isManager ? "/tim?t=beban" : "/daftar")} onKeyDown={e => e.key === "Enter" && go(policy.isManager ? "/tim?t=beban" : "/daftar")} aria-label="Lihat detail"><div className="bc-h"><span className="bc-ico ink">{policy.isManager ? <Users size={17} /> : <Flag size={17} />}</span><span className="lbl">{policy.isManager ? "Tanpa tugas" : "Mendatang"}</span></div><div className="mid-n">{policy.isManager ? idle ?? 0 : upcoming}</div><span className="lbl">{policy.isManager ? "orang" : "tugas"}</span></section>
      </div>
    </div>
  );
}

function HistoryCard({ all }: { all: TaskDTO[] }) {
  const { member, project } = useViewer();
  const { openTask } = useUi();
  const [, go] = useLocation();
  const [q, setQ] = useState("");
  const rows = all.filter(t => !q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)).slice(0, 8);
  return (
    <section className="bc s12">
      <div className="bc-h"><span className="bc-ico"><History size={18} /></span><h3>Riwayat tugas</h3>
        <label className="searchbox"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari tugas…" aria-label="Cari di riwayat" /></label>
        <button className="btn small" onClick={() => go("/daftar")}>Lihat semua</button></div>
      <table className="htable" style={{ tableLayout: "fixed" }}>
        <thead><tr><th style={{ width: "36%" }}>Tugas</th><th className="hide-s">Penerima</th><th className="hide-s">Proyek</th><th>Tanggal</th><th style={{ width: 120 }}>Status</th></tr></thead>
        <tbody>
          {rows.map(t => { const m = member(t.email), p = project(t.projectId), late = t.status !== "done" && t.date < today(); return (
            <tr key={t.id} className="hr" onClick={() => openTask(t.id)}>
              <td><span className="nm"><b>{t.title}</b></span></td>
              <td className="hide-s"><span className="nm">{m && <Avatar m={m} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}><PersonLink email={t.email}>{m?.name ?? t.email}</PersonLink></span></span></td>
              <td className="hide-s">{p?.name ?? "—"}</td><td>{fmtShort(t.date)}</td>
              <td><span className={"stpill " + (late ? "late" : t.status)}>{late ? "Terlambat" : t.status === "done" ? "Selesai" : t.status === "doing" ? "Dikerjakan" : "Belum"}</span></td>
            </tr>); })}
        </tbody>
      </table>
      {!rows.length && <div className="emptyart"><Art name="search" /><b>Tidak ada tugas</b></div>}
    </section>
  );
}

/** The dashboard's card grid. `all` = every task in view, `day` = tasks for the selected day. */
export function Bento({ all, day, date, people, idle }: { all: TaskDTO[]; day: TaskDTO[]; date: string; people: MemberDTO[]; idle?: number }) {
  return (
    <div className="bento">
      <Hero tasks={day} all={all} date={date} people={people} />
      <StatDone all={all} date={date} />
      <StatOpen all={all} />
      <Goals all={all} />
      <Flow all={all} date={date} />
      <Side all={all} idle={idle} />
      <HistoryCard all={all} />
    </div>
  );
}
