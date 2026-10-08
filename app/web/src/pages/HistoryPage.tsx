import { useMemo, useState } from "react";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { useFeed } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";

const KIND: Record<string, string> = { created: "Dibuat", assigned: "Ditugaskan", status: "Status", doing: "Dikerjakan", done: "Selesai", comment: "Komentar", returned: "Dikembalikan", edited: "Diubah", subtask: "Checklist" };
const day = (ms: number) => { const d = new Date(ms), t = new Date(), y = new Date(Date.now() - 864e5); const same = (a: Date, b: Date) => a.toDateString() === b.toDateString(); return same(d, t) ? "Hari ini" : same(d, y) ? "Kemarin" : new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(d); };
const hm = (ms: number) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)).replace(".", ":");

export function HistoryPage() {
  const { member, me, team, policy } = useViewer();
  const { openTask } = useUi();
  const q = useFeed(true, 100);
  const [who, setWho] = useState(""), [kind, setKind] = useState("");
  const items = useMemo(() => (q.data ?? []).filter(a => (!who || a.actorEmail === who) && (!kind || a.kind === kind)), [q.data, who, kind]);
  const kinds = [...new Set((q.data ?? []).map(a => a.kind))];
  const groups = Map.groupBy(items, a => day(a.at));
  return (
    <Page title="Riwayat" sub="Semua perubahan pada tugas, terbaru di atas"
      actions={<>
        {policy.isManager && <select className="input" value={who} onChange={e => setWho(e.target.value)} aria-label="Pelaku"><option value="">Semua orang</option>{team.filter(m => !m.isAdmin || m.email === me.email).map(m => <option key={m.email} value={m.email}>{m.name}</option>)}</select>}
        <select className="input" value={kind} onChange={e => setKind(e.target.value)} aria-label="Jenis"><option value="">Semua jenis</option>{kinds.map(k => <option key={k} value={k}>{KIND[k] ?? k}</option>)}</select>
      </>} tabs={[{ id: "a", label: `${items.length} aktivitas` }]} tab="a">
      <section className="bc">
        {items.length ? <div className="tline">
          {[...groups].map(([label, list]) => <div key={label}><h4>{label}</h4>
            {list.map(a => { const m = member(a.actorEmail); return (
              <div key={a.id} className="it">
                {m ? <Avatar m={m} /> : <span className="avatar">{a.actorName[0]}</span>}
                <div style={{ minWidth: 0 }}><div><b>{a.actorEmail === me.email ? "Kamu" : a.actorName}</b> {a.text}</div>
                  {a.taskTitle && <button className="linkbtn clamp1" style={{ maxWidth: "100%", textAlign: "left" }} onClick={() => a.taskId && openTask(a.taskId)}>{a.taskTitle}</button>}</div>
                <div style={{ display: "grid", gap: 4, justifyItems: "end" }}><span className="kind">{KIND[a.kind] ?? a.kind}</span><small>{hm(a.at)}</small></div>
              </div>); })}
          </div>)}
        </div> : <Empty art="activity" title="Belum ada aktivitas" />}
      </section>
    </Page>
  );
}
