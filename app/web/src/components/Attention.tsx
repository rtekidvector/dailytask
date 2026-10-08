import { BellRing, CalendarOff, CheckCheck, Flame, Undo2 } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { addDays, atMs } from "@shared/time";
import { api, ok } from "../lib/api";
import { fmtShort, today } from "../lib/format";
import { keys, useAction, useLeaves } from "../lib/queries";
import { LEAVE_LABEL } from "../lib/leaves";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar, Empty } from "./ui";

const DAY = 86_400_000;
/** What a manager has to act on: late work (nudge), finished work to review (accept or send back), urgent work not started. */
export function attention(tasks: TaskDTO[], canManage: (e: string) => boolean) {
  const now = Date.now(), t0 = today(), mine = tasks.filter(t => canManage(t.email));
  const late = mine.filter(t => t.status !== "done" && (t.date < t0 || (t.due && now > atMs(t.date, t.due)))).sort((a, b) => a.date.localeCompare(b.date));
  const review = mine.filter(t => t.status === "done" && t.by !== "self" && t.doneAt && now - t.doneAt < 3 * DAY).sort((a, b) => b.doneAt! - a.doneAt!);
  const stuck = mine.filter(t => t.status === "todo" && (t.priority === "urgent" || t.priority === "high") && t.date <= addDays(t0, 1) && !late.includes(t));
  return { late, review, stuck };
}

function Row({ t, children, note }: { t: TaskDTO; children: React.ReactNode; note: string }) {
  const { member } = useViewer(), { openTask } = useUi(), m = member(t.email);
  return (
    <li className="arow">
      {m ? <Avatar m={m} /> : <span className="avatar">?</span>}
      <div style={{ minWidth: 0 }}><button className="linkbtn clamp1" style={{ textAlign: "left", maxWidth: "100%", textDecoration: "none" }} onClick={() => openTask(t.id)} title={t.title}>{t.title}</button>
        <small className="muted clamp1">{m?.name ?? t.email} · {note}</small></div>
      <div className="chips" style={{ flexWrap: "nowrap" }}>{children}</div>
    </li>
  );
}

export function Attention({ tasks }: { tasks: TaskDTO[] }) {
  const { policy } = useViewer();
  const { late, review, stuck } = attention(tasks, policy.canManage);
  const { me, member } = useViewer();
  const waiting = (useLeaves(true).data ?? []).filter(l => l.status === "pending" && l.email !== me.email && policy.canManage(l.email));
  const decide = useAction((v: { id: string; status: "approved" | "rejected" }) => ok(api.leaves[":id"].decision.$patch({ param: { id: v.id }, json: { status: v.status } })), { refresh: [keys.leaves, keys.inbox], done: "Keputusan tersimpan" });
  const nudge = useAction((id: string) => ok(api.tasks[":id"].nudge.$post({ param: { id } })), { done: "Pengingat terkirim", refresh: [keys.activity, keys.inbox] });
  const back = useAction((id: string) => ok(api.tasks[":id"].return.$post({ param: { id } })), { done: "Dikembalikan untuk diperbaiki", refresh: [keys.tasks, keys.activity, keys.analytics] });
  const days = (d: string) => { const n = Math.round((atMs(today(), "12:00") - atMs(d, "12:00")) / DAY); return n > 0 ? `terlambat ${n} hari` : "lewat jam tenggat"; };
  return (
    <div className="two2">
      <section className="bc">
        <div className="bc-h"><span className="bc-ico red"><BellRing size={18} /></span><h3>Terlambat</h3><span className="muted">{late.length}</span></div>
        <ul className="alist">{late.slice(0, 8).map(t => <Row key={t.id} t={t} note={days(t.date)}><button className="btn small" disabled={nudge.isPending} onClick={() => nudge.mutate(t.id)}>Ingatkan</button></Row>)}</ul>
        {!late.length && <Empty art="tasks" title="Tidak ada yang terlambat" />}
      </section>
      <section className="bc">
        <div className="bc-h"><span className="bc-ico green"><CheckCheck size={18} /></span><h3>Perlu ditinjau</h3><span className="muted">3 hari terakhir · {review.length}</span></div>
        <ul className="alist">{review.slice(0, 8).map(t => <Row key={t.id} t={t} note={`selesai ${fmtShort(t.date)}${t.hasPhoto || t.proofLink ? " · ada bukti" : " · tanpa bukti"}`}>
          <button className="btn small" disabled={back.isPending} onClick={() => back.mutate(t.id)}><Undo2 size={13} />Kembalikan</button></Row>)}</ul>
        {!review.length && <Empty art="activity" title="Belum ada yang perlu ditinjau" />}
      </section>
      {waiting.length > 0 && (
        <section className="bc s12">
          <div className="bc-h"><span className="bc-ico"><CalendarOff size={18} /></span><h3>Pengajuan izin & cuti</h3><span className="muted">{waiting.length}</span></div>
          <ul className="alist">{waiting.slice(0, 6).map(l => { const m = member(l.email); return (
            <li key={l.id} className="arow">{m ? <Avatar m={m} /> : <span className="avatar">?</span>}
              <div style={{ minWidth: 0 }}><b className="clamp1">{m?.name ?? l.email} · {LEAVE_LABEL[l.kind]}</b><small className="muted clamp1">{l.from === l.to ? fmtShort(l.from) : `${fmtShort(l.from)} – ${fmtShort(l.to)}`}{l.reason ? ` · ${l.reason}` : ""}</small></div>
              <div className="chips" style={{ flexWrap: "nowrap" }}><button className="btn small primary" disabled={decide.isPending} onClick={() => decide.mutate({ id: l.id, status: "approved" })}>Setujui</button><button className="btn small" disabled={decide.isPending} onClick={() => decide.mutate({ id: l.id, status: "rejected" })}>Tolak</button></div></li>); })}</ul>
        </section>
      )}
      <section className="bc s12">
        <div className="bc-h"><span className="bc-ico lime"><Flame size={18} /></span><h3>Mendesak, belum dimulai</h3><span className="muted">{stuck.length}</span></div>
        <ul className="alist">{stuck.slice(0, 8).map(t => <Row key={t.id} t={t} note={`${PRIORITY_LABEL[t.priority]} · ${fmtShort(t.date)}`}><button className="btn small" disabled={nudge.isPending} onClick={() => nudge.mutate(t.id)}>Ingatkan</button></Row>)}</ul>
        {!stuck.length && <Empty art="calendar" title="Semua yang mendesak sudah berjalan" />}
      </section>
    </div>
  );
}
