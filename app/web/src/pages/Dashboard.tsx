import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Hand } from "lucide-react";
import { addDays } from "@shared/time";
import { Page } from "../components/Page";
import { InstallCard, NotifyCard } from "../components/Cards";
import { Links } from "../components/Links";
import { PersonCard } from "../components/PersonCard";
import { PeopleTable } from "../components/PeopleTable";
import { Recap } from "../components/Recap";
import { TaskRow } from "../components/TaskRow";
import { Avatar, Empty, tally } from "../components/ui";
import { api, ok } from "../lib/api";
import { fmtLong, fmtShort, isToday, today } from "../lib/format";
import { awayOn } from "../lib/leaves";
import { useAction, useFeed, useLeaves, useRoutines, useTasks, windowFrom } from "../lib/queries";
import { isIdle, sortTasks, splitDay } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import type { MemberDTO, TaskDTO } from "@shared/schemas";
import { atMs } from "@shared/time";
import { QuickAddSelf } from "../components/QuickAddSelf";
import { Attention, attention } from "../components/Attention";
import { Achievements } from "../components/Achievements";
import { Bento } from "../components/Bento";
import { fmtTime } from "../lib/format";

const now = () => Date.now();

function Feed({ limit = 8 }: { limit?: number }) {
  const q = useFeed(true), { openTask } = useUi(), { member, me } = useViewer();
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`; };
  const items = (q.data ?? []).slice(0, limit);
  return (
    <section className="surface"><div className="surface-h"><h2>Aktivitas terbaru</h2></div>
      <ul className="feed">
        {items.map(a => { const m = member(a.actorEmail); return (
          <li key={a.id}>
            {m ? <Avatar m={m} /> : <span className="avatar sm" style={{ background: "var(--dark)", width: 30, height: 30 }}>{a.actorName[0]}</span>}
            <div><div className="clamp2"><b>{a.actorEmail === me.email ? "Kamu" : a.actorName}</b> {a.text}</div>{a.taskTitle && <button className="clamp1" title={a.taskTitle} onClick={() => a.taskId && openTask(a.taskId)}>{a.taskTitle}</button>}<small>{ago(a.at)}</small></div>
          </li>); })}
        {!items.length && <li><Empty art="activity" title="Belum ada aktivitas" /></li>}
      </ul>
    </section>
  );
}

function Upcoming({ tasks, date }: { tasks: TaskDTO[]; date: string }) {
  const { openTask } = useUi(), { member } = useViewer();
  const list = sortTasks(tasks.filter(t => t.status !== "done" && t.date === date && t.due)).sort((a, b) => a.due!.localeCompare(b.due!)).slice(0, 6);
  return (
    <section className="surface"><div className="surface-h"><h2>Tenggat {date === today() ? "hari ini" : fmtShort(date)}</h2></div>
      <ul className="feed">
        {list.map(t => { const late = now() > atMs(t.date, t.due!); return (
          <li key={t.id}><span className={"tag " + (late ? "hot" : "due")} style={{ height: "fit-content" }}>{t.due}</span>
            <div><button onClick={() => openTask(t.id)}>{t.title}</button><small>{member(t.email)?.name}{late ? " · terlambat" : ""}</small></div></li>); })}
        {!list.length && <li><Empty art="calendar" title="Tidak ada tenggat" /></li>}
      </ul>
    </section>
  );
}

function ManagerDashboard() {
  const { team, policy, me, member } = useViewer();
  const { date, setDate, newTask } = useUi();
  const [tab, setTab] = useState("orang");
  const [unit, setUnit] = useState("");
  const [view, setView] = useState<"tabel" | "kartu">(() => { try { return localStorage.getItem("th-people-view") === "kartu" ? "kartu" : "tabel"; } catch { return "tabel"; } });
  const pickView = (v: "tabel" | "kartu") => { setView(v); try { localStorage.setItem("th-people-view", v); } catch { /* private mode */ } };
  const [recapDays, setRecapDays] = useState<7 | 14>(7);
  const tq = useTasks(windowFrom(addDays(date, -recapDays), today()), true);
  const rq = useRoutines(true);
  const loaded = tq.isSuccess && !tq.isPlaceholderData;
  const tasks = tq.data ?? [];
  const byPerson = useMemo(() => Map.groupBy(tasks, t => t.email), [tasks]);
  const units = [...new Set(team.map(m => m.group).filter(Boolean))].sort();
  const myUnits = policy.isBoss ? units : policy.groups;
  const workers = team.filter(m => !m.isAdmin && policy.canManage(m.email) && (!unit || m.group === unit));
  const shown = workers.flatMap(m => { const { day, late } = splitDay(byPerson.get(m.email) ?? [], date); return day.concat(late); });
  const leaves = useLeaves(true).data ?? [];
  const idle = loaded && date === today() ? workers.filter(m => !awayOn(leaves, m.email, date) && isIdle(byPerson.get(m.email) ?? [])) : [];
  const a = attention(tasks, policy.canManage), attn = a.late.length + a.review.length + a.stuck.length;
  const asking = idle.filter(m => isToday(m.askAt));
  return (
    <Page title={<>Halo, <em>{(member(me.email)?.name ?? me.name).split(" ")[0]}</em></>} sub={`${fmtLong(date)} · ${workers.length} orang${policy.isBoss ? "" : " · Admin " + policy.groups.join(", ")}`} dateNav
      tabs={[{ id: "orang", label: "Ringkasan" }, { id: "perhatian", label: `Perhatian${attn ? ` (${attn})` : ""}` }, { id: "rekap", label: "Rekap" }, { id: "aktivitas", label: "Aktivitas" }]} tab={tab} onTab={setTab}
      actions={myUnits.length > 1 ? <div className="chips">
        <button className="chip" aria-pressed={!unit} onClick={() => setUnit("")}>Semua unit</button>
        {myUnits.map(g => <button key={g} className="chip" aria-pressed={unit === g} onClick={() => setUnit(g)}>{g}</button>)}
      </div> : undefined}>
      <InstallCard /><NotifyCard manager />
      {tab === "orang" && <Bento all={tasks.filter(t => workers.some(w => w.email === t.email))} day={shown} date={date} idle={idle.length} people={workers.filter(m => shown.some(t => t.email === m.email && t.status !== "done"))} />}
      <Links />
      {idle.length > 0 && (
        <section className="warnbox" aria-label="Orang tanpa tugas">
          <span className="warnico" aria-hidden="true">!</span>
          <div className="txt"><b>{idle.length} orang tidak punya tugas aktif hari ini{asking.length ? `, ${asking.length} sudah minta tugas` : ""}</b>
            <div className="idle-list" style={{ marginTop: 6 }}>
              {idle.map(m => <button key={m.email} className="chip" title={"Beri tugas untuk " + m.name} onClick={() => newTask({ emails: [m.email] })}>{isToday(m.askAt) && <Hand size={13} />}<span className="clamp1">{m.name}</span><span>+</span></button>)}
            </div></div>
        </section>
      )}
      {tab === "orang" && (
        <>
          {workers.length
            ? <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <div className="seg" role="group" aria-label="Tampilan orang" style={{ justifySelf: "end" }}>
                  <button aria-pressed={view === "tabel"} onClick={() => pickView("tabel")}>Tabel</button>
                  <button aria-pressed={view === "kartu"} onClick={() => pickView("kartu")}>Kartu</button>
                </div>
                {view === "tabel"
                  ? <PeopleTable people={workers} byPerson={byPerson} routines={rq.data ?? []} date={date} loaded={loaded} />
                  : <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))" }} aria-label="Tugas per orang">
                      {workers.map(m => <PersonCard key={m.email} m={m} tasks={byPerson.get(m.email) ?? []} routines={(rq.data ?? []).filter(r => r.email === m.email)} date={date} loaded={loaded} />)}
                    </section>}
              </div>
            : <div className="surface"><h2>Daftar tim masih kosong</h2><p className="muted">Tambahkan anggota di halaman Tim.</p></div>}
          <div className="two2"><Upcoming tasks={tasks} date={date} /><Feed /></div>
        </>
      )}
      {tab === "perhatian" && <Attention tasks={tasks} />}
      {tab === "rekap" && <Recap people={workers} tasks={tasks} date={date} days={recapDays} onDays={setRecapDays} onPick={d => { setDate(d); setTab("orang"); }} loaded={loaded} />}
      {tab === "aktivitas" && <Feed limit={25} />}
    </Page>
  );
}

function MemberDashboard() {
  const { me, member } = useViewer();
  const { date, setDate } = useUi();
  const [tab, setTab] = useState("hari");
  const m = member(me.email)!;
  const tq = useTasks(windowFrom(date, today()), true);
  const loaded = tq.isSuccess && !tq.isPlaceholderData;
  const mine = tq.data ?? [];
  const { day, late } = splitDay(mine, date);
  const all = day.concat(late);
  const todayView = date === today();
  const ask = useAction(() => ok(api.ask.$post()), { done: "Permintaan tugas terkirim ke admin" });
  const asked = isToday(m.askAt);
  const upcoming = sortTasks(mine.filter(t => t.date > date && t.status !== "done"));
  const finished = mine.filter(t => t.status === "done").sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30);
  return (
    <Page title={<>Halo, <em>{m.name.split(" ")[0]}</em></>} sub={`${m.name} · ${m.role} · ${fmtLong(date)}`} dateNav
      tabs={[{ id: "hari", label: todayView ? "Hari ini" : fmtShort(date) }, { id: "depan", label: `Mendatang${upcoming.length ? ` (${upcoming.length})` : ""}` }, { id: "selesai", label: "Selesai" }]} tab={tab} onTab={setTab}>
      <InstallCard /><NotifyCard manager={false} />
      <Bento all={mine} day={all} date={date} people={[]} />
      <Achievements tasks={mine} date={date} />
      {todayView && loaded && isIdle(mine) && (
        <section className="warnbox" role="status">
          <span className="warnico" aria-hidden="true">!</span>
          {asked
            ? <div className="txt"><b>Permintaan terkirim jam {fmtTime(m.askAt!)}</b>Admin sudah diberi tahu. Tugas baru akan muncul di sini otomatis.</div>
            : <div className="txt"><b>Kamu tidak punya tugas aktif</b>{all.length ? "Semua tugas hari ini sudah selesai. Minta tugas berikutnya ke admin." : "Belum ada tugas untukmu hari ini. Minta tugas ke admin."}</div>}
          {!asked && <button className="btn primary" onClick={() => ask.mutate()}>Minta tugas ke admin</button>}
        </section>
      )}
      {tab === "hari" && <>
        {late.length > 0 && <section className="list"><h2>Belum selesai dari hari sebelumnya</h2><ul className="tasks">{late.map(t => <TaskRow key={t.id} t={t} canDelete={t.by === "self"} isLate />)}</ul></section>}
        <section className="list">
          <h2>{todayView ? "Tugas hari ini" : "Tugas " + fmtShort(date)}</h2>
          {day.length ? <ul className="tasks">{day.map(t => <TaskRow key={t.id} t={t} canDelete={t.by === "self"} />)}</ul>
            : <p className="empty">{loaded ? "Belum ada tugas. Tugas dari atasan akan muncul di sini, atau tambahkan sendiri di bawah." : "Memuat…"}</p>}
          <QuickAddSelf email={m.email} date={date} />
        </section>
      </>}
      {tab === "depan" && <section className="list"><h2>Tugas mendatang</h2>{upcoming.length ? <ul className="tasks">{upcoming.map(t => <TaskRow key={t.id} t={t} canDelete={t.by === "self"} />)}</ul> : <p className="empty">Tidak ada tugas mendatang.</p>}</section>}
      {tab === "selesai" && <section className="list"><h2>Baru selesai</h2>{finished.length ? <ul className="tasks">{finished.map(t => <TaskRow key={t.id} t={t} canDelete={false} />)}</ul> : <p className="empty">Belum ada tugas selesai.</p>}</section>}
      <p className="foot">Ketuk status untuk menggantinya: Belum → Dikerjakan → Selesai. Ketuk judul untuk melihat detail, checklist, dan komentar. Atasan dan admin melihat progres ini; anggota tim lain tidak bisa melihat tugasmu.</p>
    </Page>
  );
}

export function Dashboard() { return useViewer().policy.isManager ? <ManagerDashboard /> : <MemberDashboard />; }
