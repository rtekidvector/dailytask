import { Flame, Medal, Target } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { addDays, atMs } from "@shared/time";
import { today } from "../lib/format";
import { PRIORITY_RANK, weekStart } from "../lib/tasks";
import { useUi } from "../lib/viewer";

/** Member's own progress: current streak of days with something finished, this week's goal, and a few badges. */
export function Achievements({ tasks, date }: { tasks: TaskDTO[]; date: string }) {
  const { openTask } = useUi();
  const t0 = today(), done = tasks.filter(t => t.status === "done");
  const doneDays = new Set(done.map(t => t.date));
  let streak = 0;
  for (let d = doneDays.has(t0) ? t0 : addDays(t0, -1); doneDays.has(d); d = addDays(d, -1)) streak++;
  const wk = weekStart(date), week = tasks.filter(t => t.date >= wk && t.date <= addDays(wk, 6)), weekDone = week.filter(t => t.status === "done").length;
  const onTime = done.filter(t => !t.due || (t.doneAt ?? 0) <= atMs(t.date, t.due)).length, rate = done.length ? Math.round(onTime / done.length * 100) : null;
  const badges = [
    { on: streak >= 3, label: "3 hari beruntun" }, { on: streak >= 7, label: "7 hari beruntun" },
    { on: done.length >= 10, label: "10 tugas selesai" }, { on: done.length >= 25, label: "25 tugas selesai" },
    { on: rate !== null && rate >= 90 && done.length >= 5, label: "Tepat waktu 90%" }, { on: week.length > 0 && weekDone === week.length, label: "Pekan bersih" },
  ];
  const focus = tasks.filter(t => t.status !== "done" && t.date <= t0).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due ?? "99").localeCompare(b.due ?? "99")).slice(0, 3);
  return (
    <div className="two2">
      <section className="bc">
        <div className="bc-h"><span className="bc-ico lime"><Target size={18} /></span><h3>Fokus hari ini</h3></div>
        <ol className="focus">{focus.map((t, i) => <li key={t.id}><span className="n">{i + 1}</span><button className="linkbtn clamp1" style={{ textDecoration: "none", textAlign: "left" }} onClick={() => openTask(t.id)}>{t.title}</button><small className="muted">{t.due ? "sebelum " + t.due : "tanpa jam"}</small></li>)}</ol>
        {!focus.length && <p className="muted" style={{ fontSize: ".84rem" }}>Tidak ada tugas yang menunggu. Kerja bagus!</p>}
      </section>
      <section className="bc">
        <div className="bc-h"><span className="bc-ico"><Medal size={18} /></span><h3>Pencapaian</h3></div>
        <div className="statrow" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat"><span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{streak}<Flame size={20} color="var(--c-peach)" /></span><span className="k">hari beruntun</span></div>
          <div className="stat"><span className="v">{weekDone}<small className="muted" style={{ fontSize: "1rem" }}>/{week.length}</small></span><span className="k">target pekan ini</span></div>
          <div className="stat"><span className="v">{rate === null ? "–" : rate + "%"}</span><span className="k">tepat waktu</span></div>
        </div>
        <div className="chips">{badges.map(b => <span key={b.label} className={"badge" + (b.on ? " on" : "")} title={b.on ? "Diraih" : "Belum diraih"}>{b.label}</span>)}</div>
      </section>
    </div>
  );
}
