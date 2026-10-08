import { useState } from "react";
import { Clock, Plus } from "lucide-react";
import type { MemberDTO, RoutineDTO, TaskDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN, fmtTime, isToday, today } from "../lib/format";
import { useAction } from "../lib/queries";
import { isIdle, splitDay } from "../lib/tasks";
import { Avatar, ConfirmButton, Ring, tally } from "./ui";
import { TaskRow } from "./TaskRow";

const SHOW = 3;

/** One-line quick add; the clock button reveals the optional start/end times. */
export function QuickAdd({ email, name }: { email: string; name: string }) {
  const [times, setTimes] = useState(false);
  const add = useAction((f: FormData) => ok(api.tasks.$post({ json: {
    emails: [email], title: String(f.get("title")), start: String(f.get("start") || "") || null, due: String(f.get("due") || "") || null,
  } })));
  return (
    <form className="quick compact" onSubmit={e => {
      e.preventDefault();
      const form = e.currentTarget, f = new FormData(form);
      if (!String(f.get("title")).trim()) return;
      add.mutate(f); form.reset(); setTimes(false);
    }}>
      <input className="input" name="title" placeholder={`Tugas cepat untuk ${name}…`} maxLength={120} aria-label={`Tambah tugas untuk ${name}`} />
      <button type="button" className="iconbtn" aria-pressed={times} aria-label="Atur jam" title="Atur jam" onClick={() => setTimes(t => !t)}><Clock size={16} /></button>
      <button className="iconbtn dark" type="submit" aria-label="Tambah"><Plus size={16} /></button>
      {times && <>
        <label className="tl"><span>Mulai</span><input className="input timein" name="start" type="time" aria-label={`Jam mulai tugas ${name}`} /></label>
        <label className="tl"><span>Selesai</span><input className="input timein" name="due" type="time" aria-label={`Jam selesai tugas ${name}`} /></label>
      </>}
    </form>
  );
}

/** Warning, tasks (first few, "see more"), routines and quick add for one person. Shared by the card and the table row. */
export function PersonTasks({ m, tasks, routines, date, loaded }: { m: MemberDTO; tasks: TaskDTO[]; routines: RoutineDTO[]; date: string; loaded: boolean }) {
  const { day, late } = splitDay(tasks, date);
  const [more, setMore] = useState(false);
  const all = day.concat(late);
  const stop = useAction((id: string) => ok(api.routines[":id"].$delete({ param: { id } })), { done: "Tugas rutin dihentikan", refresh: [["tasks"], ["routines"]] });
  const asked = isToday(m.askAt);
  const shownLate = more ? late : late.slice(0, SHOW), room = Math.max(0, SHOW - late.length);
  const shownDay = more ? day : day.slice(0, room);
  const hidden = all.length - shownLate.length - shownDay.length;
  return (
    <>
      {date === today() && loaded && isIdle(tasks) && (
        <div className="warnbox">
          <span className="warnico" aria-hidden="true">!</span>
          <div className="txt"><b>{asked ? `Minta tugas sejak ${fmtTime(m.askAt!)}` : "Tidak ada tugas aktif"}</b>{asked ? `${m.name} sudah menyelesaikan semua tugasnya.` : "Semua tugas selesai atau belum diberi tugas."}</div>
        </div>
      )}
      {shownLate.length > 0 && <><div className="sub">Belum selesai sebelumnya</div><ul className="tasks">{shownLate.map(t => <TaskRow key={t.id} t={t} canDelete isLate />)}</ul></>}
      {shownDay.length > 0 ? <ul className="tasks">{shownDay.map(t => <TaskRow key={t.id} t={t} canDelete />)}</ul>
        : !shownLate.length && <p className="empty">{loaded ? "Belum ada tugas di tanggal ini." : "Memuat…"}</p>}
      {(hidden > 0 || more) && all.length > SHOW && <button className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setMore(v => !v)}>{more ? "Ringkas" : `Lihat ${hidden} tugas lainnya`}</button>}
      {routines.length > 0 && (
        <div className="routines"><span>Rutin:</span>
          {routines.map(r => (
            <span className="rt" key={r.id}>
              {r.title}{r.start || r.due ? " " + [r.start, r.due].filter(Boolean).join("–") : ""} · {r.days.length === 7 ? "tiap hari" : [1, 2, 3, 4, 5, 6, 0].filter(d => r.days.includes(d)).map(d => DAYN[d]).join(" ")}
              <ConfirmButton className="" ariaLabel={"Hentikan tugas rutin " + r.title} label="×" armed="Yakin?" onConfirm={() => stop.mutate(r.id)} />
            </span>
          ))}
        </div>
      )}
      <QuickAdd email={m.email} name={m.name} />
    </>
  );
}

export function PersonCard({ m, tasks, routines, date, loaded }: { m: MemberDTO; tasks: TaskDTO[]; routines: RoutineDTO[]; date: string; loaded: boolean }) {
  const { day, late } = splitDay(tasks, date), all = day.concat(late), c = tally(all);
  return (
    <article className="card">
      <div className="card-h">
        <Avatar m={m} />
        <div className="nm"><h3>{m.name}</h3><p>{[m.role, m.group].filter(Boolean).join(" · ")}</p></div>
        <span className={"presence " + (m.seenAt ? "on" : "off")} title={m.seenAt ? "Sudah pernah membuka aplikasi" : "Belum membuka aplikasi"} />
        <Ring done={c.done} total={all.length} />
      </div>
      <PersonTasks m={m} tasks={tasks} routines={routines} date={date} loaded={loaded} />
    </article>
  );
}
