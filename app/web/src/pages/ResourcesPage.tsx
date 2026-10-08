import { useMemo, useState } from "react";
import { Camera, Clapperboard, MapPin, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { RESOURCE_KINDS, type BookingDTO, type ResourceDTO, type ResourceKind } from "@shared/schemas";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { api, ok } from "../lib/api";
import { today } from "../lib/format";
import { keys, useAction, useBookings, useResources, useTasks } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";

const KIND: Record<ResourceKind, { label: string; Icon: typeof Camera }> = { alat: { label: "Alat", Icon: Camera }, studio: { label: "Studio", Icon: Clapperboard }, lokasi: { label: "Lokasi", Icon: MapPin } };
const H0 = 7, H1 = 21, SPAN = (H1 - H0) * 60;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const pos = (hm: string) => Math.max(0, Math.min(100, (mins(hm) - H0 * 60) / SPAN * 100));

function BookDialog({ r, date, start, onClose }: { r: ResourceDTO; date: string; start: string; onClose: () => void }) {
  const { me } = useViewer();
  const tasks = (useTasks(date, true).data ?? []).filter(t => t.date === date && t.status !== "done");
  const [from, setFrom] = useState(start), [to, setTo] = useState(`${String(Math.min(21, Number(start.slice(0, 2)) + 1)).padStart(2, "0")}:00`);
  const [taskId, setTaskId] = useState(""), [note, setNote] = useState("");
  const save = useAction(() => ok(api.bookings.$post({ json: { resourceId: r.id, date, start: from, end: to, taskId: taskId || null, note } })), { done: "Booking tersimpan", refresh: [keys.resources] });
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="dialog" role="dialog" aria-label="Booking" onSubmit={e => { e.preventDefault(); if (to <= from) return void toast.error("Jam selesai harus setelah jam mulai"); save.mutate(undefined, { onSuccess: onClose }); }}>
        <header className="dialog-h"><div><h2>Booking {r.name}</h2><p className="muted">{date}</p></div><button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button></header>
        <div className="dialog-b"><section className="dsec">
          <div className="dgrid"><label className="field"><span>Mulai</span><input className="input" type="time" value={from} onChange={e => setFrom(e.target.value)} required /></label><label className="field"><span>Selesai</span><input className="input" type="time" value={to} onChange={e => setTo(e.target.value)} required /></label></div>
          <label className="field"><span>Untuk tugas <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span><select className="input" value={taskId} onChange={e => setTaskId(e.target.value)}><option value="">Tanpa tugas</option>{tasks.map(t => <option key={t.id} value={t.id}>{t.title.slice(0, 60)}</option>)}</select></label>
          <label className="field"><span>Catatan</span><input className="input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="Contoh: bawa lensa 50mm" /></label>
        </section></div>
        <footer className="dialog-f"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button className="btn primary" disabled={save.isPending}>Simpan booking</button></footer>
      </form>
    </>
  );
}

function Manage({ list }: { list: ResourceDTO[] }) {
  const { policy } = useViewer();
  const [name, setName] = useState(""), [kind, setKind] = useState<ResourceKind>("alat");
  const add = useAction(() => ok(api.resources.$post({ json: { name, kind } })), { done: "Ditambahkan", refresh: [keys.resources] });
  const patch = useAction((v: { id: string; archived: boolean }) => ok(api.resources[":id"].$patch({ param: { id: v.id }, json: { archived: v.archived } })), { refresh: [keys.resources] });
  const del = useAction((id: string) => ok(api.resources[":id"].$delete({ param: { id } })), { done: "Dihapus", refresh: [keys.resources] });
  return (
    <section className="bc">
      <div className="bc-h"><h3>Daftar alat, studio, dan lokasi</h3></div>
      <form className="quick compact" onSubmit={e => { e.preventDefault(); if (name.trim()) add.mutate(undefined, { onSuccess: () => setName("") }); }}>
        <input className="input" placeholder="Nama, contoh: Kamera Sony A7 IV" value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label="Nama" />
        <select className="input" style={{ width: "auto" }} value={kind} onChange={e => setKind(e.target.value as ResourceKind)} aria-label="Jenis">{RESOURCE_KINDS.map(k => <option key={k} value={k}>{KIND[k].label}</option>)}</select>
        <button className="btn primary" disabled={add.isPending}><Plus size={14} />Tambah</button>
      </form>
      <ul className="alist">{list.map(r => (
        <li key={r.id} className="arow" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
          <span className="bc-ico">{(() => { const I = KIND[r.kind].Icon; return <I size={17} />; })()}</span>
          <div><b className="clamp1">{r.name}</b><small className="muted">{KIND[r.kind].label}{r.archived ? " · nonaktif" : ""}</small></div>
          <div className="chips"><button className="btn small" onClick={() => patch.mutate({ id: r.id, archived: !r.archived })}>{r.archived ? "Aktifkan" : "Nonaktifkan"}</button>
            {policy.isBoss && <button className="iconbtn" aria-label={`Hapus ${r.name}`} onClick={() => confirm(`Hapus ${r.name} beserta bookingnya?`) && del.mutate(r.id)}><Trash2 size={13} /></button>}</div>
        </li>))}</ul>
      {!list.length && <Empty art="tasks" title="Belum ada alat atau ruangan" />}
    </section>
  );
}

