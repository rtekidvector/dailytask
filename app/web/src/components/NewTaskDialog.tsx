import { loadTemplates, saveTemplates } from "../lib/templates";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, type Priority } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN } from "../lib/format";
import { keys, useAction } from "../lib/queries";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useViewer, type NewTaskPrefill } from "../lib/viewer";

const PRESETS: [string, string, string][] = [["Pagi", "08:00", "12:00"], ["Siang", "13:00", "17:00"], ["Sore", "15:00", "17:00"], ["Malam", "19:00", "21:00"], ["Tanpa jam", "", ""]];
const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

/** Create a task (or a repeating routine) with schedule, priority, project, labels, and a checklist. */
export function NewTaskDialog({ prefill, date, onClose, onTemplate }: { prefill: NewTaskPrefill; date: string; onClose: () => void; onTemplate: (p: NewTaskPrefill) => void }) {
  const [, setTpl] = useState(0);
  const templates = loadTemplates();
  const { me, team, policy, projects, labels } = useViewer();
  const manager = policy.isManager;
  const people = team.filter(m => !m.isAdmin && policy.canManage(m.email));
  const [sel, setSel] = useState(new Set(manager ? prefill.emails ?? [] : [me.email]));
  const [priority, setPriority] = useState<Priority>(prefill.priority ?? "normal");
  const [proof, setProof] = useState(true), [routine, setRoutine] = useState(false);
  const [days, setDays] = useState(new Set([1, 2, 3, 4, 5, 6]));
  const [lab, setLab] = useState(new Set<string>(prefill.labelIds ?? []));
  const [start, setStart] = useState(prefill.start ?? ""), [due, setDue] = useState(prefill.due ?? "");

  const save = useAction((f: FormData) => ok(api.tasks.$post({ json: {
    emails: [...sel], title: String(f.get("title")), note: String(f.get("note") ?? ""), date: routine ? undefined : String(f.get("date") || date),
    start: start || null, due: due || null, priority, projectId: String(f.get("project") || "") || null, labelIds: [...lab],
    subtasks: String(f.get("subtasks") ?? "").split("\n").map(s => s.trim()).filter(Boolean),
    needProof: proof, routineDays: routine ? [...days].sort() : undefined,
  } })), { done: routine ? "Tugas rutin disimpan" : sel.size > 1 ? `Tugas dibagikan ke ${sel.size} orang` : "Tugas dibuat", refresh: [keys.tasks, keys.team, keys.routines, keys.activity] });

  const submit = (f: FormData) => {
    if (!sel.size) return void toast.error("Pilih minimal satu orang");
    if (!String(f.get("title")).trim()) return void toast.error("Tulis judul tugasnya dulu");
    if (start && due && start >= due) return void toast.error("Jam selesai harus setelah jam mulai");
    if (routine && !days.size) return void toast.error("Pilih hari untuk tugas rutin");
    save.mutate(f, { onSuccess: onClose });
  };
  const all = people.length > 0 && sel.size === people.length;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="dialog" role="dialog" aria-label="Tugas baru" onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
        <header className="dialog-h"><div><h2>{manager ? "Tugas baru" : "Tugas untukku"}</h2><p className="muted">{manager ? "Bagikan pekerjaan ke satu orang atau lebih." : "Catatan pekerjaan pribadimu."}</p></div><button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button></header>
        <div className="dialog-b">
          {manager && (
            <section className="dsec"><h3>Penerima</h3>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={all} onClick={() => setSel(all ? new Set() : new Set(people.map(p => p.email)))}>Semua</button>
                {people.map(m => <button type="button" key={m.email} className="chip" aria-pressed={sel.has(m.email)} onClick={() => setSel(toggle(sel, m.email))}>{m.name}</button>)}
              </div>
            </section>
          )}
          {templates.length > 0 && (
            <section className="dsec"><h3>Templat</h3>
              <div className="chips">{templates.map((t, i) => <span key={i} className="chip" style={{ paddingRight: 4 }}><button type="button" className="linkbtn" style={{ textDecoration: "none" }} onClick={() => onTemplate({ ...t, emails: [...sel] })}>{t.title}</button><button type="button" className="iconbtn" style={{ width: 22, height: 22 }} aria-label={`Hapus templat ${t.title}`} onClick={() => { saveTemplates(templates.filter((_, j) => j !== i)); setTpl(n => n + 1); }}><X size={12} /></button></span>)}</div>
            </section>
          )}
          <section className="dsec"><h3>Detail</h3>
            <label className="field"><span>Judul</span><input className="input" name="title" autoFocus defaultValue={prefill.title ?? ""} placeholder="Contoh: Foto produk pashmina warna baru" maxLength={120} /></label>
            {manager && <label className="field"><span>Deskripsi <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span><textarea className="input" name="note" rows={2} defaultValue={prefill.note ?? ""} maxLength={600} placeholder="Detail, link brief, atau target" /></label>}
            <div className="dgrid">
              <div className="field"><span>Prioritas</span><div className="seg" role="group" aria-label="Prioritas" style={{ justifySelf: "start" }}>{PRIORITIES.map(p => <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</button>)}</div></div>
              <label className="field"><span>Proyek</span><select className="input" name="project" defaultValue={prefill.projectId ?? ""}><option value="">Tanpa proyek</option>{projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            </div>
            {labels.length > 0 && <div className="field"><span>Label</span><div className="chips">{labels.map(l => <button type="button" key={l.id} className="chip" data-c={l.color} aria-pressed={lab.has(l.id)} onClick={() => setLab(toggle(lab, l.id))}><i className="sw" />{l.name}</button>)}</div></div>}
          </section>
          <section className="dsec"><h3>Jadwal</h3>
            <div className="dgrid">
              {!routine && <label className="field"><span>Tanggal</span><input className="input" name="date" type="date" defaultValue={prefill.date ?? date} /></label>}
              <div className="timegrid" style={routine ? { gridColumn: "1 / -1" } : undefined}>
                <label className="tl"><span>Mulai</span><input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
                <label className="tl"><span>Selesai</span><input className="input" type="time" value={due} onChange={e => setDue(e.target.value)} /></label>
              </div>
            </div>
            <div className="chips">{PRESETS.map(([lbl, a, b]) => <button key={lbl} type="button" className="chip" onClick={() => { setStart(a); setDue(b); }}>{a ? `${lbl} ${a}–${b}` : lbl}</button>)}</div>
            {manager && <div className="chips" style={{ gap: 18 }}>
              <label className="check"><input type="checkbox" checked={routine} onChange={e => setRoutine(e.target.checked)} />Ulangi rutin</label>
            </div>}
            {routine && <div className="field"><span>Muncul otomatis setiap</span><div className="chips">{[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} className="chip" aria-pressed={days.has(d)} onClick={() => setDays(toggle(days, d))}>{DAYN[d]}</button>)}</div></div>}
          </section>
          {!routine && (
            <section className="dsec"><h3>Checklist &amp; bukti</h3>
              <label className="field"><span>Langkah <em style={{ fontStyle: "normal", fontWeight: 400 }}>(satu per baris)</em></span><textarea className="input" name="subtasks" rows={3} defaultValue={(prefill.steps ?? []).join("\n")} placeholder={"Ambil foto\nEdit warna\nUpload ke Drive"} /></label>
              {manager && <label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Karyawan wajib melampirkan bukti</label>}
            </section>
          )}
          {routine && manager && <section className="dsec"><h3>Bukti</h3><label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Karyawan wajib melampirkan bukti</label></section>}
        </div>
        <footer className="dialog-f"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button type="submit" className="btn primary" disabled={save.isPending}>{routine ? "Simpan tugas rutin" : manager ? "Bagikan tugas" : "Simpan"}</button></footer>
      </form>
    </>
  );
}
