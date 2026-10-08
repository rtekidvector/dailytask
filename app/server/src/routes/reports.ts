import { Hono } from "hono";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { PRIORITIES, type ProjectReportDTO, type AnalyticsDTO, type PersonStat, type Priority } from "@shared/schemas";
import { addDays, atMs, wib } from "@shared/time";
import { labels, members, projects, tasks, taskLabels, timeEntries } from "../db/schema.js";
import { toProject } from "../dto.js";
import { loadTeam, type AppEnv, type Deps, type User } from "../context.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Tasks in [from, to] that the caller may see. */
function visibleTasks({ db }: Deps, u: User, from: string, to: string) {
  const emails = loadTeam(db).map(m => m.email).filter(e => u.policy.canSee(e));
  if (!emails.length) return [];
  return db.select().from(tasks).where(and(gte(tasks.date, from), lte(tasks.date, to), inArray(tasks.email, emails))).all();
}
function range(q: (k: string) => string | undefined) {
  const to = q("to") && DATE.test(q("to")!) ? q("to")! : wib().date;
  const from = q("from") && DATE.test(q("from")!) ? q("from")! : addDays(to, -29);
  return { from, to };
}
const dueMs = (t: typeof tasks.$inferSelect) => (t.due ? atMs(t.date, t.due) : null);
const csv = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

