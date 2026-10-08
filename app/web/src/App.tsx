import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Redirect, Route, Switch, useLocation, useSearchParams } from "wouter";
import { Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { makePolicy } from "@shared/policy";
import type { MeDTO } from "@shared/schemas";
import { Login } from "./components/Login";
import { NewTaskDialog } from "./components/NewTaskDialog";
import { TopNav } from "./components/Page";
import { SearchDialog } from "./components/SearchDialog";
import { TaskDrawer } from "./components/TaskDrawer";
import { Center, Loading } from "./components/ui";
import { today } from "./lib/format";
import { registerPush, pushSupported } from "./lib/push";
import { useLive, useMe, useMeta, useTeam } from "./lib/queries";
import { UiContext, ViewerContext, type NewTaskPrefill, type Ui, type Viewer } from "./lib/viewer";
import { ProjectReportPage } from "./pages/ProjectReportPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LeavePage } from "./pages/LeavePage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { TasksPage } from "./pages/TasksPage";
import { Board } from "./pages/Board";
import { CalendarPage } from "./pages/CalendarPage";
import { Dashboard } from "./pages/Dashboard";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TeamPage } from "./pages/TeamPage";
import { api, ok } from "./lib/api";
import { keys } from "./lib/queries";

function Signed({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  useLive(qc, true);
  const teamQ = useTeam(true), metaQ = useMeta(true);
  const [date, setDate] = useState(today());
  const [params, setParams] = useSearchParams();
  const [, nav] = useLocation();
  const [newTask, setNewTask] = useState<NewTaskPrefill | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [, tick] = useReducer(n => n + 1, 0);
  const lastDay = useRef(today());

  // Roll the day over if the app stays open past midnight, and refresh "late" labels each minute.
  useEffect(() => {
    const id = setInterval(() => {
      const t = today();
      if (t !== lastDay.current) { const old = lastDay.current; lastDay.current = t; setDate(d => d === old ? t : d); }
      tick();
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  // Devices that already allowed notifications re-register on every start (subscriptions can expire).
  useEffect(() => { if (pushSupported() && Notification.permission === "granted") registerPush().catch(e => console.warn("push", e)); }, [me.email]);
  useEffect(() => {
    let g = 0; // time of the last "g": the next key picks a page
    const pages: Record<string, string> = { d: "/", p: "/papan", l: "/daftar", k: "/kalender", y: "/proyek", t: "/tim", r: "/laporan", h: "/riwayat", i: "/izin", a: "/alat" };
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); return; }
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (Date.now() - g < 900 && pages[k]) { g = 0; nav(pages[k]!); return; }
      g = 0;
      if (k === "g") g = Date.now();
      else if (k === "n") { e.preventDefault(); setNewTask({}); }
      else if (k === "/") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const taskId = params.get("t");
  const openTask = useCallback((id: string) => setParams(p => { const n = new URLSearchParams(p); n.set("t", id); return n; }), [setParams]);
  const closeTask = useCallback(() => setParams(p => { const n = new URLSearchParams(p); n.delete("t"); return n; }), [setParams]);
  const ui = useMemo<Ui>(() => ({ date, setDate, openTask, closeTask, taskId, newTask: p => setNewTask(p ?? {}), openSearch: () => setSearchOpen(true) }), [date, openTask, closeTask, taskId]);

  const viewer = useMemo<Viewer | null>(() => {
    if (!teamQ.data || !metaQ.data) return null;
    const team = teamQ.data, { projects, labels } = metaQ.data;
    return {
      me, team, policy: makePolicy(me.email, me.owner, team), projects, labels,
      member: e => team.find(m => m.email === e), project: id => (id ? projects.find(p => p.id === id) : undefined), label: id => labels.find(l => l.id === id),
    };
  }, [me, teamQ.data, metaQ.data]);

  if (teamQ.isError || metaQ.isError) return <Center><p className="muted">Gagal memuat data. Periksa koneksi lalu muat ulang.</p></Center>;
  if (!viewer) return <Loading />;
  if (!viewer.policy.isManager && !me.member) return <NotRegistered email={me.email} />;
  return (
    <ViewerContext value={viewer}>
      <UiContext value={ui}>
        <div className="shell">
          <TopNav />
          <main className="frame">
            <Switch>
              <Route path="/"><Dashboard /></Route>
              <Route path="/papan"><Board /></Route>
              <Route path="/daftar"><TasksPage /></Route>
              <Route path="/kalender"><CalendarPage /></Route>
              <Route path="/tim">{viewer.policy.isManager ? <TeamPage /> : <Redirect to="/" />}</Route>
              <Route path="/proyek"><ProjectsPage /></Route>
              <Route path="/proyek/:id"><ProjectReportPage /></Route>
              <Route path="/riwayat"><HistoryPage /></Route>
              <Route path="/struktur"><Redirect to="/tim" /></Route>
              <Route path="/izin"><LeavePage /></Route>
              <Route path="/alat"><ResourcesPage /></Route>
              <Route path="/laporan"><ReportsPage /></Route>
              <Route path="/pengaturan"><SettingsPage /></Route>
              <Route><Redirect to="/" /></Route>
            </Switch>
          </main>
        </div>
        {taskId && <TaskDrawer id={taskId} />}
        {newTask && <NewTaskDialog key={JSON.stringify(newTask)} prefill={newTask} date={date} onClose={() => setNewTask(null)} onTemplate={setNewTask} />}
        {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
      </UiContext>
    </ViewerContext>
  );
}

function NotRegistered({ email }: { email: string }) {
  const qc = useQueryClient();
  return (
    <Center>
      <h1 style={{ fontSize: "1.5rem" }}>Email belum terdaftar</h1>
      <p className="muted">Kamu masuk sebagai <b>{email}</b>. Email ini belum ada di daftar tim.</p>
      <p className="muted">Kirim email ini ke pemilik aplikasi supaya ditambahkan, lalu buka aplikasi lagi. Atau keluar dan masuk dengan akun Google lain.</p>
      <button className="btn" onClick={async () => { await ok(api.auth.logout.$post()); qc.clear(); await qc.invalidateQueries({ queryKey: keys.me }); }}>Keluar</button>
    </Center>
  );
}

export function App() {
  const me = useMe();
  return (
    <>
      {me.isPending ? <Loading /> : me.data ? <Signed me={me.data} /> : <Login />}
      <Toaster position="bottom-center" richColors closeButton />
    </>
  );
}
