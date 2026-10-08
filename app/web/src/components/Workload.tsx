import { useLocation } from "wouter";
import { addDays } from "@shared/time";
import { DAYN, fmtShort, today } from "../lib/format";
import { useLeaves, useTasks, windowFrom } from "../lib/queries";
import { awayOn } from "../lib/leaves";
import { weekStart } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar, PersonLink } from "./ui";

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const OVER_TASKS = 6, OVER_HOURS = 9;

/** People × next two weeks: darker cell = more open tasks that day; red ring = overloaded (many tasks or a long scheduled day). */
export function Workload() {
  const { team, policy } = useViewer();
  const { date, setDate } = useUi();
  const [, go] = useLocation();
  const tq = useTasks(windowFrom(date, today()), true);
  const start = weekStart(date), days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const leaves = useLeaves(true).data ?? [];
  const people = team.filter(m => !m.isAdmin && policy.canManage(m.email));
  const open = (tq.data ?? []).filter(t => t.status !== "done");
  const cell = (email: string, d: string) => {
    const l = open.filter(t => t.email === email && t.date === d);
    const h = l.reduce((s, t) => s + (t.start && t.due ? Math.max(0, mins(t.due) - mins(t.start)) : 0), 0) / 60;
    const away = !!awayOn(leaves, email, d);
    return { n: l.length, h, away, over: !away && (l.length >= OVER_TASKS || h > OVER_HOURS) };
  };
  return (
    <section className="bc">
      <div className="bc-h"><h3>Beban kerja dua minggu</h3><span className="legend"><span style={{ ["--k" as string]: "var(--blue)" }}>Makin gelap = makin banyak tugas</span><span style={{ ["--k" as string]: "var(--bad)" }}>Lebih dari {OVER_TASKS} tugas atau {OVER_HOURS} jam</span></span></div>
      <div className="heatwrap"><div className="heat" style={{ ["--n" as string]: days.length }} role="table" aria-label="Beban kerja">
        <div />{days.map(d => <div key={d} className={"hh" + (d === today() ? " today" : "")}>{DAYN[new Date(d + "T12:00:00").getDay()]}<b>{Number(d.slice(8))}</b></div>)}<div className="hh">Total</div>
        {people.map(m => {
          const cs = days.map(d => cell(m.email, d)), total = cs.reduce((s, c) => s + c.n, 0);
          return [
            <div key={m.email} className="hp"><Avatar m={m} /><span className="clamp1"><PersonLink email={m.email}>{m.name}</PersonLink></span></div>,
            ...cs.map((c, i) => <button key={m.email + days[i]} className={"hc" + (c.over ? " over" : "") + (c.away ? " away" : "")} style={{ ["--lv" as string]: Math.min(c.n / 5, 1) }}
              title={`${m.name} · ${fmtShort(days[i]!)}: ${c.away ? "tidak masuk, " : ""}${c.n} tugas${c.h ? `, ${c.h.toFixed(1)} jam terjadwal` : ""}`} onClick={() => { setDate(days[i]!); go("/kalender"); }}>{c.away ? "cuti" : c.n || ""}</button>),
            <div key={m.email + "t"} className="ht">{total}</div>,
          ];
        })}
      </div></div>
    </section>
  );
}
