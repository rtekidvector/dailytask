import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getTheme, toggleTheme } from "../lib/theme";
import { Camera, CalendarOff, Bell, Moon, Sun, CalendarDays, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, FolderKanban, History, LayoutDashboard, Columns3, ListChecks, Plus, Search, Settings, Users, BarChart3, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays } from "@shared/time";
import { api, ok } from "../lib/api";
import { fmtShort, today } from "../lib/format";
import { pushSupported, unregisterPush } from "../lib/push";
import { keys, useInbox, useLeaves } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar } from "./ui";
import { RunningPill } from "./TimeTracker";

const NAV = [
  { to: "/", label: "Dasbor", Icon: LayoutDashboard },
  { to: "/papan", label: "Papan", Icon: Columns3 },
  { to: "/daftar", label: "Daftar", Icon: ListChecks },
  { to: "/kalender", label: "Kalender", Icon: CalendarDays },
  { to: "/proyek", label: "Proyek", Icon: FolderKanban },
  { to: "/tim", label: "Tim", Icon: Users, manager: true },
  { to: "/alat", label: "Alat", Icon: Camera },
  { to: "/izin", label: "Izin", Icon: CalendarOff },
  { to: "/laporan", label: "Laporan", Icon: BarChart3 },
  { to: "/riwayat", label: "Riwayat", Icon: History },
];

/** Floating pill header: logo, page menu, search, bell and the account menu. */
export function TopNav() {
  const [loc, go] = useLocation();
  const { policy, me, member } = useViewer();
  const { openSearch } = useUi();
  const qc = useQueryClient();
  const m = member(me.email);
  const [menu, setMenu] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => { navRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ inline: "center", block: "nearest" }); }, [loc]);
  const waiting = (useLeaves(true).data ?? []).filter(l => l.status === "pending" && l.email !== me.email && policy.canManage(l.email)).length;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [menu]);
  const out = async () => {
    if (pushSupported() && Notification.permission === "granted") await unregisterPush();
    await ok(api.auth.logout.$post());
    qc.clear();
    await qc.invalidateQueries({ queryKey: keys.me });
  };
  return (
    <header className="topnav">
      <div className="logo"><i><CheckCheck size={18} /></i><span className="t">Tugas Harian</span></div>
      <nav className="pillnav" aria-label="Menu utama" ref={navRef}>
        {NAV.filter(n => !n.manager || policy.isManager).map(({ to, label, Icon }) => (
          <a key={to} href={to} aria-current={(to === "/" ? loc === "/" : loc.startsWith(to)) ? "page" : undefined} aria-label={label}
            onClick={e => { e.preventDefault(); go(to); }}><Icon /><span>{label}</span>{to === "/izin" && waiting > 0 && <i className="navdot">{waiting}</i>}</a>
        ))}
      </nav>
      <div className="navtools">
        <RunningPill />
        <button className="tool" onClick={openSearch} aria-label="Cari (Ctrl+K)" title="Cari (Ctrl+K)"><Search size={17} /></button>
        <Bell_ />
        <div className="usermenu" ref={ref}>
          <button className="tool" onClick={() => setMenu(o => !o)} aria-label="Akun" aria-expanded={menu}>
            {m ? <Avatar m={m} /> : <span className="avatar" style={{ background: "var(--ink)", color: "var(--volt)" }}>{me.name[0]}</span>}<ChevronDown size={14} />
          </button>
          {menu && (
            <div className="popover" role="menu" style={{ minWidth: 220 }}>
              <div style={{ padding: "8px 12px" }}><b className="clamp1">{m?.name ?? me.name}</b><small className="muted clamp1">{m?.role || (me.owner ? "Pemilik" : me.email)}</small></div>
              <button className="menuitem" role="menuitem" onClick={() => { setMenu(false); go("/pengaturan"); }}><Settings size={16} /><span>Pengaturan</span></button>
              <button className="menuitem" role="menuitem" onClick={() => { toggleTheme(); setMenu(false); }}>{getTheme() === "dark" ? <Sun size={16} /> : <Moon size={16} />}<span>{getTheme() === "dark" ? "Mode terang" : "Mode gelap"}</span></button>
              <button className="menuitem" role="menuitem" onClick={out}><LogOut size={16} /><span>Keluar</span></button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Bell_() {
  const { openTask } = useUi();
  const inbox = useInbox(true), qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);
  const read = async (ids?: string[]) => { await ok(api.inbox.notifications.read.$post({ json: { ids } })); await qc.invalidateQueries({ queryKey: keys.inbox }); };
  const unread = inbox.data?.unread ?? 0;
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`; };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="tool" onClick={() => setOpen(o => !o)} aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`} aria-expanded={open}><Bell size={18} />{unread > 0 && <span className="dot-badge">{unread > 9 ? "9+" : unread}</span>}</button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifikasi">
          <div className="surface-h" style={{ margin: "2px 6px" }}><b>Notifikasi</b>{unread > 0 && <button className="linkbtn" onClick={() => read()}>Tandai semua dibaca</button>}</div>
          {(inbox.data?.items ?? []).map(n => (
            <button key={n.id} className={"notif" + (n.read ? "" : " unread")} onClick={() => { setOpen(false); void read([n.id]); if (n.taskId) openTask(n.taskId); }}>
              <i /><span><span className="clamp3">{n.text}</span><small>{ago(n.at)}</small></span>
            </button>
          ))}
          {!inbox.data?.items.length && <p className="empty">Belum ada notifikasi.</p>}
        </div>
      )}
    </div>
  );
}

/** Page frame: title, optional day navigation and actions, then the optional tab row. */
export function Page({ title, sub, tabs, tab, onTab, dateNav, children, actions, noNew }: {
  title: ReactNode; sub?: ReactNode; tabs?: { id: string; label: string }[]; tab?: string; onTab?: (id: string) => void;
  dateNav?: boolean; actions?: ReactNode; children: ReactNode; noNew?: boolean;
}) {
  const { policy } = useViewer();
  const { date, setDate, newTask } = useUi();
  const t = today();
  return (
    <div className="page">
      <div className="topbar">
        <div style={{ minWidth: 0, flex: "1 1 260px" }}><h1 className="clamp1">{title}</h1>{sub && <p className="clamp1">{sub}</p>}</div>
        <div className="chips" style={{ gap: 10 }}>
          {dateNav && (
            <div className="datepill" role="group" aria-label="Pilih hari">
              <button aria-label="Hari sebelumnya" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={16} /></button>
              <button className="mid" onClick={() => setDate(t)} title="Kembali ke hari ini"><CalendarDays size={15} />{date === t ? "Hari ini · " : ""}{fmtShort(date)}</button>
              <button aria-label="Hari berikutnya" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={16} /></button>
            </div>
          )}
          {!noNew && <button className="btn blue hide-mobile" style={{ height: 40 }} onClick={() => newTask()}><Plus size={16} />{policy.isManager ? "Tambah tugas" : "Tugas baru"}</button>}
        </div>
      </div>
      <button className="fab" onClick={() => newTask()} aria-label="Tugas baru"><Plus size={24} /></button>
      {(tabs || actions) && (
        <div className="tabs" role="tablist">
          {tabs?.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => onTab?.(x.id)}>{x.label}</button>)}
          {actions && <div className="grow">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