export const reportRoutes = (deps: Deps) => {
  const { db } = deps;
  return new Hono<AppEnv>()
    // One project's closing report: figures plus every task the caller may see, with the proof attached to it.
    .get("/project/:id", c => {
      const u = c.var.user, p = db.select().from(projects).where(eq(projects.id, c.req.param("id"))).get();
      if (!p) return c.json({ error: "not found" }, 404);
      const names = new Map(loadTeam(db).map(m => [m.email, m.name]));
      const rows = db.select().from(tasks).where(eq(tasks.projectId, p.id)).all().filter(t => u.policy.canSee(t.email)).sort((a, b) => a.date.localeCompare(b.date));
      const now = Date.now(), mins = new Map<string, number>();
      if (rows.length) for (const e of db.select().from(timeEntries).where(inArray(timeEntries.taskId, rows.map(t => t.id))).all()) mins.set(e.taskId, (mins.get(e.taskId) ?? 0) + Math.max(0, Math.min(e.endedAt ?? now, e.startedAt + 12 * 3_600_000) - e.startedAt) / 60000);
      const done = rows.filter(t => t.status === "done");
      const onTime = done.filter(t => { const dl = dueMs(t); return !dl || (t.doneAt ?? 0) - dl <= 60000; }).length;
      const out: ProjectReportDTO = {
        project: toProject(p),
        stats: { total: rows.length, done: done.length, open: rows.length - done.length, onTime, late: done.length - onTime, minutes: Math.round([...mins.values()].reduce((s, v) => s + v, 0)), withProof: done.filter(t => t.proofLink || t.hasPhoto).length, revisions: rows.reduce((s, t) => s + t.revisions, 0) },
        tasks: rows.map(t => ({ id: t.id, title: t.title, email: t.email, name: names.get(t.email) ?? t.email, date: t.date, status: t.status, priority: t.priority, doneAt: t.doneAt, hasPhoto: t.hasPhoto, proofLink: t.proofLink, report: t.report, minutes: Math.round(mins.get(t.id) ?? 0), revisions: t.revisions })),
      };
      return c.json(out);
    })
    .get("/analytics", c => {
      const u = c.var.user, { from, to } = range(k => c.req.query(k));
      const rows = visibleTasks(deps, u, from, to), now = Date.now();
      const names = new Map(loadTeam(db).map(m => [m.email, m.name]));

      const per = new Map<string, PersonStat>();
      for (const t of rows) {
        const p = per.get(t.email) ?? { email: t.email, name: names.get(t.email) ?? t.email, total: 0, done: 0, onTime: 0, late: 0, open: 0, overdue: 0 };
        p.total++;
        const dl = dueMs(t);
        if (t.status === "done") { p.done++; if (dl && t.doneAt) (t.doneAt - dl <= 60000 ? p.onTime++ : p.late++); }
        else { p.open++; if (dl && now > dl) p.overdue++; }
        per.set(t.email, p);
      }
      const people = [...per.values()].sort((a, b) => b.done - a.done || b.total - a.total);

      const dayMap = new Map<string, { created: number; done: number }>();
      for (let d = from; d <= to; d = addDays(d, 1)) dayMap.set(d, { created: 0, done: 0 });
      for (const t of rows) {
        const d = dayMap.get(t.date); if (d) { d.created++; if (t.status === "done") d.done++; }
      }
      const byProject = new Map<string | null, { total: number; done: number }>();
      const byPriority = Object.fromEntries(PRIORITIES.map(p => [p, 0])) as Record<Priority, number>;
      for (const t of rows) {
        const b = byProject.get(t.projectId) ?? { total: 0, done: 0 };
        b.total++; if (t.status === "done") b.done++;
        byProject.set(t.projectId, b);
        byPriority[t.priority]++;
      }
      const ids = rows.map(r => r.id);
      const lbl = new Map<string, { total: number; done: number }>();
      if (ids.length) {
        const status = new Map(rows.map(r => [r.id, r.status]));
        for (const tl of db.select().from(taskLabels).where(inArray(taskLabels.taskId, ids)).all()) {
          const b = lbl.get(tl.labelId) ?? { total: 0, done: 0 };
          b.total++; if (status.get(tl.taskId) === "done") b.done++;
          lbl.set(tl.labelId, b);
        }
      }
      const done = rows.filter(t => t.status === "done");
      const judged = people.reduce((a, p) => a + p.onTime + p.late, 0), onTime = people.reduce((a, p) => a + p.onTime, 0);
      const spans = done.filter(t => t.startedAt && t.doneAt && t.doneAt > t.startedAt).map(t => (t.doneAt! - t.startedAt!) / 60000);
      const out: AnalyticsDTO = {
        from, to,
        totals: {
          total: rows.length, done: done.length, open: rows.length - done.length,
          overdue: rows.filter(t => t.status !== "done" && dueMs(t) !== null && now > dueMs(t)!).length,
          onTimeRate: judged ? onTime / judged : null,
          avgCompletionMin: spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : null,
        },
        perPerson: people,
        daily: [...dayMap].map(([date, v]) => ({ date, ...v })),
        byProject: [...byProject].map(([projectId, v]) => ({ projectId, ...v })).sort((a, b) => b.total - a.total),
        byPriority,
        byLabel: [...lbl].map(([labelId, v]) => ({ labelId, ...v })).sort((a, b) => b.total - a.total),
      };
      return c.json(out);
    })
    // Spreadsheet export for managers: one row per task.
    .get("/tasks.csv", c => {
      const u = c.var.user;
      if (!u.policy.isManager) return c.json({ error: "forbidden" }, 403);
      const { from, to } = range(k => c.req.query(k));
      const names = new Map(db.select({ e: members.email, n: members.name }).from(members).all().map(m => [m.e, m.n]));
      const pj = new Map(db.select().from(projects).all().map(p => [p.id, p.name]));
      const lb = new Map(db.select().from(labels).all().map(l => [l.id, l.name]));
      const rows = visibleTasks(deps, u, from, to);
      const tl = Map.groupBy(rows.length ? db.select().from(taskLabels).where(inArray(taskLabels.taskId, rows.map(r => r.id))).all() : [], x => x.taskId);
      const head = ["Tanggal", "Nama", "Email", "Tugas", "Proyek", "Label", "Prioritas", "Status", "Mulai", "Tenggat", "Mulai dikerjakan", "Selesai", "Ketepatan", "Bukti", "Catatan"];
      const fmt = (ms: number | null) => ms ? new Date(ms).toISOString() : "";
      const lines = [head.join(",")].concat(rows.sort((a, b) => a.date.localeCompare(b.date)).map(t => {
        const dl = dueMs(t);
        const punctual = t.status !== "done" || !dl || !t.doneAt ? "" : t.doneAt - dl <= 60000 ? "tepat waktu" : "terlambat";
        return [t.date, names.get(t.email) ?? "", t.email, t.title, t.projectId ? pj.get(t.projectId) ?? "" : "", (tl.get(t.id) ?? []).map(x => lb.get(x.labelId) ?? "").join("; "),
          t.priority, t.status, t.start ?? "", t.due ?? "", fmt(t.startedAt), fmt(t.doneAt), punctual, t.proofLink ?? (t.hasPhoto ? "foto" : ""), t.report ?? ""].map(csv).join(",");
      }));
      return c.body("﻿" + lines.join("\r\n"), 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tugas-${from}_${to}.csv"` });
    });
};
