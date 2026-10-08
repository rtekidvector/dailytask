import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { Leaf, Target, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, STATUSES, type Priority, type Status, type TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { api, ok } from "../lib/api";
import { STATUS, fmtShort, today } from "../lib/format";
import { patchTaskLocally, useAction, useTasks, windowFrom, keys } from "../lib/queries";
import { PRIORITY_LABEL, PRIORITY_RANK, subtaskProgress, weekStart } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";

const COL_TINT: Record<Status, string> = { todo: "gray", doing: "sky", done: "mint" };

function Card({ t, drag }: { t: TaskDTO; drag?: boolean }) {
  const { member, project, label } = useViewer();
  const m = member(t.email), p = project(t.projectId), sp = subtaskProgress(t);
  return (
    <div className={"kcard" + (p ? "" : " plain") + (t.status === "done" ? " done" : "") + (drag ? " drag" : "")} data-c={p?.color}>
      <div className="top">
        <h4 className="clamp2" title={t.title}>{t.title}</h4>
        {(t.priority === "urgent" || t.priority === "high") && <span className={"tag " + t.priority}>{PRIORITY_LABEL[t.priority]}</span>}
      </div>
      {sp.total > 0 && <div className="ticks" aria-label={`Checklist ${sp.done} dari ${sp.total}`}>{Array.from({ length: sp.total }, (_, i) => <i key={i} className={i < sp.done ? "on" : ""} />)}</div>}
      {(p || t.labelIds.length > 0) && (
        <div className="badges">
          {p && <span className="pbadge" title={p.name}>{p.name}</span>}
          {t.labelIds.slice(0, 2).map(id => { const l = label(id); return l ? <span key={id} className="pbadge" title={l.name}>#{l.name}</span> : null; })}
          {t.labelIds.length > 2 && <span className="pbadge">+{t.labelIds.length - 2}</span>}
        </div>
      )}
      <div className="foot2">
        {m && <Avatar m={m} />}
        <div className="who"><b className="clamp1">{m?.name ?? t.email}</b><small className="clamp1">{fmtShort(t.date)}{t.start || t.due ? ` · ${t.start ?? ""}${t.start && t.due ? "–" : ""}${t.due ?? ""}` : ""}{t.comments.length ? ` · 💬 ${t.comments.length}` : ""}</small></div>
      </div>
    </div>
  );
}

function DraggableCard({ t, canDrag }: { t: TaskDTO; canDrag: boolean }) {
  const { openTask } = useUi();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canDrag });
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners} onClick={() => openTask(t.id)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter") openTask(t.id); else listeners?.onKeyDown?.(e); }} aria-label={t.title}>
      <Card t={t} />
    </div>
  );
}

function Column({ status, tasks, canDrag }: { status: Status; tasks: TaskDTO[]; canDrag: (t: TaskDTO) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className="col" data-c={COL_TINT[status]} data-over={isOver} aria-label={STATUS[status]}>
      <div className="col-h">{STATUS[status]}<span>{tasks.length}</span></div>
      {tasks.map(t => <DraggableCard key={t.id} t={t} canDrag={canDrag(t)} />)}
      {!tasks.length && <Empty icon={status === "done" ? <Target size={22} /> : status === "doing" ? <Wrench size={22} /> : <Leaf size={22} />} title={status === "done" ? "Belum ada yang selesai" : status === "doing" ? "Tidak ada yang sedang dikerjakan" : "Semua sudah berjalan"}>Seret kartu ke sini untuk mengubah status.</Empty>}
    </section>
  );
}

export function Board() {
  const { me, team, policy, projects, labels } = useViewer();
  const { date, openTask } = useUi();
  const qc = useQueryClient();
  const [range, setRange] = useState<"hari" | "minggu" | "aktif">("minggu");
  const [who, setWho] = useState(""), [proj, setProj] = useState(""), [lab, setLab] = useState(""), [prio, setPrio] = useState<Priority | "">(""), [q, setQ] = useState("");
  const [dragging, setDragging] = useState<TaskDTO | null>(null);
  const tq = useTasks(windowFrom(date, today()), true);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));
  const move = useAction((v: { id: string; status: Status }) => ok(api.tasks[":id"].status.$patch({ param: { id: v.id }, json: { status: v.status } })), { refresh: [keys.tasks, keys.activity, keys.analytics] });

  const people = team.filter(m => !m.isAdmin && policy.canSee(m.email));
  const wk = weekStart(date);
  const tasks = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tq.data ?? []).filter(t => {
      if (range === "hari" && !(t.date === date || (date === today() && t.date < date && t.status !== "done"))) return false;
      if (range === "minggu" && !((t.date >= wk && t.date <= addDays(wk, 6)) || (t.status !== "done" && t.date < wk && date >= today()))) return false;
      if (range === "aktif" && t.status === "done" && t.date < addDays(today(), -7)) return false;
      if (who && t.email !== who) return false;
      if (proj && t.projectId !== (proj === "none" ? null : proj)) return false;
      if (lab && !t.labelIds.includes(lab)) return false;
      if (prio && t.priority !== prio) return false;
      return !s || t.title.toLowerCase().includes(s);
    }).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.start ?? a.due ?? "99").localeCompare(b.start ?? b.due ?? "99"));
  }, [tq.data, range, date, wk, who, proj, lab, prio, q]);

  const canDrag = (t: TaskDTO) => policy.canManage(t.email) || (me.email === t.email && !!me.member);
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    const t = tasks.find(x => x.id === e.active.id), to = e.over?.id as Status | undefined;
    if (!t || !to || !STATUSES.includes(to) || to === t.status) return;
    if (to === "done" && !policy.canManage(t.email)) { toast("Selesaikan lewat panel tugas agar bisa melampirkan bukti."); openTask(t.id); return; }
    patchTaskLocally(qc, t.id, { status: to });
    move.mutate({ id: t.id, status: to });
  };
  const onStart = (e: DragStartEvent) => setDragging(tasks.find(t => t.id === e.active.id) ?? null);
  return (
    <Page title="Papan tugas" sub="Seret kartu antar kolom untuk mengubah status. Ketuk kartu untuk detail." dateNav>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Rentang">
          {([["hari", "Hari"], ["minggu", "Minggu"], ["aktif", "Semua aktif"]] as const).map(([k, l]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        <input className="input" style={{ width: 200 }} placeholder="Cari judul…" value={q} onChange={e => setQ(e.target.value)} aria-label="Cari judul" />
        <div className="grow">
          {policy.isManager && <select className="input" style={{ width: "auto" }} value={who} onChange={e => setWho(e.target.value)} aria-label="Orang"><option value="">Semua orang</option>{people.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}</select>}
          <select className="input" style={{ width: "auto" }} value={proj} onChange={e => setProj(e.target.value)} aria-label="Proyek"><option value="">Semua proyek</option><option value="none">Tanpa proyek</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {labels.length > 0 && <select className="input" style={{ width: "auto" }} value={lab} onChange={e => setLab(e.target.value)} aria-label="Label"><option value="">Semua label</option>{labels.map(l => <option key={l.id} value={l.id}>#{l.name}</option>)}</select>}
          <select className="input" style={{ width: "auto" }} value={prio} onChange={e => setPrio(e.target.value as Priority | "")} aria-label="Prioritas"><option value="">Semua prioritas</option>{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
        </div>
      </div>
      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
        <div className="board">
          {STATUSES.map(s => <Column key={s} status={s} tasks={tasks.filter(t => t.status === s)} canDrag={canDrag} />)}
        </div>
        <DragOverlay>{dragging ? <Card t={dragging} drag /> : null}</DragOverlay>
      </DndContext>
    </Page>
  );
}
