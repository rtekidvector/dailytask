import type { Color } from "@shared/schemas";

/** Paired bars per day: created (grey) and done (lime). */
export function DayBars({ data }: { data: { date: string; created: number; done: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.created));
  const every = Math.ceil(data.length / 10);
  return (
    <div className="bars" role="img" aria-label="Tugas dibuat dan selesai per hari">
      {data.map((d, i) => (
        <div key={d.date} title={`${d.date}: ${d.done} selesai dari ${d.created}`}>
          <div className="b-d" style={{ height: `${(d.done / max) * 100}%`, minHeight: d.done ? 3 : 0 }} />
          <div className="b-c" style={{ height: `${((d.created - d.done) / max) * 100}%`, minHeight: d.created - d.done ? 3 : 0 }} />
          <small>{i % every === 0 ? d.date.slice(8) : " "}</small>
        </div>
      ))}
    </div>
  );
}

export interface Slice { label: string; value: number; color: string }
/** Donut chart with a centre label. */
export function Donut({ slices, center }: { slices: Slice[]; center: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0), r = 56, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg className="donut" viewBox="0 0 150 150" role="img" aria-label={slices.map(s => `${s.label} ${s.value}`).join(", ")}>
      <circle cx="75" cy="75" r={r} fill="none" stroke="var(--sunk)" strokeWidth="20" />
      {total > 0 && slices.filter(s => s.value > 0).map(s => {
        const len = (s.value / total) * c, el = (
          <circle key={s.label} cx="75" cy="75" r={r} fill="none" stroke={s.color} strokeWidth="20" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 75 75)" />
        );
        offset += len;
        return el;
      })}
      <text x="75" y="80" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)" fontFamily="var(--font-display)">{center}</text>
    </svg>
  );
}

/** Horizontal stacked bar row: label, track (done / rest), value. */
export function HBar({ label, done, total, max, tint }: { label: string; done: number; total: number; max: number; tint?: Color }) {
  return (
    <div className="hbar">
      <span title={label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div className="track" style={{ width: `${(total / Math.max(1, max)) * 100}%`, minWidth: total ? 8 : 0 }}>
        <i style={{ width: `${total ? (done / total) * 100 : 0}%`, background: "var(--blue)" }} />
        <i style={{ flex: 1, background: "var(--line)" }} />
      </div>
      <b>{done}/{total}</b>
    </div>
  );
}
