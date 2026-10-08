import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { leaveCreate, leaveDecision } from "@shared/schemas";
import { addDays, wib } from "@shared/time";
import { leaves } from "../db/schema.js";
import { toLeave } from "../dto.js";
import { newId, type AppEnv, type Deps } from "../context.js";
import type { Notify } from "../notify.js";
import { logActivity } from "../services.js";

const MAX_DAYS = 60;
const span = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000) + 1;

// Leave requests: a member asks for days off; the managers of that person decide.
export const leaveRoutes = ({ db, bus }: Deps, notify: Notify) => new Hono<AppEnv>()
  .get("/", c => {
    const u = c.var.user;
    return c.json(db.select().from(leaves).orderBy(desc(leaves.from)).limit(500).all().filter(l => l.email === u.email || u.policy.canManage(l.email)).map(toLeave));
  })
  .post("/", zValidator("json", leaveCreate), c => {
    const u = c.var.user, b = c.req.valid("json");
    if (!u.member) return c.json({ error: "Hanya anggota tim yang bisa mengajukan." }, 403);
    if (b.to < b.from) return c.json({ error: "Tanggal selesai harus sama atau setelah tanggal mulai." }, 400);
    if (b.from < addDays(wib().date, -7)) return c.json({ error: "Tanggal terlalu lampau." }, 400);
    if (span(b.from, b.to) > MAX_DAYS) return c.json({ error: `Maksimal ${MAX_DAYS} hari sekali ajuan.` }, 400);
    const clash = db.select().from(leaves).where(eq(leaves.email, u.email)).all().some(l => l.status !== "rejected" && l.from <= b.to && l.to >= b.from);
    if (clash) return c.json({ error: "Sudah ada pengajuan pada tanggal itu." }, 409);
    const row = { id: newId(), email: u.email, ...b, status: "pending" as const, createdAt: Date.now() };
    db.insert(leaves).values(row).run();
    logActivity(db, u, null, "leave", `mengajukan ${b.kind} ${b.from === b.to ? b.from : `${b.from} s/d ${b.to}`}`);
    bus.emit("leaves");
    void notify.leaveRequested(u.email, u.member.name, b.kind, b.from, b.to);
    return c.json(toLeave({ ...row, decidedBy: null, decidedAt: null }), 201);
  })
  .patch("/:id/decision", zValidator("json", leaveDecision), c => {
    const u = c.var.user, l = db.select().from(leaves).where(eq(leaves.id, c.req.param("id"))).get();
    if (!l) return c.json({ error: "not found" }, 404);
    if (l.email === u.email || !u.policy.canManage(l.email)) return c.json({ error: "forbidden" }, 403);
    if (l.status !== "pending") return c.json({ error: "Pengajuan ini sudah diputuskan." }, 409);
    const { status } = c.req.valid("json");
    db.update(leaves).set({ status, decidedBy: u.email, decidedAt: Date.now() }).where(eq(leaves.id, l.id)).run();
    bus.emit("leaves");
    void notify.leaveDecided(l.email, status === "approved", l.kind, l.from, l.to);
    return c.json({ ok: true });
  })
  .delete("/:id", c => {
    const u = c.var.user, l = db.select().from(leaves).where(eq(leaves.id, c.req.param("id"))).get();
    if (!l) return c.json({ ok: true });
    const own = l.email === u.email && l.status === "pending";
    if (!own && !(l.email !== u.email && u.policy.canManage(l.email))) return c.json({ error: "forbidden" }, 403);
    db.delete(leaves).where(eq(leaves.id, l.id)).run();
    bus.emit("leaves");
    return c.json({ ok: true });
  });
