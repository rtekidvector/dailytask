import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { notificationsRead } from "@shared/schemas";
import { activity, notifications, tasks } from "../db/schema.js";
import { toActivity, toNotification } from "../dto.js";
import { loadTeam, type AppEnv, type Deps } from "../context.js";

// The bell: each person's own notifications. And the activity feed of everything they may see.
export const inboxRoutes = ({ db, bus }: Deps) => new Hono<AppEnv>()
  .get("/notifications", c => {
    const rows = db.select().from(notifications).where(eq(notifications.email, c.var.user.email)).orderBy(desc(notifications.at)).limit(60).all();
    return c.json({ items: rows.map(toNotification), unread: rows.filter(r => r.readAt === null).length });
  })
  .post("/notifications/read", zValidator("json", notificationsRead), c => {
    const { ids } = c.req.valid("json"), me = eq(notifications.email, c.var.user.email);
    db.update(notifications).set({ readAt: Date.now() })
      .where(ids ? and(me, inArray(notifications.id, ids), isNull(notifications.readAt)) : and(me, isNull(notifications.readAt))).run();
    bus.emit("inbox");
    return c.json({ ok: true });
  })
  .get("/activity", c => {
    const u = c.var.user, limit = Math.min(Number(c.req.query("limit")) || 30, 100);
    const rows = db.select({ a: activity, title: tasks.title, email: tasks.email }).from(activity)
      .leftJoin(tasks, eq(activity.taskId, tasks.id)).orderBy(desc(activity.at)).limit(400).all();
    const team = loadTeam(db).map(m => m.email);
    const ok = new Set(team.filter(e => u.policy.canSee(e)));
    return c.json(rows.filter(r => r.email && ok.has(r.email)).slice(0, limit).map(r => toActivity(r.a, r.title)));
  });
