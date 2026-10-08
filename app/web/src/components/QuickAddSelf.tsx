import { useState } from "react";
import { Clock, Plus } from "lucide-react";
import { api, ok } from "../lib/api";
import { useAction } from "../lib/queries";

export function QuickAddSelf({ email, date }: { email: string; date: string }) {
  const [times, setTimes] = useState(false);
  const add = useAction((f: FormData) => ok(api.tasks.$post({ json: {
    emails: [email], title: String(f.get("title")), date, start: String(f.get("start") || "") || null, due: String(f.get("due") || "") || null,
  } })));
  return (
    <form className="quick compact" style={{ padding: 6 }} onSubmit={e => {
      e.preventDefault();
      const form = e.currentTarget, f = new FormData(form);
      if (!String(f.get("title")).trim()) return;
      add.mutate(f); form.reset(); setTimes(false);
    }}>
      <input className="input" name="title" placeholder="Tambah tugasku sendiri…" maxLength={120} aria-label="Tambah tugas sendiri" />
      <button type="button" className="iconbtn" aria-pressed={times} aria-label="Atur jam" title="Atur jam" onClick={() => setTimes(t => !t)}><Clock size={16} /></button>
      <button className="iconbtn dark" type="submit" aria-label="Tambah"><Plus size={16} /></button>
      {times && <>
        <label className="tl"><span>Mulai</span><input className="input timein" name="start" type="time" aria-label="Jam mulai (opsional)" /></label>
        <label className="tl"><span>Selesai</span><input className="input timein" name="due" type="time" aria-label="Jam selesai (opsional)" /></label>
      </>}
    </form>
  );
}
