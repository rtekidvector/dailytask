import { Art, type ArtName } from "./Illus";
import { useLocation } from "wouter";
import { useViewer } from "../lib/viewer";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import type { MemberDTO, Status } from "@shared/schemas";
import { hue, initials } from "../lib/format";

/** Avatar fill colours: the brand palette. */
const AVATAR = ["#C9D6FF", "#E4F7A0", "#FFD3E0", "#FFE0B8", "#CBEFE0", "#DAD3FF"];

export function Avatar({ m, big, src }: { m: Pick<MemberDTO, "email" | "name" | "role" | "hasPhoto" | "photoV">; big?: boolean; src?: string | null }) {
  const cls = "avatar" + (big ? " big" : "");
  const url = src !== undefined ? src : m.hasPhoto ? `/api/team/${encodeURIComponent(m.email)}/photo?v=${m.photoV}` : null;
  if (url) return <img className={cls} src={url} alt="" />;
  return <div className={cls} style={{ background: AVATAR[hue(m.email || m.name || "") % AVATAR.length], color: "var(--ink)" }} aria-hidden="true">{initials(m.name || "?")}</div>;
}

/** Two-tap button: the first tap arms it (and shows `armed`), the second runs `onConfirm`. Disarms after 3 s. */
export function ConfirmButton({ label, armed, onConfirm, className, ariaLabel }: { label: ReactNode; armed: ReactNode; onConfirm: () => void; className: string; ariaLabel?: string }) {
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button type="button" aria-label={ariaLabel} className={className + (on ? " arm" : "")} onClick={() => {
      if (!on) { setOn(true); t.current = setTimeout(() => setOn(false), 3000); return; }
      clearTimeout(t.current); setOn(false); onConfirm();
    }}>{on ? armed : label}</button>
  );
}

export function Bar({ c, total }: { c: Record<Status, number>; total: number }) {
  const p = (n: number) => (total ? (n / total * 100).toFixed(2) + "%" : "0");
  return (
    <div className="stackbar" role="img" aria-label={`${c.done} selesai, ${c.doing} dikerjakan, ${c.todo} belum`}>
      <i className="s-done" style={{ width: p(c.done) }} /><i className="s-doing" style={{ width: p(c.doing) }} />
    </div>
  );
}
export const tally = (list: { status: Status }[]) => {
  const c: Record<Status, number> = { todo: 0, doing: 0, done: 0 };
  for (const t of list) c[t.status]++;
  return c;
};

export const Center = ({ children }: { children: ReactNode }) => <div className="center"><div>{children}</div></div>;
export const Loading = () => (
  <div className="shell" aria-busy="true" aria-label="Memuat">
    <aside className="side"><div className="logo"><i />Tugas Harian</div>{[0, 1, 2, 3, 4].map(i => <div key={i} className="sk" style={{ height: 46, borderRadius: 999 }} />)}</aside>
    <div className="frame"><div className="sk" style={{ height: 44, width: "40%" }} /><div className="sk" style={{ height: 46, borderRadius: 999 }} />
      <div className="tiles">{[0, 1, 2, 3].map(i => <div key={i} className="sk" style={{ height: 160, borderRadius: 32 }} />)}</div></div>
  </div>
);
/** Placeholder block while data loads. */
export const Skeleton = ({ h = 16, w = "100%" }: { h?: number; w?: number | string }) => <div className="sk" style={{ height: h, width: w }} />;

/** Friendly empty state. */
export function Empty({ art = "tasks", title, children }: { art?: ArtName; icon?: ReactNode; title: string; children?: ReactNode }) {
  return <div className="emptyart"><Art name={art} /><b>{title}</b>{children && <p>{children}</p>}</div>;
}

/** Small circular progress with the percentage in the middle. */
export function Ring({ done, total, size = 44 }: { done: number; total: number; size?: number }) {
  const r = 16, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${done} dari ${total} selesai`}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--sunk)" strokeWidth="5" />
      {total > 0 && p > 0 && <circle cx="20" cy="20" r={r} fill="none" stroke={p === 1 ? "var(--lime-d)" : "var(--primary)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} transform="rotate(-90 20 20)" style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)" }} />}
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">{total ? Math.round(p * 100) : "–"}</text>
    </svg>
  );
}

/** A person's name that opens their tasks (managers only; everyone else sees plain text). */
export function PersonLink({ email, children, className }: { email: string; children: ReactNode; className?: string }) {
  const { policy } = useViewer();
  const [, go] = useLocation();
  if (!policy.isManager || !policy.canManage(email)) return <>{children}</>;
  const href = "/daftar?who=" + encodeURIComponent(email);
  return <a href={href} className={"plink " + (className ?? "")} title="Lihat tugasnya" onClick={e => { e.preventDefault(); e.stopPropagation(); go(href); }}>{children}</a>;
}
