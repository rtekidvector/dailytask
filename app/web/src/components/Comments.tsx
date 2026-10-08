import { useMemo, useRef, useState, type ReactNode } from "react";
import type { TaskDTO } from "@shared/schemas";
import { fmtTime } from "../lib/format";
import { useTaskActions } from "../lib/actions";
import { useViewer } from "../lib/viewer";
import { Avatar, ConfirmButton } from "./ui";

interface Person { email: string; name: string; member?: Parameters<typeof Avatar>[0]["m"] }

/** Comments on a task. Typing "@" offers the people who can see the task. */
export function Comments({ t, ownerName, ownerEmail }: { t: TaskDTO; ownerName: string; ownerEmail: string }) {
  const { me, team, policy, member } = useViewer();
  const a = useTaskActions(t);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Person[]>([]);
  const [q, setQ] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  // People worth mentioning: the assignee, every admin, and the owner.
  const people = useMemo<Person[]>(() => {
    const list: Person[] = [];
    const add = (email: string) => { const m = member(email); if (m && !list.some(p => p.email === email)) list.push({ email, name: m.name, member: m }); };
    add(t.email); team.filter(m => m.isAdmin).forEach(m => add(m.email));
    if (!list.some(p => p.email === ownerEmail)) list.push({ email: ownerEmail, name: ownerName });
    return list.filter(p => p.email !== me.email);
  }, [t.email, team, member, me.email, ownerEmail, ownerName]);
  const matches = q === null ? [] : people.filter(p => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);

  const onChange = (v: string) => {
    setText(v);
    const m = /(?:^|\s)@([\p{L}\d]*)$/u.exec(v.slice(0, ref.current?.selectionStart ?? v.length));
    setQ(m ? m[1]! : null); setSel(0);
  };
  const choose = (p: Person) => {
    const pos = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@[\p{L}\d]*$/u, `@${p.name} `);
    setText(before + text.slice(pos)); setQ(null);
    setPicked(x => x.some(y => y.email === p.email) ? x : [...x, p]);
    ref.current?.focus();
  };
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    const mentions = picked.filter(p => body.includes("@" + p.name)).map(p => p.email);
    a.comment.mutate({ text: body, mentions }, { onSuccess: () => { setText(""); setPicked([]); } });
  };
  const names = people.map(p => p.name).sort((x, y) => y.length - x.length);
  const render = (s: string): ReactNode => {
    if (!names.length) return s;
    const re = new RegExp(`(@(?:${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
    return s.split(re).map((part, i) => i % 2 ? <span key={i} className="mention">{part}</span> : part);
  };
  return (
    <div className="cmt">
      {t.comments.map(c => (
        <div className="c" key={c.id}>
          <b>{c.by}</b>: {render(c.text)}<small>{fmtTime(c.at)}</small>
          {(c.byEmail === me.email || policy.canManage(t.email)) && <ConfirmButton className="" ariaLabel="Hapus komentar" label="✕" armed="Hapus?" onConfirm={() => a.removeComment.mutate(c.id)} />}
        </div>
      ))}
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        {matches.length > 0 && (
          <div className="mentionpop" role="listbox">
            {matches.map((p, i) => (
              <button key={p.email} type="button" role="option" aria-selected={i === sel} onMouseDown={e => { e.preventDefault(); choose(p); }}>
                {p.member ? <Avatar m={p.member} /> : <span className="avatar" style={{ background: "var(--dark)", color: "var(--dark-ink)" }}>{p.name[0]}</span>}{p.name}
              </button>
            ))}
          </div>
        )}
        <input ref={ref} className="input" value={text} placeholder="Tulis komentar… ketik @ untuk menyebut orang" maxLength={600} aria-label={"Komentar untuk " + t.title}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (!matches.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => (s + 1) % matches.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => (s + matches.length - 1) % matches.length); }
            else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(matches[sel]!); }
            else if (e.key === "Escape") setQ(null);
          }} />
        <button className="btn small primary" type="submit" disabled={a.comment.isPending || !text.trim()}>Kirim</button>
      </form>
    </div>
  );
}
