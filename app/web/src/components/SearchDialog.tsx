import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CalendarClock, CornerDownLeft, Moon, Plus, Search, Sun } from "lucide-react";
import { getTheme, toggleTheme } from "../lib/theme";
import { addDays } from "@shared/time";
import { STATUS, fmtShort, today } from "../lib/format";
import { useTasks } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";

/** Ctrl/⌘+K: find any task you can see by title, person, project, or label. */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { member, project, label } = useViewer();
  const { openTask, newTask, setDate } = useUi();
  const { policy } = useViewer();
  const [, nav] = useLocation();
  const tasks = useTasks(addDays(today(), -60), true).data ?? [];
  const [q, setQ] = useState(""), [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hay = (t: (typeof tasks)[number]) => [t.title, t.note, member(t.email)?.name, project(t.projectId)?.name, ...t.labelIds.map(l => label(l)?.name)].join(" ").toLowerCase();
    return (s ? tasks.filter(t => s.split(/\s+/).every(w => hay(t).includes(w))) : tasks.filter(t => t.status !== "done")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }, [q, tasks, member, project, label]);
  const go = (id: string) => { onClose(); openTask(id); };
  // Commands: shown when the box is empty or the text matches; run with Enter like a task result.
  const cmds = useMemo(() => {
    const dark = getTheme() === "dark";
    const all = [
      { k: "Tugas baru", h: "N", icon: <Plus size={15} />, run: () => newTask() },
      { k: "Ke hari ini", h: "", icon: <CalendarClock size={15} />, run: () => setDate(today()) },
      ...([["Dasbor", "/", "D"], ["Papan", "/papan", "P"], ["Daftar tugas", "/daftar", "L"], ["Kalender", "/kalender", "K"], ["Proyek", "/proyek", "Y"], ...(policy.isManager ? [["Tim", "/tim", "T"]] : []), ["Alat & studio", "/alat", "A"], ["Izin & cuti", "/izin", "I"], ["Laporan", "/laporan", "R"], ["Riwayat", "/riwayat", "H"], ["Pengaturan", "/pengaturan", ""]] as [string, string, string][])
        .map(([k, to, h]) => ({ k: "Buka " + k, h: h && "G " + h, icon: <CornerDownLeft size={15} />, run: () => nav(to) })),
      { k: dark ? "Mode terang" : "Mode gelap", h: "", icon: dark ? <Sun size={15} /> : <Moon size={15} />, run: toggleTheme },
    ];
    const s = q.trim().toLowerCase();
    return s ? all.filter(c => c.k.toLowerCase().includes(s)) : all.slice(0, 5);
  }, [q, policy.isManager, newTask, setDate, nav]);
  type Row = { cmd?: (typeof cmds)[number]; t?: (typeof hits)[number] };
  const rows: Row[] = [...cmds.map(c => ({ cmd: c })), ...hits.map(t => ({ t }))];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog cmdk" role="dialog" aria-label="Cari tugas">
        <div className="chips" style={{ flexWrap: "nowrap" }}><Search size={18} />
          <input ref={ref} className="input" placeholder="Cari tugas, atau ketik perintah (mis. papan, tugas baru)…" value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, rows.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
              else if (e.key === "Enter" && rows[sel]) { const r = rows[sel]!; if (r.cmd) { onClose(); r.cmd.run(); } else go(r.t!.id); }
            }} />
        </div>
        <ul>
          {rows.map((r, i) => r.cmd ? (
            <li key={"c" + r.cmd.k}><button aria-selected={i === sel} onClick={() => { onClose(); r.cmd!.run(); }} onMouseEnter={() => setSel(i)}>
              <span className="cmdico">{r.cmd.icon}</span><span style={{ flex: 1 }}><b>{r.cmd.k}</b></span>{r.cmd.h && <kbd>{r.cmd.h}</kbd>}
            </button></li>
          ) : (
            <li key={r.t!.id}><button aria-selected={i === sel} onClick={() => go(r.t!.id)} onMouseEnter={() => setSel(i)}>
              <span style={{ flex: 1, minWidth: 0 }}><b className="clamp1">{r.t!.title}</b><small className="muted clamp1" style={{ display: "block" }}>{member(r.t!.email)?.name} · {fmtShort(r.t!.date)}{project(r.t!.projectId) ? " · " + project(r.t!.projectId)!.name : ""}</small></span>
              <span className={"tag " + (r.t!.status === "done" ? "on" : "off")}>{STATUS[r.t!.status]}</span>
            </button></li>
          ))}
          {!rows.length && <li className="empty">Tidak ada yang cocok.</li>}
        </ul>
        <p className="muted" style={{ fontSize: ".72rem", padding: "2px 6px" }}>↑↓ pilih · Enter jalankan · Esc tutup · pintasan: <kbd>N</kbd> tugas baru, <kbd>/</kbd> cari, <kbd>G</kbd> lalu huruf untuk pindah halaman</p>
      </div>
    </>
  );
}
