import type { MemberDTO, TaskDTO } from "@shared/schemas";
import { PersonLink } from "./ui";
import { addDays, parseYmd } from "@shared/time";
import { DAYN, fmtShort, isToday, today } from "../lib/format";
import { isIdle } from "../lib/tasks";

type Cell = { total: number; done: number };
const shade = (c: Cell) => {
  if (!c.total) return undefined;
  const p = c.done / c.total;
  return { background: `color-mix(in srgb, var(--blue) ${Math.round(10 + p * 75)}%, var(--surface))`, color: p >= 0.6 ? "#fff" : "var(--ink)" };
};

export function Recap({ people, tasks, date, days: n, onDays, onPick, loaded }: {
  people: MemberDTO[]; tasks: TaskDTO[]; date: string; days: 7 | 14; onDays: (n: 7 | 14) => void; onPick: (d: string) => void; loaded: boolean;
}) {
  const t0 = today();
  const days = Array.from({ length: n }, (_, i) => addDays(date, i - n + 1));
  const byPerson = Map.groupBy(tasks, t => t.email);
  const cellOf = (list: TaskDTO[], d: string): Cell => { const l = list.filter(x => x.date === d); return { total: l.length, done: l.filter(x => x.status === "done").length }; };
  const CellBtn = ({ label, c, d }: { label: string; c: Cell; d: string }) => {
    const text = `${label}, ${fmtShort(d)}: ${c.total ? `${c.done} dari ${c.total} selesai` : "tidak ada tugas"}`;
    return <button className={"cell" + (c.total ? "" : " none") + (d === date ? " sel" : "")} style={shade(c)} title={text} aria-label={text} onClick={() => onPick(d)}>{c.total ? `${c.done}/${c.total}` : "–"}</button>;
  };
  const Tot = ({ done, total }: { done: number; total: number }) => <td className="tot"><b>{total ? Math.round(done / total * 100) + "%" : "–"}</b><small>{done}/{total}</small></td>;

  let gDone = 0, gTot = 0;
  const col = days.map(() => ({ done: 0, total: 0 }));
  const rows = people.map(m => {
    const list = byPerson.get(m.email) ?? [];
    const cells = days.map((d, i) => { const c = cellOf(list, d); col[i]!.done += c.done; col[i]!.total += c.total; return c; });
    const done = cells.reduce((a, c) => a + c.done, 0), total = cells.reduce((a, c) => a + c.total, 0);
    gDone += done; gTot += total;
    const warn = date === t0 && loaded && isIdle(list);
    return (
      <tr key={m.email}>
        <th className="who" scope="row"><b><PersonLink email={m.email}>{m.name}</PersonLink>{warn && <span className="warnico" title={isToday(m.askAt) ? "Minta tugas" : "Tidak ada tugas aktif"} aria-label="Tidak ada tugas aktif">!</span>}</b><span>{m.role}</span></th>
        {cells.map((c, i) => <td key={days[i]}><CellBtn label={m.name} c={c} d={days[i]!} /></td>)}
        <Tot done={done} total={total} />
      </tr>
    );
  });
  return (
    <section className="recap" aria-label="Rekap">
      <div className="recap-h">
        <div><h2>Rekap per orang</h2><p>{fmtShort(days[0]!)} – {fmtShort(days[n - 1]!)} · angka = selesai/total tugas. Ketuk kotak untuk membuka hari itu.</p></div>
        <div className="seg" role="group" aria-label="Rentang rekap">
          {([7, 14] as const).map(k => <button key={k} aria-pressed={n === k} onClick={() => onDays(k)}>{k} hari</button>)}
        </div>
      </div>
      <div className="mxwrap"><table className="mx">
        <thead><tr><th className="who" scope="col">Orang</th>
          {days.map(d => <th key={d} scope="col" className={d === t0 ? "today" : undefined}>{DAYN[parseYmd(d).getDay()]}<small>{parseYmd(d).getDate()}</small></th>)}
          <th scope="col" className="tot">Total</th></tr></thead>
        <tbody>{rows}</tbody>
        <tfoot><tr><th className="who" scope="row"><b>Semua</b></th>{col.map((c, i) => <td key={days[i]}><CellBtn label="Semua" c={c} d={days[i]!} /></td>)}<Tot done={gDone} total={gTot} /></tr></tfoot>
      </table></div>
      <div className="legend">
        <span>0%<span className="ramp" aria-hidden="true">{[0, .25, .5, .75, 1].map(p => <i key={p} style={{ background: `color-mix(in srgb, var(--blue) ${Math.round(10 + p * 75)}%, var(--surface))` }} />)}</span>100% selesai</span>
        <span><i className="nobox" aria-hidden="true" />tidak ada tugas</span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span className="warnico" aria-hidden="true">!</span>tidak ada tugas aktif hari ini</span>
      </div>
    </section>
  );
}
