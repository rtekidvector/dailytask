import { useMemo, useState } from "react";
import type { TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { weekStart } from "../lib/tasks";
import { CloseProject } from "../components/CloseProject";
import { ProjectsLabels } from "../components/ProjectsLabels";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { today } from "../lib/format";
import { useLocation } from "wouter";
import { api, ok } from "../lib/api";
import { keys, useAction, useTasks, windowFrom } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";

function Ring({ pct }: { pct: number }) {
  return (
    <div className="pring"><svg viewBox="0 0 40 40" width="56" height="56" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--glass)" strokeWidth="5" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--d, var(--blue))" strokeWidth="5" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`} transform="rotate(-90 20 20)" />
    </svg><b>{pct}%</b></div>
  );
}

const DAYS = 28;
/** Each project as a bar from its first to its last task day (inside a four-week window); the dark part is the share done. */
function Gantt({ tasks }: { tasks: TaskDTO[] }) {
  const [, go] = useLocation();
  const { projects } = useViewer();
  const { date } = useUi();
  const start = addDays(weekStart(date), -7), end = addDays(start, DAYS - 1);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const pos = (d: string) => Math.max(0, Math.min(DAYS - 1, days.indexOf(d) >= 0 ? days.indexOf(d) : d < start ? 0 : DAYS - 1));
  const rows = projects.filter(p => !p.archived).map(p => {
    const l = tasks.filter(t => t.projectId === p.id && t.date <= end && t.date >= start);
    if (!l.length) return null;
    const a = l.reduce((m, t) => (t.date < m ? t.date : m), l[0]!.date), b = l.reduce((m, t) => (t.date > m ? t.date : m), l[0]!.date);
    const done = l.filter(t => t.status === "done").length;
    return { p, a: pos(a), b: pos(b), pct: Math.round(done / l.length * 100), l };
  }).filter(Boolean) as { p: (typeof projects)[number]; a: number; b: number; pct: number; l: TaskDTO[] }[];
  const todayIdx = days.indexOf(today());
  if (!rows.length) return <div className="bc"><Empty art="calendar" title="Belum ada jadwal proyek">Tugas yang punya proyek akan tampil di sini.</Empty></div>;
  return (
    <section className="bc"><div className="bc-h"><h3>Garis waktu 4 minggu</h3><span className="legend"><span style={{ ["--k" as string]: "var(--blue)" }}>Bagian gelap = selesai</span></span></div>
      <div className="heatwrap"><div className="gantt" style={{ ["--n" as string]: DAYS }}>
        <div />{days.map((d, i) => <div key={d} className={"gd" + (d === today() ? " today" : "") + (i % 7 === 0 ? " wk" : "")}>{i % 7 === 0 || d === today() ? <b>{Number(d.slice(8))}</b> : Number(d.slice(8))}</div>)}
        {rows.map(({ p, a, b, pct, l }) => [
          <div key={p.id} className="gp" data-c={p.color}><a className="plink clamp1" href={"/proyek/" + p.id} onClick={e => { e.preventDefault(); go("/proyek/" + p.id); }}>{p.name}</a><small className="muted">{l.length} tugas</small></div>,
          <div key={p.id + "t"} className="gtrack" style={{ gridColumn: "2 / -1" }}>
            {todayIdx >= 0 && <i className="gtoday" style={{ left: `${(todayIdx + .5) / DAYS * 100}%` }} />}
            <div className="gbar" data-c={p.color} style={{ left: `${a / DAYS * 100}%`, width: `${(b - a + 1) / DAYS * 100}%` }} title={`${p.name}: ${pct}% selesai`}><i style={{ width: `${pct}%` }} /><span>{pct}%</span></div>
          </div>,
        ])}
      </div></div>
    </section>
  );
}

export function ProjectsPage() {
  const { projects, policy, member } = useViewer();
  const { date } = useUi();
  const [tab, setTab] = useState("ringkas"), [closing, setClosing] = useState<string | null>(null);
  const [, go] = useLocation();
  const reopen = useAction((id: string) => ok(api.meta.projects[":id"].reopen.$post({ param: { id } })), { done: "Proyek dibuka kembali", refresh: [keys.meta] });
  const tq = useTasks(windowFrom(date, today()), true);
  const rows = useMemo(() => {
    const all = tq.data ?? [];
    return projects.filter(p => !p.archived).sort((a, b) => Number(!!a.closedAt) - Number(!!b.closedAt)).map(p => {
      const l = all.filter(t => t.projectId === p.id), done = l.filter(t => t.status === "done").length;
      const late = l.filter(t => t.status !== "done" && t.date < today()).length;
      const who = [...new Set(l.map(t => t.email))].map(e => member(e)).filter(Boolean);
      return { p, total: l.length, done, late, open: l.length - done, pct: l.length ? Math.round(done / l.length * 100) : 0, who };
    }).sort((a, b) => b.open - a.open);
  }, [tq.data, projects, member]);
  return (
    <Page title="Proyek" sub="Kemajuan tiap proyek dari tugas 30 hari terakhir dan seterusnya"
      tabs={[{ id: "ringkas", label: "Ringkasan" }, { id: "waktu", label: "Garis waktu" }, ...(policy.isManager ? [{ id: "kelola", label: "Kelola proyek & label" }] : [])]} tab={tab} onTab={setTab}>
      {tab === "kelola" && policy.isManager ? <ProjectsLabels /> : tab === "waktu" ? <Gantt tasks={tq.data ?? []} /> : rows.length ? (
        <div className="pcards">
          {rows.map(({ p, total, done, late, open, pct, who }) => (
            <article key={p.id} className={"pcard link" + (p.closedAt ? " closed" : "")} data-c={p.color} onClick={() => go("/proyek/" + p.id)}>
              <div className="ph"><Ring pct={pct} /><div style={{ minWidth: 0 }}><h3 className="clamp1"><a href={"/proyek/" + p.id} className="plink" onClick={e => { e.preventDefault(); e.stopPropagation(); go("/proyek/" + p.id); }}>{p.name}</a>{p.closedAt && <span className="stpill done" style={{ marginLeft: 8, verticalAlign: "middle" }}>Selesai</span>}</h3><p className="clamp2">{p.description || "Tanpa deskripsi"}</p></div></div>
              <div className="nums"><div><b>{open}</b><small>Terbuka</small></div><div><b>{done}</b><small>Selesai</small></div><div><b style={{ color: late ? "var(--bad)" : undefined }}>{late}</b><small>Terlambat</small></div></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="avatars">{who.slice(0, 5).map(m => <Avatar key={m!.email} m={m!} />)}</span>
                <span className="muted" style={{ fontSize: ".78rem", fontWeight: 600 }}>{total} tugas</span>
              </div>
              <div className="chips">
                <button className="btn small" onClick={e => { e.stopPropagation(); go("/proyek/" + p.id); }}>{p.closedAt ? "Laporan akhir" : "Detail"}</button>
                {policy.isManager && (p.closedAt ? <button className="btn small ghost" onClick={e => { e.stopPropagation(); reopen.mutate(p.id); }}>Buka kembali</button> : <button className="btn small primary" onClick={e => { e.stopPropagation(); setClosing(p.id); }}>Tutup proyek</button>)}
              </div>
            </article>))}
        </div>
      ) : <div className="bc"><Empty art="tasks" title="Belum ada proyek">{policy.isManager ? "Buat proyek di tab Kelola untuk mengelompokkan tugas." : "Proyek akan muncul di sini."}</Empty></div>}
      {closing && <CloseProject p={projects.find(x => x.id === closing)!} openTasks={rows.find(r => r.p.id === closing)?.open ?? 0} onClose={() => setClosing(null)} />}
    </Page>
  );
}
