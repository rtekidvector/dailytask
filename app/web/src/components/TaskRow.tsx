import { useState } from "react";
import type { TaskDTO } from "@shared/schemas";
import { NEXT, STATUS, fmtTime, host } from "../lib/format";
import { useTaskActions } from "../lib/actions";
import { useUi, useViewer } from "../lib/viewer";
import { ProofPanel } from "./ProofPanel";
import { TaskMeta } from "./TaskTags";
import { ConfirmButton } from "./ui";

/** A task in a list. Tapping the title opens the detail drawer. */
export function TaskRow({ t, canDelete, isLate }: { t: TaskDTO; canDelete: boolean; isLate?: boolean }) {
  const { policy } = useViewer();
  const { openTask } = useUi();
  const [proofOpen, setProofOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const a = useTaskActions(t);
  const manager = policy.isManager;

  const cycle = () => {
    const next = NEXT[t.status];
    if (!manager && next === "done") return setProofOpen(true);
    a.setStatus.mutate(next);
  };
  const photo = t.hasPhoto ? `/api/tasks/${t.id}/proof` : null;
  return (
    <li className="task" data-status={t.status}>
      <button className={"status " + t.status} onClick={cycle} title="Ketuk untuk ganti status" aria-label={`Status: ${STATUS[t.status]}. Ketuk untuk ganti.`}>{STATUS[t.status]}</button>
      <div className="tt">
        <b className="clamp2" title={t.title} role="link" tabIndex={0} onClick={() => openTask(t.id)} onKeyDown={e => e.key === "Enter" && openTask(t.id)}>{t.title}</b>
        {t.note && <p className="clamp2">{t.note}</p>}
        <TaskMeta t={t} isLate={isLate} compact max={3} />
        {t.proofAt && (
          <div className="proof">
            {photo && <button className="thumb" onClick={() => setLightbox(true)} aria-label="Lihat foto bukti"><img src={photo} alt={"Bukti: " + t.title} loading="lazy" /></button>}
            <div className="pmeta">
              <span>Bukti · {fmtTime(t.proofAt)}</span>
              {t.proofLink && <a href={t.proofLink} target="_blank" rel="noopener noreferrer">{host(t.proofLink)}</a>}
              {manager && t.status === "done" && t.by !== "self" && policy.canManage(t.email) &&
                <ConfirmButton className="linkbtn" label="Kembalikan" armed="Yakin kembalikan?" onConfirm={() => a.giveBack.mutate()} />}
            </div>
          </div>
        )}
        {t.report && <div className="report"><span>Catatan{t.reportAt ? " · " + fmtTime(t.reportAt) : ""}</span><p>{t.report}</p></div>}
        {proofOpen && <ProofPanel t={t} onClose={() => setProofOpen(false)} />}
      </div>
      {canDelete
        ? <ConfirmButton className="del" ariaLabel="Hapus tugas" label="✕" armed="Hapus?" onConfirm={() => a.remove.mutate()} />
        : <span />}
      {lightbox && photo && (
        <div className="lightbox" role="dialog" aria-label="Foto bukti" onClick={() => setLightbox(false)} onKeyDown={e => e.key === "Escape" && setLightbox(false)}>
          <img src={photo} alt="Foto bukti" /><button className="iconbtn" aria-label="Tutup">✕</button>
        </div>
      )}
    </li>
  );
}
