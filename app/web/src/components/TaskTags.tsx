import type { ReactNode } from "react";
import { AlarmClock, CheckCheck, Clock, ListChecks, MessageSquare, Paperclip, Repeat } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { atMs } from "@shared/time";
import { dur, fmtShort, fmtTime } from "../lib/format";
import { PRIORITY_LABEL, subtaskProgress } from "../lib/tasks";
import { useViewer } from "../lib/viewer";

const I = 12;

/** Time-related tags (schedule, on time / late). Each returns [key, node] so callers can limit how many to show. */
function timeTags(t: TaskDTO, compact?: boolean): [string, ReactNode][] {
  const now = Date.now(), out: [string, ReactNode][] = [];
  const dl = t.due ? atMs(t.date, t.due) : null, st = t.start ? atMs(t.date, t.start) : null;
  if (st || dl) out.push(["time", <span className="tag due"><Clock size={I} />{t.start && t.due ? `${t.start}–${t.due}` : t.start ? "mulai " + t.start : "s/d " + t.due}</span>]);
  if (t.status === "done" && t.doneAt && dl) out.push(["punct", t.doneAt - dl <= 60000 ? <span className="tag on">Tepat waktu</span> : <span className="tag late">Telat {dur(t.doneAt - dl)}</span>]);
  else if (t.status !== "done" && dl && now > dl) out.push(["over", <span className="tag hot"><AlarmClock size={I} />Terlambat {dur(now - dl)}</span>]);
  else if (t.status === "todo" && st && now > st) out.push(["nostart", <span className="tag late">Belum mulai</span>]);
  if (!compact && t.startedAt) out.push(["started", <span className="tag off">Mulai {fmtTime(t.startedAt)}</span>]);
  if (t.status === "done" && t.doneAt) out.push(["doneat", <span className="tag off">Selesai {fmtTime(t.doneAt)}</span>]);
  return out;
}

export function TimeTags({ t, compact }: { t: TaskDTO; compact?: boolean }) {
  return <>{timeTags(t, compact).map(([k, n]) => <span key={k} style={{ display: "contents" }}>{n}</span>)}</>;
}

/**
 * The tags worth a glance on a task. `max` keeps lists tidy: the most important ones are shown and the rest
 * collapse into a "+N" chip (hover for the full list).
 */
export function TaskMeta({ t, isLate, time = true, compact, max }: { t: TaskDTO; isLate?: boolean; time?: boolean; compact?: boolean; max?: number }) {
  const { project, label } = useViewer();
  const p = project(t.projectId), sp = subtaskProgress(t);
  const items: [string, ReactNode, string][] = [];
  const add = (k: string, n: ReactNode, txt: string) => items.push([k, n, txt]);
  if (time) for (const [k, n] of timeTags(t, compact)) add(k, n, k);
  if (t.priority === "high" || t.priority === "urgent") add("prio", <span className={"tag " + t.priority}>{PRIORITY_LABEL[t.priority]}</span>, `Prioritas ${PRIORITY_LABEL[t.priority]}`);
  if (p) add("proj", <span className="tag proj" data-c={p.color} title={p.name}>{p.name}</span>, p.name);
  if (isLate) add("late", <span className="tag late">Dari {fmtShort(t.date)}</span>, "Tugas hari sebelumnya");
  if (t.returnedAt && t.status !== "done") add("back", <span className="tag late">Dikembalikan</span>, "Dikembalikan admin");
  if (t.revisions > 0) add("rev", <span className="tag off" title="Berapa kali dikembalikan untuk diperbaiki">Revisi {t.revisions}×</span>, `Revisi ${t.revisions} kali`);
  if (sp.total > 0) add("sub", <span className="tag off"><ListChecks size={I} />{sp.done}/{sp.total}</span>, `Checklist ${sp.done}/${sp.total}`);
  if (t.comments.length > 0) add("cmt", <span className="tag off"><MessageSquare size={I} />{t.comments.length}</span>, `${t.comments.length} komentar`);
  for (const id of t.labelIds) { const l = label(id); if (l) add("l" + id, <span className="tag proj" data-c={l.color} title={l.name}>#{l.name}</span>, "#" + l.name); }
  if (t.routineId) add("rut", <span className="tag rut"><Repeat size={I} />Rutin</span>, "Tugas rutin");
  if (t.by === "self") add("self", <span className="tag off">Buatan sendiri</span>, "Dibuat sendiri");
  if (!compact && t.status !== "done" && t.needProof) add("need", <span className="tag off"><Paperclip size={I} />Wajib bukti</span>, "Wajib bukti");
  if (t.status === "done") add("proof", t.proofAt ? <span className="tag on"><CheckCheck size={I} />Ada bukti</span> : t.needProof ? <span className="tag late">Tanpa bukti</span> : null, "Bukti");

  const shown = max ? items.slice(0, max) : items, rest = max ? items.slice(max) : [];
  return (
    <div className="meta">
      {shown.map(([k, n]) => <span key={k} style={{ display: "contents" }}>{n}</span>)}
      {rest.length > 0 && <span className="tag off" title={rest.map(r => r[2]).join(", ")}>+{rest.length}</span>}
    </div>
  );
}
