import { useEffect, useState } from "react";
import { Pause, Play, Timer, Trash2 } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { fmtTime } from "../lib/format";
import { keys, useAction, useRunning, useTaskTime, useTimeReport } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar, Empty } from "./ui";

export const hm = (min: number) => (min < 60 ? `${min} mnt` : `${Math.floor(min / 60)} j ${min % 60} m`);
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const refresh = [keys.timer, keys.tasks, keys.activity];

function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const id = setInterval(() => set(n => n + 1), 1000); return () => clearInterval(id); }, [on]);
}

/** In the header while a timer runs: task, elapsed time, stop. */
export function RunningPill() {
  const q = useRunning(true), { openTask } = useUi();
  const stop = useAction(() => ok(api.time.stop.$post()), { refresh, done: "Timer dihentikan" });
  const r = q.data;
  useTick(!!r);
  if (!r) return null;
  return (
    <div className="runpill" role="status" aria-label="Timer berjalan">
      <i className="rec" /><button className="linkbtn clamp1" style={{ textDecoration: "none", maxWidth: 160 }} onClick={() => openTask(r.entry.taskId)} title={r.taskTitle}>{r.taskTitle}</button>
      <b>{clock(Date.now() - r.entry.startedAt)}</b>
      <button className="iconbtn" style={{ width: 26, height: 26 }} aria-label="Hentikan timer" onClick={() => stop.mutate()}><Pause size={13} /></button>
    </div>
  );
}

/** Drawer section: start/stop the timer on this task and see the time already spent. */
export function TaskTimer({ t, canWork }: { t: TaskDTO; canWork: boolean }) {
  const { me, policy } = useViewer();
  const run = useRunning(true).data, q = useTaskTime(t.id);
  const here = run?.entry.taskId === t.id;
  useTick(here);
  const start = useAction(() => ok(api.time[":taskId"].start.$post({ param: { taskId: t.id } })), { refresh });
  const stop = useAction(() => ok(api.time.stop.$post()), { refresh });
  const del = useAction((id: string) => ok(api.time.entry[":id"].$delete({ param: { id } })), { refresh });
  const entries = q.data?.entries ?? [];
  return (
    <section>
      <h3 className="sub" style={{ padding: 0 }}><span className="iconline"><Timer size={15} />Waktu kerja</span></h3>
      <div className="timerbox">
        <div><div className="mid-n">{hm((q.data?.totalMin ?? 0) + (here ? Math.floor((Date.now() - run!.entry.startedAt) / 60000) : 0))}</div><small className="muted">{entries.length} sesi{here ? " · berjalan " + clock(Date.now() - run!.entry.startedAt) : ""}</small></div>
        {canWork && t.status !== "done" && (here
          ? <button className="btn primary" onClick={() => stop.mutate()} disabled={stop.isPending}><Pause size={14} />Berhenti</button>
          : <button className="btn blue" onClick={() => start.mutate()} disabled={start.isPending}><Play size={14} />Mulai</button>)}
      </div>
      {entries.length > 0 && <ul className="alist">{entries.slice(0, 5).map(e => (
        <li key={e.id} className="arow" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
          <small>{fmtTime(e.startedAt)}{e.endedAt ? " – " + fmtTime(e.endedAt) : " – …"}</small>
          <b style={{ fontSize: ".8rem" }}>{e.endedAt ? hm(Math.max(1, Math.round((e.endedAt - e.startedAt) / 60000))) : "berjalan"}</b>
          {(e.email === me.email || policy.canManage(e.email)) && e.endedAt ? <button className="iconbtn" style={{ width: 26, height: 26 }} aria-label="Hapus sesi" onClick={() => del.mutate(e.id)}><Trash2 size={12} /></button> : <span />}
        </li>))}</ul>}
    </section>
  );
}

/** Reports tab: tracked time per person, project and day. */
export function TimeReport({ from, to }: { from: string; to: string }) {
  const { projects, team: members } = useViewer();
  const q = useTimeReport(from, to), d = q.data;
  if (!d) return <p className="muted">Memuat…</p>;
  const maxP = Math.max(1, ...d.perPerson.map(p => p.min)), maxJ = Math.max(1, ...d.byProject.map(p => p.min)), maxD = Math.max(1, ...d.daily.map(x => x.min));
  return (
    <div className="two2">
      <section className="bc"><div className="bc-h"><span className="bc-ico"><Timer size={18} /></span><h3>Total waktu tercatat</h3></div>
        <div className="big">{Math.floor(d.totalMin / 60)}<small> jam {d.totalMin % 60} mnt</small></div>
        <div className="pixels" style={{ height: 80, alignItems: "stretch", gap: 3 }} role="img" aria-label="Menit per hari">
          {d.daily.map(x => <div key={x.date} title={`${x.date}: ${hm(x.min)}`} style={{ flex: 1, display: "flex", alignItems: "flex-end" }}><i style={{ width: "100%", height: `${Math.max(x.min ? 8 : 3, x.min / maxD * 100)}%`, borderRadius: 4, background: x.min ? "var(--blue)" : "var(--glass)" }} /></div>)}
        </div>
      </section>
      <section className="bc"><div className="bc-h"><h3>Per proyek</h3></div>
        {d.byProject.map(b => { const p = projects.find(x => x.id === b.projectId); return <div key={b.projectId ?? "none"} className="tbar" data-c={p?.color}><span className="clamp1">{p?.name ?? "Tanpa proyek"}</span><div><i style={{ width: `${b.min / maxJ * 100}%` }} /></div><b>{hm(b.min)}</b></div>; })}
        {!d.byProject.length && <Empty art="activity" title="Belum ada waktu tercatat">Mulai timer dari panel tugas.</Empty>}
      </section>
      <section className="bc s12" style={{ gridColumn: "1 / -1" }}><div className="bc-h"><h3>Per orang</h3></div>
        {d.perPerson.map(p => { const m = members.find(x => x.email === p.email); return <div key={p.email} className="tbar who"><span className="nm">{m && <Avatar m={m} />}<span className="clamp1">{p.name}</span></span><div><i style={{ width: `${p.min / maxP * 100}%` }} /></div><b>{hm(p.min)}</b></div>; })}
        {!d.perPerson.length && <p className="muted" style={{ fontSize: ".84rem" }}>Belum ada data.</p>}
      </section>
    </div>
  );
}
