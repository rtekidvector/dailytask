import { Hono } from "hono";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { RunningTimerDTO, TimeEntryDTO, TimeReportDTO } from "@shared/schemas";
import { addDays, wib } from "@shared/time";
import { tasks, timeEntries } from "../db/schema.js";
import { loadTeam, newId, type AppEnv, type Deps } from "../context.js";
import { logActivity } from "../services.js";

const MAX_RUN = 12 * 3_600_000; // a forgotten timer counts at most 12 hours
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dto = (e: typeof timeEntries.$inferSelect): TimeEntryDTO => ({ id: e.id, taskId: e.taskId, email: e.email, startedAt: e.startedAt, endedAt: e.endedAt });
const spent = (e: { startedAt: number; endedAt: number | null }, now: number) => Math.max(0, Math.min(e.endedAt ?? now, e.startedAt + MAX_RUN) - e.startedAt);

// Timer: start/stop on a task, who is running now, entries of a task, and a report by person / project / day.
export const timeRoutes = ({ db, bus }: Deps) => {
  const find = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get();
  const stopRunning = (email: string, now: number) => {
    for (const e of db.select().from(timeEntries).where(and(eq(timeEntries.email, email), isNull(timeEntries.endedAt))).all())
      db.update(timeEntries).set({ endedAt: Math.min(now, e.startedAt + MAX_RUN) }).where(eq(timeEntries.id, e.id)).run();
  };
  return new Hono<AppEnv>()
    .get("/running", c => {
      const e = db.select().from(timeEntries).where(and(eq(timeEntries.email, c.var.user.email), isNull(timeEntries.endedAt))).get();
      const t = e && find(e.taskId);
      return c.json((e && t ? { entry: dto(e), taskTitle: t.title } : null) as RunningTimerDTO | null);
    })
    .post("/:taskId/start", c => {
      const u = c.var.user, t = find(c.req.param("taskId")), now = Date.now();
      if (!t) return c.json({ error: "not found" }, 404);
      if (!(u.policy.canManage(t.email) || (u.email === t.email && !!u.member))) return c.json({ error: "forbidden" }, 403);
      if (t.status === "done") return c.json({ error: "Tugas ini sudah selesai." }, 409);
      stopRunning(u.email, now);
      db.insert(timeEntries).values({ id: newId(), taskId: t.id, email: u.email, startedAt: now }).run();
      if (t.status === "todo") { db.update(tasks).set({ status: "doing", startedAt: now }).where(eq(tasks.id, t.id)).run(); logActivity(db, u, t.id, "doing", "mulai mengerjakan"); }
      bus.emit("tasks");
      return c.json({ ok: true });
    })
    .post("/stop", c => { stopRunning(c.var.user.email, Date.now()); bus.emit("tasks"); return c.json({ ok: true }); })
    .get("/task/:taskId", c => {
      const u = c.var.user, t = find(c.req.param("taskId"));
      if (!t || !u.policy.canSee(t.email)) return c.json({ error: "not found" }, 404);
      const rows = db.select().from(timeEntries).where(eq(timeEntries.taskId, t.id)).orderBy(desc(timeEntries.startedAt)).all(), now = Date.now();
      return c.json({ entries: rows.map(dto), totalMin: Math.round(rows.reduce((s, e) => s + spent(e, now), 0) / 60000) });
    })
    .delete("/entry/:id", c => {
      const u = c.var.user, e = db.select().from(timeEntries).where(eq(timeEntries.id, c.req.param("id"))).get();
      if (!e) return c.json({ ok: true });
      if (e.email !== u.email && !u.policy.canManage(e.email)) return c.json({ error: "forbidden" }, 403);
      db.delete(timeEntries).where(eq(timeEntries.id, e.id)).run();
      bus.emit("tasks");
      return c.json({ ok: true });
    })
    .get("/report", c => {
      const u = c.var.user, to = DATE.test(c.req.query("to") ?? "") ? c.req.query("to")! : wib().date;
      const from = DATE.test(c.req.query("from") ?? "") ? c.req.query("from")! : addDays(to, -29), now = Date.now();
      const team = loadTeam(db), emails = [...new Set([...team.map(m => m.email).filter(e => u.policy.canSee(e)), u.email])]; // always includes yourself, even as the owner without a team row
      const out: TimeReportDTO = { from, to, totalMin: 0, perPerson: [], byProject: [], daily: [] };
      if (!emails.length) return c.json(out);
      const lo = Date.parse(from + "T00:00:00+07:00");
      const rows = db.select({ e: timeEntries, projectId: tasks.projectId }).from(timeEntries).innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
        .where(and(gte(timeEntries.startedAt, lo), inArray(timeEntries.email, emails))).all();
      const per = new Map<string, number>(), proj = new Map<string | null, number>(), day = new Map<string, number>();
      for (const { e, projectId } of rows) {
        const d = wib(e.startedAt).date;
        if (d < from || d > to) continue;
        const m = spent(e, now) / 60000;
        per.set(e.email, (per.get(e.email) ?? 0) + m); proj.set(projectId, (proj.get(projectId) ?? 0) + m); day.set(d, (day.get(d) ?? 0) + m);
      }
      const names = new Map([[u.email, u.name], ...team.map(m => [m.email, m.name] as [string, string])]);
      out.perPerson = [...per].map(([email, min]) => ({ email, name: names.get(email) ?? email, min: Math.round(min) })).sort((a, b) => b.min - a.min);
      out.byProject = [...proj].map(([projectId, min]) => ({ projectId, min: Math.round(min) })).sort((a, b) => b.min - a.min);
      for (let d = from; d <= to; d = addDays(d, 1)) out.daily.push({ date: d, min: Math.round(day.get(d) ?? 0) });
      out.totalMin = out.perPerson.reduce((s, p) => s + p.min, 0);
      return c.json(out);
    });
};
