import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { addDays, parseYmd, ymd } from "@shared/time";
import { Page } from "../components/Page";
import { api, ok } from "../lib/api";
import { DAYN, today } from "../lib/format";
import { keys, patchTaskLocally, useAction, useTasks, windowFrom } from "../lib/queries";
import { weekStart } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";

const H0 = 6, H1 = 22, ROW = 56;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const MAX_LANES = 2;
interface Ev { t: TaskDTO; s: number; e: number; lane: number; lanes: number; cluster: number }
interface Overflow { top: number; items: Ev[] }
/** Places a day's timed tasks side by side when they overlap. */
function layout(tasks: TaskDTO[]): { shown: Ev[]; overflow: Overflow[] } {
  const evs = tasks.map(t => {
    const s = t.start ? mins(t.start) : mins(t.due!) - 45;
    const e = t.start && t.due ? mins(t.due) : t.start ? s + 60 : mins(t.due!);
    return { t, s: Math.max(H0 * 60, s), e: Math.max(Math.max(H0 * 60, s) + 30, e), lane: 0, lanes: 1, cluster: 0 };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster: Ev[] = [], end = 0, id = 0;
  const flush = () => { const n = Math.max(1, ...cluster.map(c => c.lane + 1)); cluster.forEach(c => (c.lanes = Math.min(n, MAX_LANES))); cluster = []; id++; };
  for (const ev of evs) {
    if (cluster.length && ev.s >= end) flush();
    const used = new Set(cluster.filter(c => c.e > ev.s).map(c => c.lane));
    while (used.has(ev.lane)) ev.lane++;
    ev.cluster = id; cluster.push(ev); end = Math.max(end, ev.e);
  }
  flush();
  // Anything beyond the lane limit is tucked into a "+N" chip so the grid stays readable.
  const hidden = evs.filter(e => e.lane >= MAX_LANES), overflow = new Map<number, Overflow>();
  for (const h of hidden) { const o = overflow.get(h.cluster) ?? { top: Math.min(...evs.filter(e => e.cluster === h.cluster).map(e => (e.s - H0 * 60) / 60 * ROW)), items: [] }; o.items.push(h); overflow.set(h.cluster, o); }
  return { shown: evs.filter(e => e.lane < MAX_LANES), overflow: [...overflow.values()] };
}

function Event({ ev, canDrag }: { ev: Ev; canDrag: boolean }) {
  const { openTask } = useUi();
  const { project, member } = useViewer();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ev.t.id, disabled: !canDrag });
  const p = project(ev.t.projectId);
  const top = (ev.s - H0 * 60) / 60 * ROW, height = Math.max(26, (ev.e - ev.s) / 60 * ROW - 3);
  return (
    <button ref={setNodeRef} className={"ev" + (ev.t.status === "done" ? " done" : ev.t.status === "doing" ? " doing" : "")} data-c={p?.color ?? "lilac"}
      style={{ top, height, left: `calc(${(ev.lane / ev.lanes) * 100}% + 3px)`, width: `calc(${100 / ev.lanes}% - 6px)`, right: "auto", opacity: isDragging ? 0.35 : 1 }}
      onClick={() => openTask(ev.t.id)} title={`${ev.t.title} · ${hm(ev.s)}–${hm(ev.e)}`} {...attributes} {...listeners}>
      <b>{ev.t.title}</b><small>{hm(ev.s)}–{hm(ev.e)} · {member(ev.t.email)?.name}</small>
    </button>
  );
}

function MoreChip({ o }: { o: Overflow }) {
  const [open, setOpen] = useState(false);
  const { openTask } = useUi();
  const { member } = useViewer();
  return (
    <div className="morechip" style={{ top: o.top + 2 }}>
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={`${o.items.length} tugas lainnya`}>+{o.items.length}</button>
      {open && <ul className="evpop">{o.items.map(ev => <li key={ev.t.id}><button onClick={() => { setOpen(false); openTask(ev.t.id); }}><b className="clamp1">{ev.t.title}</b><small>{hm(ev.s)}–{hm(ev.e)} · {member(ev.t.email)?.name}</small></button></li>)}</ul>}
    </div>
  );
}

