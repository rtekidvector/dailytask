import { useEffect, useState, type ReactNode } from "react";
import { BellRing, Bookmark, CheckCircle2, Copy, ListChecks, MessageSquare, Pencil, Sparkles, Undo2, UserRound, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loadTemplates, saveTemplates } from "../lib/templates";
import { PRIORITIES, type ActivityDTO, type TaskDTO } from "@shared/schemas";
import { useTaskActions } from "../lib/actions";
import { NEXT, STATUS, fmtShort, fmtTime, host } from "../lib/format";
import { patchTaskLocally, useMeta, useTask, useTaskActivity } from "../lib/queries";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import { Comments } from "./Comments";
import { TaskTimer } from "./TimeTracker";
import { ProofPanel } from "./ProofPanel";
import { TimeTags } from "./TaskTags";
import { Avatar, ConfirmButton } from "./ui";

const ICON: Record<string, ReactNode> = { created: <Sparkles size={14} />, status: <CheckCircle2 size={14} />, edited: <Pencil size={14} />, assigned: <UserRound size={14} />, returned: <Undo2 size={14} />, comment: <MessageSquare size={14} />, subtask: <ListChecks size={14} /> };

export function TaskDrawer({ id }: { id: string }) {
  const { closeTask } = useUi();
  const q = useTask(id), act = useTaskActivity(id), meta = useMeta(true);
  const t = q.data;
  useEffect(() => { const on = (e: KeyboardEvent) => e.key === "Escape" && closeTask(); window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [closeTask]);
  return (
    <>
      <div className="scrim" onClick={closeTask} />
      <aside className="drawer" role="dialog" aria-label="Detail tugas">
        {!t ? <div className="drawer-h"><h2>{q.isError ? "Tugas tidak ditemukan" : "Memuat…"}</h2><button className="iconbtn" onClick={closeTask} aria-label="Tutup"><X size={18} /></button></div>
          : <DrawerBody t={t} key={t.id} activity={act.data ?? []} owner={meta.data?.owner ?? { name: "Pemilik", email: "" }} />}
      </aside>
    </>
  );
}

function DrawerBody({ t, activity, owner }: { t: TaskDTO; activity: ActivityDTO[]; owner: { name: string; email: string } }) {
  const { me, team, policy, projects, labels, member } = useViewer();
  const { closeTask, newTask } = useUi();
  const a = useTaskActions(t);
  const qc = useQueryClient();
  const [proofOpen, setProofOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [sub, setSub] = useState("");
  const canEdit = policy.canManage(t.email) || (me.email === t.email && !!me.member && t.by === "self");
  const manager = policy.canManage(t.email);
  const work = manager || (me.email === t.email && !!me.member);
  const who = member(t.email);
  const people = team.filter(m => !m.isAdmin && policy.canManage(m.email));
  const done = t.subtasks.filter(s => s.done).length;
  const photo = t.hasPhoto ? `/api/tasks/${t.id}/proof` : null;
  const cycle = () => { const next = NEXT[t.status]; if (!manager && next === "done") return setProofOpen(true); a.setStatus.mutate(next); };
  const onBlur = (field: "title" | "note") => (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const v = e.target.value.trim();
    if (field === "title" && !v) { e.target.value = t.title; return; }
    if (v !== t[field]) a.patch.mutate({ [field]: v });
  };
  return (
    <>
      <div className="drawer-h">
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <div><button className={"status " + t.status} onClick={cycle} disabled={!work} aria-label={`Status: ${STATUS[t.status]}. Ketuk untuk ganti.`}>{STATUS[t.status]}</button></div>
          {canEdit
            ? <textarea className="input titlefield" rows={3} defaultValue={t.title} maxLength={120} onBlur={onBlur("title")} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} aria-label="Judul tugas" />
            : <h2>{t.title}</h2>}
          <div className="meta"><TimeTags t={t} />{t.routineId && <span className="tag rut">Rutin</span>}{t.by === "self" && <span className="tag off">Buatan sendiri</span>}{t.fromAdmin && <span className="tag off" title={"Dari " + t.fromAdmin}>Dari {t.fromAdmin}</span>}</div>
        </div>
        <button className="iconbtn" onClick={closeTask} aria-label="Tutup"><X size={18} /></button>
      </div>
      <div className="drawer-b">
        <section className="props">
          <span>Ditugaskan</span>
          {manager && people.length > 1
            ? <select className="input" value={t.email} onChange={e => a.patch.mutate({ email: e.target.value })}>{people.concat(who && !people.some(p => p.email === who.email) ? [who] : []).map(m => <option key={m.email} value={m.email}>{m.name}</option>)}</select>
            : <div className="chips">{who && <Avatar m={who} />}<b>{who?.name ?? t.email}</b></div>}
          <span>Tanggal</span>
          {canEdit ? <input className="input" type="date" defaultValue={t.date} onBlur={e => e.target.value && e.target.value !== t.date && a.patch.mutate({ date: e.target.value })} /> : <b>{fmtShort(t.date)}</b>}
          <span>Jam kerja</span>
          {canEdit
            ? <div className="row" style={{ gap: 8 }}>
                <input className="input timein" type="time" defaultValue={t.start ?? ""} aria-label="Mulai" onBlur={e => (e.target.value || null) !== t.start && a.patch.mutate({ start: e.target.value || null })} />
                <span>–</span>
                <input className="input timein" type="time" defaultValue={t.due ?? ""} aria-label="Selesai" onBlur={e => (e.target.value || null) !== t.due && a.patch.mutate({ due: e.target.value || null })} />
              </div>
            : <b>{t.start || t.due ? `${t.start ?? "…"} – ${t.due ?? "…"}` : "Tanpa jam"}</b>}
          <span>Prioritas</span>
          {canEdit
            ? <div className="chips">{PRIORITIES.map(p => <button key={p} className="chip" aria-pressed={t.priority === p} onClick={() => a.patch.mutate({ priority: p })}>{PRIORITY_LABEL[p]}</button>)}</div>
            : <span className={"tag " + t.priority} style={{ justifySelf: "start" }}>{PRIORITY_LABEL[t.priority]}</span>}
          <span>Proyek</span>
          {canEdit
            ? <select className="input" value={t.projectId ?? ""} onChange={e => a.patch.mutate({ projectId: e.target.value || null })}><option value="">Tanpa proyek</option>{projects.filter(p => !p.archived || p.id === t.projectId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            : <b>{projects.find(p => p.id === t.projectId)?.name ?? "—"}</b>}
          <span>Label</span>
          <div className="chips">
            {labels.length === 0 && <span className="muted">Belum ada label</span>}
            {labels.map(l => {
              const on = t.labelIds.includes(l.id);
              return canEdit || on ? <button key={l.id} className="chip" data-c={l.color} aria-pressed={on} disabled={!canEdit} onClick={() => a.patch.mutate({ labelIds: on ? t.labelIds.filter(x => x !== l.id) : [...t.labelIds, l.id] })}><i className="sw" />{l.name}</button> : null;
            })}
          </div>
          {manager && <><span>Wajib bukti</span><label className="check"><input type="checkbox" checked={t.needProof} onChange={e => a.patch.mutate({ needProof: e.target.checked })} />Karyawan harus melampirkan bukti</label></>}
        </section>

        <section>
          <span className="lbl">Deskripsi</span>
          {canEdit ? <textarea className="input" defaultValue={t.note} rows={3} maxLength={600} placeholder="Detail, link brief, atau target" onBlur={onBlur("note")} /> : <p>{t.note || <span className="muted">Tidak ada deskripsi.</span>}</p>}
        </section>

        <TaskTimer t={t} canWork={work} />

        <section>
          <span className="lbl">Checklist{t.subtasks.length > 0 && ` · ${done}/${t.subtasks.length}`}</span>
          {t.subtasks.length > 0 && <div className="stackbar"><i className="s-done" style={{ width: `${(done / t.subtasks.length) * 100}%` }} /></div>}
          {t.subtasks.map(s => (
            <label key={s.id} className={"check-row" + (s.done ? " done" : "")}>
              <input type="checkbox" key={s.id + s.done} defaultChecked={s.done} disabled={!work} onChange={e => { patchTaskLocally(qc, t.id, { subtasks: t.subtasks.map(x => x.id === s.id ? { ...x, done: e.target.checked } : x) }); a.toggleSubtask.mutate({ sid: s.id, done: e.target.checked }); }} />
              <span>{s.title}</span>
              {work && <button type="button" className="del" aria-label={"Hapus " + s.title} onClick={() => a.removeSubtask.mutate(s.id)}>✕</button>}
            </label>
          ))}
          {work && <form className="quick" onSubmit={e => { e.preventDefault(); if (sub.trim()) a.addSubtask.mutate(sub.trim(), { onSuccess: () => setSub("") }); }}>
            <input className="input" value={sub} onChange={e => setSub(e.target.value)} placeholder="Tambah langkah…" maxLength={160} style={{ flex: 1 }} /><button className="btn small" type="submit">Tambah</button>
          </form>}
        </section>

        <section>
          <span className="lbl">Bukti dan catatan</span>
          {t.proofAt && (
            <div className="proof">
              {photo && <button className="thumb" style={{ width: 84, height: 84 }} onClick={() => setLightbox(true)} aria-label="Lihat foto bukti"><img src={photo} alt={"Bukti: " + t.title} /></button>}
              <div className="pmeta"><span>Bukti · {fmtTime(t.proofAt)}</span>{t.proofLink && <a href={t.proofLink} target="_blank" rel="noopener noreferrer">{host(t.proofLink)}</a>}</div>
            </div>
          )}
          {!t.proofAt && t.status === "done" && <p className="muted">Selesai tanpa bukti.</p>}
          {work && <textarea className="input" rows={2} maxLength={600} defaultValue={t.report ?? ""} placeholder="Catatan progres, kendala, atau link hasil kerja" aria-label="Catatan" onBlur={e => e.target.value.trim() !== (t.report ?? "") && a.saveReport.mutate(e.target.value.trim())} />}
          {!work && t.report && <div className="report"><p>{t.report}</p></div>}
          {proofOpen && <ProofPanel t={t} onClose={() => setProofOpen(false)} />}
        </section>

        <section>
          <span className="lbl">Komentar</span>
          <Comments t={t} ownerName={owner.name} ownerEmail={owner.email} />
        </section>

        <section className="timeline">
          <span className="lbl">Aktivitas</span>
          <ul>{activity.map(x => (
            <li key={x.id}><span className="tl-ic">{ICON[x.kind] ?? <Pencil size={14} />}</span><div><b>{x.actorName}</b> {x.text}<small>{new Date(x.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div></li>
          ))}</ul>
        </section>
      </div>
      <footer className="drawer-f">
        {work && t.status !== "done" && !proofOpen && <button className="btn primary" onClick={() => (manager ? a.setStatus.mutate("done") : setProofOpen(true))}>Tandai selesai</button>}
        {manager && t.status !== "done" && t.email !== me.email && <button className="btn" onClick={() => a.nudge.mutate()} disabled={a.nudge.isPending}><BellRing size={14} />Ingatkan</button>}
        {manager && t.status === "done" && t.by !== "self" && <ConfirmButton className="btn" label="Kembalikan untuk diperbaiki" armed="Yakin kembalikan?" onConfirm={() => a.giveBack.mutate()} />}
        {(manager || me.member) && <button className="btn" onClick={() => { newTask({ emails: [t.email], title: t.title.slice(0, 108) + " (salinan)", note: t.note, priority: t.priority, projectId: t.projectId ?? undefined, labelIds: t.labelIds, steps: t.subtasks.map(s => s.title), start: t.start ?? undefined, due: t.due ?? undefined }); closeTask(); }}><Copy size={14} />Duplikat</button>}
        <button className="btn" onClick={() => { saveTemplates([{ title: t.title, note: t.note, priority: t.priority, projectId: t.projectId ?? undefined, labelIds: t.labelIds, steps: t.subtasks.map(s => s.title), start: t.start ?? undefined, due: t.due ?? undefined }, ...loadTemplates().filter(x => x.title !== t.title)]); toast.success("Disimpan sebagai templat"); }}><Bookmark size={14} />Simpan templat</button>
        {canEdit && <ConfirmButton className="btn danger" label="Hapus tugas" armed="Yakin hapus?" onConfirm={() => a.remove.mutate(undefined, { onSuccess: closeTask })} />}
      </footer>
      {lightbox && photo && <div className="lightbox" role="dialog" onClick={() => setLightbox(false)}><img src={photo} alt="Foto bukti" /><button className="iconbtn" aria-label="Tutup"><X size={18} /></button></div>}
    </>
  );
}
