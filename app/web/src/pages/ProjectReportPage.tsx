import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, CalendarRange, CheckCheck, ExternalLink, FolderKanban, History, Image as ImageIcon, ListChecks, Plus, Printer, RotateCcw, Timer, Users } from "lucide-react";
import type { ProjectReportDTO } from "@shared/schemas";
import { CloseProject } from "../components/CloseProject";
import { Art } from "../components/Illus";
import { Page } from "../components/Page";
import { hm } from "../components/TimeTracker";
import { Avatar, Empty, PersonLink } from "../components/ui";
import { api, ok } from "../lib/api";
import { fmtShort, host, today } from "../lib/format";
import { keys, useAction, useFeed, useMeta, useProjectReport } from "../lib/queries";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";

type T = ProjectReportDTO["tasks"][number];
const day = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
const ST = { todo: "Belum", doing: "Dikerjakan", done: "Selesai" } as const;
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) : 0);

function Ring({ value, size = 96 }: { value: number; size?: number }) {
  return (
    <div className="pring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="var(--glass)" strokeWidth="4.5" /><circle cx="20" cy="20" r="16" fill="none" stroke="var(--d, var(--blue))" strokeWidth="4.5" strokeLinecap="round" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 20 20)" style={{ transition: "stroke-dasharray .6s ease" }} /></svg>
      <b style={{ fontSize: size / 4.2 }}>{value}%</b>
    </div>
  );
}