function Slot({ id, onNew }: { id: string; onNew: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className="slot" data-over={isOver} onDoubleClick={onNew} />;
}
function AllDay({ date, tasks }: { date: string; tasks: TaskDTO[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day:" + date });
  const { openTask } = useUi();
  const { project } = useViewer();
  return (
    <div ref={setNodeRef} style={isOver ? { background: "var(--lime)", opacity: .6 } : undefined}>
      {tasks.map(t => <AllDayChip key={t.id} t={t} tint={project(t.projectId)?.color} onOpen={() => openTask(t.id)} />)}
    </div>
  );
}
function AllDayChip({ t, tint, onOpen }: { t: TaskDTO; tint?: string; onOpen: () => void }) {
  const { policy, me } = useViewer();
  const canDrag = policy.canManage(t.email) || (me.email === t.email && t.by === "self");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canDrag });
  return <button ref={setNodeRef} className="evchip" data-c={tint ?? "lilac"} style={{ opacity: isDragging ? 0.35 : t.status === "done" ? 0.55 : 1 }} onClick={onOpen} title={t.title} {...attributes} {...listeners}>{t.title}</button>;
}

export function CalendarPage() {
  const { me, team, policy, project } = useViewer();
  const { date, setDate, newTask } = useUi();
  const qc = useQueryClient();
  const wk = weekStart(date), days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const tq = useTasks(windowFrom(wk, today()), true);
  const [who, setWho] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }));
  useEffect(() => { if (body.current) body.current.scrollTop = ROW * 1.5; }, [wk]);

  const tasks = (tq.data ?? []).filter(t => !who || t.email === who);
  const move = useAction((v: { id: string; date: string; start: string | null; due: string | null }) =>
    ok(api.tasks[":id"].$patch({ param: { id: v.id }, json: { date: v.date, start: v.start, due: v.due } })), { refresh: [keys.tasks, keys.activity] });
  const canEdit = (t: TaskDTO) => policy.canManage(t.email) || (me.email === t.email && t.by === "self");

  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const t = tasks.find(x => x.id === e.active.id), over = String(e.over?.id ?? "");
    if (!t || !over || !canEdit(t)) return;
    if (over.startsWith("day:")) {
      const d = over.slice(4);
      patchTaskLocally(qc, t.id, { date: d, start: null, due: null });
      return move.mutate({ id: t.id, date: d, start: null, due: null });
    }
    const [, d, h] = over.split(":"), startM = Number(h) * 60;
    const dur = t.start && t.due ? mins(t.due) - mins(t.start) : 60;
    const start = hm(startM), due = hm(Math.min(23 * 60 + 59, startM + dur));
    patchTaskLocally(qc, t.id, { date: d!, start, due });
    move.mutate({ id: t.id, date: d!, start, due });
  };

  const [side, setSide] = useState(false);
  useEffect(() => { document.querySelector(".week-head .today")?.scrollIntoView({ inline: "center", block: "nearest" }); }, [date]);
  // mini month
  const m0 = parseYmd(date); m0.setDate(1);
  const gridStart = weekStart(ymd(m0));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const counts = useMemo(() => { const c = new Map<string, number>(); for (const t of tq.data ?? []) c.set(t.date, (c.get(t.date) ?? 0) + 1); return c; }, [tq.data]);
  const t0 = today();
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const people = team.filter(m => !m.isAdmin && policy.canSee(m.email));
  const dragged = tasks.find(t => t.id === dragId);
  const title = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });

  return (
    <Page title="Kalender" sub={`${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(parseYmd(days[0]!))} – ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(parseYmd(days[6]!))}`}
      actions={<>
        {policy.isManager && <select className="input" style={{ width: "auto" }} value={who} onChange={e => setWho(e.target.value)} aria-label="Orang"><option value="">Semua orang</option>{people.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}</select>}
        <div className="seg"><button onClick={() => setDate(addDays(wk, -7))} aria-label="Minggu lalu"><ChevronLeft size={16} /></button><button onClick={() => setDate(t0)}>Minggu ini</button><button onClick={() => setDate(addDays(wk, 7))} aria-label="Minggu depan"><ChevronRight size={16} /></button></div>
      </>}
      tabs={[{ id: "minggu", label: "Minggu" }]} tab="minggu">
      <button className="btn small calbtn" onClick={() => setSide(s => !s)} aria-expanded={side}>{side ? "Sembunyikan kalender bulan" : "Pilih tanggal"}</button>
      <div className="cal">
        <div className={"calside" + (side ? " open" : "")} style={{ display: "grid", gap: 14 }}>
          <div className="mini">
            <div className="mini-h"><button className="iconbtn" onClick={() => setDate(addDays(ymd(m0), -1))} aria-label="Bulan lalu"><ChevronLeft size={16} /></button>{title.format(m0)}<button className="iconbtn" onClick={() => setDate(addDays(ymd(m0), 32))} aria-label="Bulan depan"><ChevronRight size={16} /></button></div>
            <div className="mini-g">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map(d => <b key={d}>{d}</b>)}
              {cells.map(d => (
                <button key={d} className={(d.slice(0, 7) !== ymd(m0).slice(0, 7) ? "off " : "") + (d >= wk && d <= days[6]! ? "in-week " : "") + (d === t0 ? "today" : "")} onClick={() => setDate(d)} aria-label={d}>
                  {Number(d.slice(8))}{counts.has(d) && <i className="pip" />}
                </button>
              ))}
            </div>
          </div>
          <div className="mini"><b>Proyek</b>
            <div className="chips"><span className="tag proj" data-c="lilac">Tanpa proyek</span><PCProjects /></div>
            <p className="foot">Seret tugas ke jam lain untuk menjadwal ulang. Klik dua kali di kotak kosong untuk membuat tugas baru di jam itu. Biru = sedang dikerjakan.</p>
          </div>
        </div>
        <DndContext sensors={sensors} onDragStart={e => setDragId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setDragId(null)}>
          <div className="week">
            <div className="week-head"><div />{days.map((d, i) => <div key={d} className={d === t0 ? "today" : ""}>{DAYN[(i + 1) % 7]}<b>{Number(d.slice(8))}</b></div>)}</div>
            <div className="week-allday"><div>SEHARI</div>{days.map(d => <AllDay key={d} date={d} tasks={tasks.filter(t => t.date === d && !t.start && !t.due)} />)}</div>
            <div className="week-body" ref={body}>
              <div className="hours">{Array.from({ length: H1 - H0 }, (_, i) => <div key={i}>{String(H0 + i).padStart(2, "0")}:00</div>)}</div>
              {days.map(d => {
                const { shown: evs, overflow } = layout(tasks.filter(t => t.date === d && (t.start || t.due)));
                return (
                  <div key={d} className={"daycol" + (d === t0 ? " today" : "")}>
                    {Array.from({ length: H1 - H0 }, (_, i) => <Slot key={i} id={`slot:${d}:${H0 + i}`} onNew={() => newTask({ date: d, start: hm((H0 + i) * 60), due: hm((H0 + i + 1) * 60) })} />)}
                    {evs.map(ev => <Event key={ev.t.id} ev={ev} canDrag={canEdit(ev.t)} />)}
                    {overflow.map((o, i) => <MoreChip key={i} o={o} />)}
                    {d === t0 && nowMin >= H0 * 60 && nowMin < H1 * 60 && <div className="nowline" style={{ top: (nowMin - H0 * 60) / 60 * ROW }} />}
                  </div>
                );
              })}
            </div>
          </div>
          <DragOverlay>{dragged ? <div className="ev drag" data-c={project(dragged.projectId)?.color ?? "lilac"} style={{ position: "relative", height: 52 }}><b>{dragged.title}</b></div> : null}</DragOverlay>
        </DndContext>
      </div>
    </Page>
  );
}

function PCProjects() {
  const { projects } = useViewer();
  return <>{projects.filter(p => !p.archived).map(p => <span key={p.id} className="tag proj" data-c={p.color}>{p.name}</span>)}</>;
}
