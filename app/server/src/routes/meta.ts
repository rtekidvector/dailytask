import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { labelInput, projectClose, projectInput } from "@shared/schemas";
import { labels, projects, sessions, tasks } from "../db/schema.js";
import { toLabel, toProject } from "../dto.js";
import { logActivity } from "../services.js";
import { newId, type AppEnv, type Deps } from "../context.js";

// Projects (campaigns) and labels: everyone can read, the owner and admins manage them.
export const metaRoutes = ({ db, bus, env }: Deps) => {
  const guard = new Hono<AppEnv>().use(async (c, next) => c.var.user.policy.isManager ? next() : c.json({ error: "forbidden" }, 403));
  return new Hono<AppEnv>()
    .get("/", c => c.json({
      owner: { email: env.OWNER_EMAIL, name: db.select({ n: sessions.name }).from(sessions).where(eq(sessions.email, env.OWNER_EMAIL)).orderBy(desc(sessions.exp)).get()?.n ?? "Pemilik" },
      projects: db.select().from(projects).orderBy(asc(projects.createdAt)).all().map(toProject),
      labels: db.select().from(labels).orderBy(asc(labels.name)).all().map(toLabel),
    }))
    .route("/", guard
      .post("/projects", zValidator("json", projectInput), c => {
        const row = { id: newId(), ...c.req.valid("json"), createdAt: Date.now() };
        db.insert(projects).values(row).run();
        bus.emit("meta");
        return c.json(toProject({ ...row, closedAt: null, closedBy: null, summary: "", resultLinks: [] }), 201);
      })
      .patch("/projects/:id", zValidator("json", projectInput.partial()), c => {
        db.update(projects).set(c.req.valid("json")).where(eq(projects.id, c.req.param("id"))).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      // Closing report: a summary and result links. Open tasks need an explicit `force`, so nobody closes a project by accident.
      .post("/projects/:id/close", zValidator("json", projectClose), c => {
        const u = c.var.user, p = db.select().from(projects).where(eq(projects.id, c.req.param("id"))).get(), b = c.req.valid("json");
        if (!p) return c.json({ error: "not found" }, 404);
        if (p.closedAt) return c.json({ error: "Proyek ini sudah ditutup." }, 409);
        const open = db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.projectId, p.id), ne(tasks.status, "done"))).all().length;
        if (open && !b.force) return c.json({ error: `Masih ada ${open} tugas yang belum selesai.`, open }, 409);
        db.update(projects).set({ closedAt: Date.now(), closedBy: u.email, summary: b.summary, resultLinks: b.links }).where(eq(projects.id, p.id)).run();
        logActivity(db, u, null, "project", `menutup proyek ${p.name}`);
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .post("/projects/:id/reopen", c => {
        const p = db.select().from(projects).where(eq(projects.id, c.req.param("id"))).get();
        if (!p) return c.json({ error: "not found" }, 404);
        db.update(projects).set({ closedAt: null, closedBy: null }).where(eq(projects.id, p.id)).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .delete("/projects/:id", c => {
        if (!c.var.user.policy.isBoss) return c.json({ error: "forbidden" }, 403);
        db.delete(projects).where(eq(projects.id, c.req.param("id"))).run();
        bus.emit("meta"); bus.emit("tasks");
        return c.json({ ok: true });
      })
      .post("/labels", zValidator("json", labelInput), c => {
        const row = { id: newId(), ...c.req.valid("json") };
        db.insert(labels).values(row).run();
        bus.emit("meta");
        return c.json(toLabel(row), 201);
      })
      .patch("/labels/:id", zValidator("json", labelInput.partial()), c => {
        db.update(labels).set(c.req.valid("json")).where(eq(labels.id, c.req.param("id"))).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .delete("/labels/:id", c => {
        db.delete(labels).where(eq(labels.id, c.req.param("id"))).run();
        bus.emit("meta"); bus.emit("tasks");
        return c.json({ ok: true });
      }));
};
