import { Fragment, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type { MemberDTO, RoutineDTO, TaskDTO } from "@shared/schemas";
import { atMs } from "@shared/time";
import { fmtShort } from "../lib/format";
import { splitDay } from "../lib/tasks";
import { useUi } from "../lib/viewer";
import { PersonTasks } from "./PersonCard";
import { Avatar, tally } from "./ui";

/** One compact row per person; click a row to open their tasks right below it. */
export function PeopleTable({ people, byPerson, routines, date, loaded }: { people: MemberDTO[]; byPerson: Map<string, TaskDTO[]>; routines: RoutineDTO[]; date: string; loaded: boolean }) {
  const { newTask } = useUi();
  const [open, setOpen] = useState<string | null>(null);
  const now = Date.now();
  return (
    <section className="surface" style={{ padding: 0, overflow: "hidden" }} aria-label="Tugas per orang">
      <table className="ptable">
        <thead><tr>
          <th className="chev" /><th>Orang</th><th className="prg">Progres</th><th className="num">Selesai</th><th className="num">Dikerjakan</th><th className="num">Terlambat</th><th className="next">Tugas berikutnya</th><th className="act" />
        </tr></thead>
        <tbody>
          {people.map(m => {
            const tasks = byPerson.get(m.email) ?? [], { day, late } = splitDay(tasks, date), all = day.concat(late), c = tally(all);
            const overdue = all.filter(t => t.status !== "done" && t.due && now > atMs(t.date, t.due)).length;
            const next = all.find(t => t.status !== "done");
            const isOpen = open === m.email;
            return (
              <Fragment key={m.email}>
                <tr className={"ptr" + (isOpen ? " open" : "")} onClick={() => setOpen(isOpen ? null : m.email)} aria-expanded={isOpen}>
                  <td className="chev"><ChevronRight size={16} style={{ transition: "transform .15s" }} /></td>
                  <td><div className="who"><Avatar m={m} /><div><b className="clamp1">{m.name}</b><small className="clamp1">{[m.role, m.group].filter(Boolean).join(" · ")}</small></div></div></td>
                  <td className="prg"><div className="prog"><div className="stackbar"><i className="s-done" style={{ width: `${all.length ? c.done / all.length * 100 : 0}%` }} /><i className="s-doing" style={{ width: `${all.length ? c.doing / all.length * 100 : 0}%` }} /></div><span>{c.done}/{all.length}</span></div></td>
                  <td className={"num" + (c.done ? "" : " zero")}>{c.done}</td>
                  <td className={"num" + (c.doing ? "" : " zero")}>{c.doing}</td>
                  <td className={"num" + (overdue ? " bad" : " zero")}>{overdue}</td>
                  <td className="next"><span className="clamp1" title={next?.title}>{next ? <>{next.title}{next.date !== date && <span className="muted"> · {fmtShort(next.date)}</span>}</> : loaded ? "—" : "…"}</span></td>
                  <td className="act"><button className="iconbtn" aria-label={`Beri tugas untuk ${m.name}`} title={`Beri tugas untuk ${m.name}`} onClick={e => { e.stopPropagation(); newTask({ emails: [m.email] }); }}><Plus size={15} /></button></td>
                </tr>
                {isOpen && (
                  <tr className="detail"><td colSpan={8}>
                    <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
                      <PersonTasks m={m} tasks={tasks} routines={routines.filter(r => r.email === m.email)} date={date} loaded={loaded} />
                    </div>
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {!people.length && <p className="empty">Tidak ada orang di unit ini.</p>}
    </section>
  );
}