function Overview({ d }: { d: ProjectReportDTO }) {
  const { member } = useViewer(), { openTask } = useUi();
  const { stats: s, tasks, project: p } = d;
  const done = tasks.filter(t => t.status === "done");
  const people = useMemo(() => [...Map.groupBy(tasks, t => t.email)].map(([email, l]) => ({ email, name: l[0]!.name, total: l.length, done: l.filter(t => t.status === "done").length })).sort((a, b) => b.total - a.total), [tasks]);
  const next = tasks.filter(t => t.status !== "done").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const prio = (["urgent", "high", "normal", "low"] as const).map(k => ({ k, n: tasks.filter(t => t.priority === k && t.status !== "done").length }));
  const maxP = Math.max(1, ...prio.map(x => x.n));
  return (
    <div className="bento" data-c={p.color}>
      <section className="bc s4">
        <div className="bc-h"><span className="bc-ico green"><CheckCheck size={18} /></span><h3>Penyelesaian</h3></div>
        <div className="mid-n">{s.done}<small> dari {s.total} tugas</small></div>
        <div className="split" style={{ height: 14 }} aria-hidden="true"><i style={{ flex: s.done || 0.0001, background: "var(--d, var(--blue))" }} /><i style={{ flex: s.open || 0.0001, background: "var(--glass)" }} /></div>
        <div className="legend"><span style={{ ["--k" as string]: "var(--d, var(--blue))" }}>Selesai {s.done}</span><span style={{ ["--k" as string]: "var(--sunk)" }}>Terbuka {s.open}</span></div>
      </section>
      <section className="bc s4">
        <div className="bc-h"><span className="bc-ico"><CalendarRange size={18} /></span><h3>Ketepatan waktu</h3></div>
        <div className="mid-n">{done.length ? pct(s.onTime, s.done) + "%" : "–"}</div>
        <p className="muted" style={{ fontSize: ".82rem" }}>{s.onTime} tepat waktu · {s.late} terlambat dari {s.done} selesai</p>
        <div className="legend"><span style={{ ["--k" as string]: "var(--ok)" }}>Bukti {pct(s.withProof, s.done)}%</span><span style={{ ["--k" as string]: "var(--warn)" }}>Revisi {s.revisions}×</span></div>
      </section>
      <section className="bc s4">
        <div className="bc-h"><span className="bc-ico lime"><Timer size={18} /></span><h3>Waktu tercatat</h3></div>
        <div className="mid-n">{s.minutes ? hm(s.minutes) : "–"}</div>
        <p className="muted" style={{ fontSize: ".82rem" }}>{s.minutes ? `rata-rata ${hm(Math.round(s.minutes / Math.max(1, s.done)))} per tugas selesai` : "Belum ada timer yang dijalankan"}</p>
      </section>

      <section className="bc s6">
        <div className="bc-h"><span className="bc-ico"><Users size={18} /></span><h3>Progres per orang</h3><span className="muted">{people.length}</span></div>
        <div className="plist">{people.map(x => { const m = member(x.email); return (
          <div key={x.email} className="tbar who" style={{ gridTemplateColumns: "170px minmax(0,1fr) 54px" }}><span className="nm">{m && <Avatar m={m} />}<span className="clamp1"><PersonLink email={x.email}>{x.name}</PersonLink></span></span><div><i style={{ width: `${pct(x.done, x.total)}%` }} /></div><b>{x.done}/{x.total}</b></div>); })}</div>
        {!people.length && <Empty art="people" title="Belum ada tugas" />}
      </section>
      <section className="bc s6">
        <div className="bc-h"><span className="bc-ico red"><ListChecks size={18} /></span><h3>Berikutnya</h3><span className="muted">{s.open} terbuka</span></div>
        <ul className="alist">{next.map(t => (
          <li key={t.id} className="arow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <div style={{ minWidth: 0 }}><button className="linkbtn clamp1" style={{ textDecoration: "none", textAlign: "left", maxWidth: "100%" }} onClick={() => openTask(t.id)}>{t.title}</button><small className="muted">{t.name} · {fmtShort(t.date)}</small></div>
            <span className={"tag " + t.priority}>{PRIORITY_LABEL[t.priority]}</span>
          </li>))}</ul>
        {!next.length && <Empty art="calendar" title="Tidak ada tugas terbuka" />}
        <div className="legend" style={{ marginTop: "auto" }}>{prio.map(x => <span key={x.k} style={{ ["--k" as string]: x.k === "urgent" ? "var(--bad)" : x.k === "high" ? "var(--warn)" : "var(--c-gray)" }}>{PRIORITY_LABEL[x.k]} {x.n}</span>)}</div>
        <div className="split" style={{ height: 8 }} aria-hidden="true">{prio.map(x => <i key={x.k} style={{ flex: x.n / maxP || 0.0001, background: x.k === "urgent" ? "var(--bad)" : x.k === "high" ? "var(--warn)" : x.k === "normal" ? "var(--blue)" : "var(--sunk)" }} />)}</div>
      </section>
      {(p.summary || p.links.length > 0) && (
        <section className="bc s12">
          <div className="bc-h"><span className="bc-ico green"><FolderKanban size={18} /></span><h3>Ringkasan hasil</h3></div>
          {p.summary && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{p.summary}</p>}
          {p.links.length > 0 && <div className="chips">{p.links.map(l => <a key={l} className="chip" href={l} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{host(l)}</a>)}</div>}
        </section>
      )}
    </div>
  );
}

