import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import type { TaskDTO } from "@shared/schemas";
import { upload } from "../lib/api";
import { shrink } from "../lib/image";
import { errorText, keys } from "../lib/queries";
import { useViewer } from "../lib/viewer";

/** Finish a task: attach a photo and/or link as proof, plus an optional note. */
export function ProofPanel({ t, onClose }: { t: TaskDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const { policy } = useViewer();
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (form: HTMLFormElement, skipProof: boolean) => {
    const fd = new FormData(form);
    if (!skipProof && !file && !String(fd.get("link") ?? "").trim()) return void toast.error("Lampirkan foto/screenshot atau link sebagai bukti");
    setBusy(true);
    try {
      const out = new FormData();
      if (!skipProof) {
        if (file) {
          let blob = await shrink(file.file, 1200, 0.62);
          if (blob.size > 650_000) blob = await shrink(file.file, 800, 0.55);
          out.set("photo", blob, "bukti.jpg");
        }
        out.set("link", String(fd.get("link") ?? ""));
      } else out.set("skipProof", "1");
      out.set("note", String(fd.get("note") ?? ""));
      await upload(`/api/tasks/${t.id}/complete`, out);
      toast.success(skipProof ? "Tugas selesai" : "Tugas selesai dengan bukti");
      for (const k of [keys.tasks, keys.activity, keys.analytics]) await qc.invalidateQueries({ queryKey: k });
      onClose();
    } catch (err) { toast.error(errorText(err)); }
    setBusy(false);
  };
  return (
    <form className="proofpanel" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget, false); }}>
      <b>Bukti tugas selesai</b>
      <p className="foot">Unggah foto atau screenshot hasil kerja, atau tempel link (Drive, Instagram, TikTok, marketplace). Untuk video, pakai link.</p>
      {file
        ? <div className="pv"><img src={file.preview} alt="Pratinjau bukti" /><button type="button" className="linkbtn" onClick={() => { URL.revokeObjectURL(file.preview); setFile(null); }}>Ganti foto</button></div>
        : <label className="drop"><input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setFile({ file: f, preview: URL.createObjectURL(f) }); }} /><span className="iconline"><Camera size={18} />Pilih foto / screenshot</span></label>}
      <input className="input" name="link" type="url" inputMode="url" placeholder="atau tempel link hasil kerja" maxLength={500} aria-label="Link bukti" />
      <textarea className="input" name="note" rows={2} maxLength={600} placeholder="Catatan singkat (opsional)" aria-label="Catatan" defaultValue={t.report ?? ""} />
      <div className="actions">
        <button type="button" className="btn small ghost" onClick={onClose}>Batal</button>
        {(!t.needProof || policy.isManager) && <button type="button" className="btn small" disabled={busy} onClick={e => void submit(e.currentTarget.form!, true)}>Selesai tanpa bukti</button>}
        <button type="submit" className="btn small primary" disabled={busy}>{busy ? "Mengunggah…" : "Tandai selesai"}</button>
      </div>
    </form>
  );
}
