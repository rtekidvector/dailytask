import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ProjectDTO } from "@shared/schemas";
import { ApiError, api, ok } from "../lib/api";
import { keys, useAction } from "../lib/queries";

/** Closing report for a project: summary, result links. Open tasks need a second, explicit confirmation. */
export function CloseProject({ p, openTasks, onClose }: { p: ProjectDTO; openTasks: number; onClose: () => void }) {
  const [summary, setSummary] = useState(""), [links, setLinks] = useState(""), [force, setForce] = useState(false);
  const save = useAction(() => ok(api.meta.projects[":id"].close.$post({ param: { id: p.id }, json: { summary, links: links.split("\n").map(s => s.trim()).filter(Boolean), force } })),
    { done: "Proyek ditutup", refresh: [keys.meta, keys.activity] });
  const submit = () => {
    const list = links.split("\n").map(s => s.trim()).filter(Boolean);
    if (list.some(l => !/^https?:\/\//i.test(l))) return void toast.error("Tautan harus diawali http:// atau https://");
    if (openTasks && !force) return void toast.error("Centang konfirmasi karena masih ada tugas yang belum selesai");
    save.mutate(undefined, { onSuccess: onClose, onError: e => e instanceof ApiError && void 0 });
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="dialog" role="dialog" aria-label="Tutup proyek" onSubmit={e => { e.preventDefault(); submit(); }}>
        <header className="dialog-h"><div><h2>Tutup proyek</h2><p className="muted clamp1">{p.name}</p></div><button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button></header>
        <div className="dialog-b">
          <section className="dsec"><h3>Ringkasan hasil</h3>
            <label className="field"><span>Apa yang dicapai?</span><textarea className="input" rows={4} maxLength={1000} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Hasil, angka penting, catatan untuk proyek berikutnya" autoFocus /></label>
            <label className="field"><span>Tautan hasil akhir <em style={{ fontStyle: "normal", fontWeight: 400 }}>(satu per baris)</em></span><textarea className="input" rows={3} value={links} onChange={e => setLinks(e.target.value)} placeholder="https://drive.google.com/…" /></label>
          </section>
          {openTasks > 0 && <section className="dsec"><div className="warnbox"><span className="warnico" aria-hidden="true">!</span><div className="txt"><b>{openTasks} tugas belum selesai</b>Tugas itu tetap ada dan bisa dikerjakan, tapi proyek akan ditandai selesai.</div></div>
            <label className="check"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />Tetap tutup proyek ini</label></section>}
        </div>
        <footer className="dialog-f"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button className="btn primary" disabled={save.isPending}>Tutup proyek</button></footer>
      </form>
    </>
  );
}