function Tasks({ tasks }: { tasks: T[] }) {
  const { openTask } = useUi(), { member } = useViewer();
  const [f, setF] = useState<"" | T["status"]>("");
  const rows = tasks.filter(t => !f || t.status === f);
  return (
    <section className="bc">
      <div className="bc-h"><h3>Semua tugas</h3><div className="seg" role="group" aria-label="Status"><button aria-pressed={!f} onClick={() => setF("")}>Semua {tasks.length}</button>{(["todo", "doing", "done"] as const).map(s => <button key={s} aria-pressed={f === s} onClick={() => setF(s)}>{ST[s]} {tasks.filter(t => t.status === s).length}</button>)}</div></div>
      <table className="htable" style={{ tableLayout: "fixed" }}>
        <thead><tr><th style={{ width: "38%" }}>Tugas</th><th className="hide-s">Penerima</th><th>Tanggal</th><th className="hide-s">Prioritas</th><th style={{ width: 120 }}>Status</th></tr></thead>
        <tbody>{rows.map(t => { const m = member(t.email), late = t.status !== "done" && t.date < today(); return (
          <tr key={t.id} className="hr" onClick={() => openTask(t.id)}>
            <td><span className="nm"><b>{t.title}</b>{t.revisions > 0 && <span className="tag off">Revisi {t.revisions}×</span>}</span></td>
            <td className="hide-s"><span className="nm">{m && <Avatar m={m} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span></span></td>
            <td>{fmtShort(t.date)}</td><td className="hide-s"><span className={"tag " + t.priority}>{PRIORITY_LABEL[t.priority]}</span></td>
            <td><span className={"stpill " + (late ? "late" : t.status)}>{late ? "Terlambat" : ST[t.status]}</span></td>
          </tr>); })}</tbody>
      </table>
      {!rows.length && <Empty art="search" title="Tidak ada tugas" />}
    </section>
  );
}

function Proofs({ tasks }: { tasks: T[] }) {
  const { openTask } = useUi();
  const [zoom, setZoom] = useState<string | null>(null);
  const done = tasks.filter(t => t.status === "done");
  return (
    <section className="bc">
      <div className="bc-h"><span className="bc-ico"><ImageIcon size={18} /></span><h3>Bukti dan hasil per tugas</h3><span className="muted">{done.length}</span></div>
      <div className="proofgrid">{done.map(t => (
        <article key={t.id} className="proofcard">
          {t.hasPhoto ? <button className="thumbbig" onClick={() => setZoom(t.id)} aria-label={`Perbesar bukti ${t.title}`}><img src={`/api/tasks/${t.id}/proof`} alt="" loading="lazy" /></button> : <div className="thumbbig empty">Tanpa foto</div>}
          <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
            <button className="linkbtn clamp2" style={{ textAlign: "left", textDecoration: "none", fontSize: ".9rem" }} onClick={() => openTask(t.id)}>{t.title}</button>
            <small className="muted">{t.name} · {fmtShort(t.date)}{t.minutes ? " · " + hm(t.minutes) : ""}{t.revisions ? ` · revisi ${t.revisions}×` : ""}</small>
            {t.proofLink && <a className="chip" style={{ width: "fit-content" }} href={t.proofLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{host(t.proofLink)}</a>}
            {t.report && <p className="clamp3" style={{ fontSize: ".8rem", color: "var(--muted)" }}>{t.report}</p>}
          </div>
        </article>))}</div>
      {!done.length && <Empty art="tasks" title="Belum ada tugas selesai">Bukti muncul di sini saat tugas diselesaikan.</Empty>}
      {zoom && <div className="lightbox" role="dialog" onClick={() => setZoom(null)}><img src={`/api/tasks/${zoom}/proof`} alt="Foto bukti" /></div>}
    </section>
  );
}

function Activity({ ids }: { ids: Set<string> }) {
  const { member, me } = useViewer(), { openTask } = useUi();
  const items = (useFeed(true, 100).data ?? []).filter(a => a.taskId && ids.has(a.taskId));
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`; };
  return (
    <section className="bc"><div className="bc-h"><span className="bc-ico"><History size={18} /></span><h3>Aktivitas proyek</h3></div>
      <div className="tline"><div>{items.map(a => { const m = member(a.actorEmail); return (
        <div key={a.id} className="it">{m ? <Avatar m={m} /> : <span className="avatar">{a.actorName[0]}</span>}
          <div style={{ minWidth: 0 }}><div><b>{a.actorEmail === me.email ? "Kamu" : a.actorName}</b> {a.text}</div>{a.taskTitle && <button className="linkbtn clamp1" style={{ maxWidth: "100%", textAlign: "left" }} onClick={() => a.taskId && openTask(a.taskId)}>{a.taskTitle}</button>}</div>
          <small>{ago(a.at)}</small></div>); })}</div></div>
      {!items.length && <Empty art="activity" title="Belum ada aktivitas" />}
    </section>
  );
}

/** Project detail: header card with progress and actions, then Overview / Tasks / Proof / Activity. Closed projects read as the final report. */
export function ProjectReportPage() {
  const [, params] = useRoute("/proyek/:id");
  const id = params?.id ?? "";
  const q = useProjectReport(id), d = q.data;
  const { member, policy } = useViewer(), { newTask } = useUi();
  const owner = useMeta(true).data?.owner;
  const [, go] = useLocation();
  const [tab, setTab] = useState("ringkas"), [closing, setClosing] = useState(false);
  const reopen = useAction(() => ok(api.meta.projects[":id"].reopen.$post({ param: { id } })), { done: "Proyek dibuka kembali", refresh: [keys.meta, keys.analytics] });
  if (!d) return <Page title="Detail proyek"><p className="muted">{q.isError ? "Proyek tidak ditemukan." : "Memuat…"}</p></Page>;
  const { project: p, stats: s, tasks } = d;
  const closer = p.closedBy ? member(p.closedBy)?.name ?? (p.closedBy === owner?.email ? owner.name : p.closedBy) : null;
  const dates = tasks.map(t => t.date).sort(), who = [...new Set(tasks.map(t => t.email))].map(e => member(e)).filter(Boolean);
  const progress = pct(s.done, s.total);
  return (
    <Page noNew title={p.name} sub={<Link href="/proyek" className="plink" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ArrowLeft size={14} />Semua proyek</Link>}
      tabs={[{ id: "ringkas", label: "Ringkasan" }, { id: "tugas", label: `Tugas (${s.total})` }, { id: "bukti", label: "Bukti" }, { id: "aktivitas", label: "Aktivitas" }]} tab={tab} onTab={setTab}
      actions={<button className="btn small" onClick={() => window.print()}><Printer size={14} />Cetak</button>}>
      <section className="projhead" data-c={p.color}>
        <Ring value={progress} />
        <div className="ph-main">
          <div className="chips"><span className={"stpill " + (p.closedAt ? "done" : "doing")}>{p.closedAt ? "Selesai" : "Berjalan"}</span>
            {dates.length > 0 && <span className="chip"><CalendarRange size={13} />{fmtShort(dates[0]!)} – {fmtShort(dates[dates.length - 1]!)}</span>}
            <span className="chip"><ListChecks size={13} />{s.total} tugas</span></div>
          <p className="muted" style={{ maxWidth: "62ch" }}>{p.description || "Belum ada deskripsi proyek."}</p>
          {p.closedAt && <small className="muted">Ditutup {day(p.closedAt)}{closer ? " oleh " + closer : ""}</small>}
        </div>
        <div className="ph-side">
          <span className="avatars">{who.slice(0, 6).map(m => <Avatar key={m!.email} m={m!} />)}{who.length > 6 && <span className="avatar sm">+{who.length - 6}</span>}</span>
          <div className="chips">
            {!p.closedAt && <button className="btn blue" onClick={() => newTask({ projectId: p.id })}><Plus size={15} />Tambah tugas</button>}
            {policy.isManager && (p.closedAt ? <button className="btn" disabled={reopen.isPending} onClick={() => reopen.mutate()}><RotateCcw size={14} />Buka kembali</button> : <button className="btn primary" onClick={() => setClosing(true)}>Tutup proyek</button>)}
          </div>
        </div>
      </section>
      {tab === "ringkas" && <Overview d={d} />}
      {tab === "tugas" && <Tasks tasks={tasks} />}
      {tab === "bukti" && <Proofs tasks={tasks} />}
      {tab === "aktivitas" && <Activity ids={new Set(tasks.map(t => t.id))} />}
      {closing && <CloseProject p={p} openTasks={s.open} onClose={() => { setClosing(false); go("/proyek/" + p.id); }} />}
    </Page>
  );
}
