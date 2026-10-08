import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { bookingCreate, resourceInput, type BookingDTO } from "@shared/schemas";
import { addDays, wib } from "@shared/time";
import { bookings, resources, tasks } from "../db/schema.js";
import { loadTeam, newId, type AppEnv, type Deps } from "../context.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toResource = (r: typeof resources.$inferSelect) => ({ id: r.id, name: r.name, kind: r.kind, note: r.note, archived: r.archived });

/** Shared equipment, studios and locations: everyone sees them, managers maintain the list. */
export const resourceRoutes = ({ db, bus }: Deps) => new Hono<AppEnv>()
  .get("/", c => c.json(db.select().from(resources).orderBy(asc(resources.kind), asc(resources.name)).all().map(toResource)))
  .post("/", zValidator("json", resourceInput), c => {
    if (!c.var.user.policy.isManager) return c.json({ error: "forbidden" }, 403);
    const row = { id: newId(), ...c.req.valid("json"), createdAt: Date.now() };
    db.insert(resources).values(row).run();
    bus.emit("resources");
    return c.json(toResource(row), 201);
  })
  .patch("/:id", zValidator("json", resourceInput.partial()), c => {
    if (!c.var.user.policy.isManager) return c.json({ error: "forbidden" }, 403);
    db.update(resources).set(c.req.valid("json")).where(eq(resources.id, c.req.param("id"))).run();
    bus.emit("resources");
    return c.json({ ok: true });
  })
  .delete("/:id", c => {
    if (!c.var.user.policy.isBoss) return c.json({ error: "forbidden" }, 403);
    db.delete(resources).where(eq(resources.id, c.req.param("id"))).run();
    bus.emit("resources");
    return c.json({ ok: true });
  });

/** Bookings of a resource for a time slot. Overlaps are refused; only the booker (or their manager) can cancel. */
export const bookingRoutes = ({ db, bus }: Deps) => new Hono<AppEnv>()
  .get("/", c => {
    const u = c.var.user, from = DATE.test(c.req.query("from") ?? "") ? c.req.query("from")! : wib().date;
    const to = DATE.test(c.req.query("to") ?? "") ? c.req.query("to")! : addDays(from, 14);
    const rows = db.select({ b: bookings, title: tasks.title, taskEmail: tasks.email }).from(bookings).leftJoin(tasks, eq(bookings.taskId, tasks.id))
      .where(and(gte(bookings.date, from), lte(bookings.date, to))).orderBy(asc(bookings.date), asc(bookings.start)).limit(1000).all();
    return c.json(rows.map(({ b, title, taskEmail }): BookingDTO => ({
      id: b.id, resourceId: b.resourceId, email: b.email, taskId: b.taskId, taskTitle: title && taskEmail && u.policy.canSee(taskEmail) ? title : null,
      date: b.date, start: b.start, end: b.end, note: b.note,
    })));
  })
  .post("/", zValidator("json", bookingCreate), c => {
    const u = c.var.user, b = c.req.valid("json");
    if (!u.member && !u.policy.isManager) return c.json({ error: "forbidden" }, 403);
    if (b.end <= b.start) return c.json({ error: "Jam selesai harus setelah jam mulai." }, 400);
    if (b.date < wib().date) return c.json({ error: "Tanggal sudah lewat." }, 400);
    const r = db.select().from(resources).where(eq(resources.id, b.resourceId)).get();
    if (!r || r.archived) return c.json({ error: "Sumber daya tidak tersedia." }, 400);
    if (b.taskId) {
      const t = db.select().from(tasks).where(eq(tasks.id, b.taskId)).get();
      if (!t || !(u.policy.canManage(t.email) || t.email === u.email)) return c.json({ error: "Tugas tidak valid." }, 400);
    }
    const clash = db.select().from(bookings).where(and(eq(bookings.resourceId, r.id), eq(bookings.date, b.date))).all().find(x => x.start < b.end && x.end > b.start);
    if (clash) {
      const who = loadTeam(db).find(m => m.email === clash.email)?.name ?? clash.email;
      return c.json({ error: `${r.name} sudah dipakai ${who} pukul ${clash.start}–${clash.end}.` }, 409);
    }
    const row = { id: newId(), resourceId: r.id, email: u.email, taskId: b.taskId ?? null, date: b.date, start: b.start, end: b.end, note: b.note, createdAt: Date.now() };
    db.insert(bookings).values(row).run();
    bus.emit("resources");
    return c.json({ id: row.id }, 201);
  })
  .delete("/:id", c => {
    const u = c.var.user, b = db.select().from(bookings).where(eq(bookings.id, c.req.param("id"))).get();
    if (!b) return c.json({ ok: true });
    if (b.email !== u.email && !u.policy.canManage(b.email)) return c.json({ error: "forbidden" }, 403);
    db.delete(bookings).where(eq(bookings.id, b.id)).run();
    bus.emit("resources");
    return c.json({ ok: true });
  });