export function ResourcesPage() {
  const { me, member, policy } = useViewer();
  const { date } = useUi();
  const [tab, setTab] = useState("jadwal"), [kind, setKind] = useState<ResourceKind | "">("");
  const [slot, setSlot] = useState<{ r: ResourceDTO; start: string } | null>(null);
  const rq = useResources(true), all = rq.data ?? [];
  const bq = useBookings(date, date), books = bq.data ?? [];
  const del = useAction((id: string) => ok(api.bookings[":id"].$delete({ param: { id } })), { done: "Booking dibatalkan", refresh: [keys.resources] });
  const list = all.filter(r => !r.archived && (!kind || r.kind === kind));
  const byRes = useMemo(() => Map.groupBy(books, b => b.resourceId), [books]);
  const canBook = !!me.member || policy.isManager;
  const hours = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i);
  const bar = (b: BookingDTO) => {
    const m = member(b.email), mine = b.email === me.email, can = mine || policy.canManage(b.email);
    return (
      <div key={b.id} className={"bkbar" + (mine ? " mine" : "")} style={{ left: `${pos(b.start)}%`, width: `${Math.max(2, pos(b.end) - pos(b.start))}%` }} title={`${b.start}–${b.end} · ${m?.name ?? b.email}${b.taskTitle ? " · " + b.taskTitle : ""}${b.note ? " · " + b.note : ""}`}>
        {m && <Avatar m={m} />}<span className="clamp1">{b.taskTitle ?? b.note ?? m?.name}</span>
        {can && <button aria-label="Batalkan booking" onClick={e => { e.stopPropagation(); del.mutate(b.id); }}><X size={12} /></button>}
      </div>
    );
  };
  return (
    <Page title="Alat & studio" sub="Booking kamera, lighting, studio, dan lokasi agar tidak bentrok" dateNav
      tabs={[{ id: "jadwal", label: "Jadwal" }, ...(policy.isManager ? [{ id: "kelola", label: "Kelola daftar" }] : [])]} tab={tab} onTab={setTab}
      actions={tab === "jadwal" ? <div className="seg" role="group" aria-label="Jenis"><button aria-pressed={!kind} onClick={() => setKind("")}>Semua</button>{RESOURCE_KINDS.map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND[k].label}</button>)}</div> : undefined}>
      {tab === "kelola" && policy.isManager ? <Manage list={all} /> : (
        <section className="bc"><div className="heatwrap"><div className="bkgrid">
          <div />
          <div className="bkhours">{hours.map(h => <span key={h} style={{ left: `${(h - H0) * 60 / SPAN * 100}%` }}>{String(h).padStart(2, "0")}</span>)}</div>
          {list.map(r => {
            const I = KIND[r.kind].Icon;
            return [
              <div key={r.id} className="bkname"><span className="bc-ico"><I size={16} /></span><span style={{ minWidth: 0 }}><b className="clamp1">{r.name}</b><small className="muted">{KIND[r.kind].label}</small></span></div>,
              <div key={r.id + "t"} className="bktrack" onClick={e => {
                if (!canBook || date < today() || (e.target as HTMLElement).closest(".bkbar")) return;
                const rect = e.currentTarget.getBoundingClientRect(), h = Math.floor(H0 + (e.clientX - rect.left) / rect.width * (H1 - H0));
                setSlot({ r, start: `${String(Math.max(H0, Math.min(H1 - 1, h))).padStart(2, "0")}:00` });
              }} role="button" aria-label={`Booking ${r.name}`}>
                {hours.map(h => <i key={h} style={{ left: `${(h - H0) * 60 / SPAN * 100}%` }} />)}
                {(byRes.get(r.id) ?? []).map(bar)}
              </div>,
            ];
          })}
        </div></div>
        {!list.length && <Empty art="calendar" title="Belum ada alat atau ruangan">{policy.isManager ? "Tambahkan di tab Kelola daftar." : "Minta admin menambahkan alat dan ruangan."}</Empty>}
        {list.length > 0 && <p className="muted" style={{ fontSize: ".78rem" }}>{canBook && date >= today() ? "Klik jalur waktu untuk booking. " : ""}Biru tua = booking kamu.</p>}
        </section>
      )}
      {slot && <BookDialog r={slot.r} date={date} start={slot.start} onClose={() => setSlot(null)} />}
    </Page>
  );
}
