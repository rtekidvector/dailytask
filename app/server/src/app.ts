import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pushSub } from "@shared/schemas";
import { wib } from "@shared/time";
import { members, pushSubs } from "./db/schema.js";
import { toMemberLite } from "./dto.js";
import { endSession, requireUser, startSession } from "./auth.js";
import { createNotify } from "./notify.js";
import { memberColumns, type AppEnv, type Deps } from "./context.js";
import { inboxRoutes } from "./routes/inbox.js";
import { leaveRoutes } from "./routes/leaves.js";
import { timeRoutes } from "./routes/time.js";
import { bookingRoutes, resourceRoutes } from "./routes/resources.js";
import { linkRoutes } from "./routes/links.js";
import { metaRoutes } from "./routes/meta.js";
import { reportRoutes } from "./routes/reports.js";
import { routineRoutes } from "./routes/routines.js";
import { taskRoutes } from "./routes/tasks.js";
import { teamRoutes } from "./routes/team.js";

export function createApp(deps: Deps) {
  const { db, env, push, bus } = deps;
  const nameOf = (email: string) => db.select({ n: members.name }).from(members).where(eq(members.email, email)).get()?.n ?? email;
  const notify = createNotify(push, db, bus, nameOf);
  const auth = requireUser(deps);

  const api = new Hono<AppEnv>()
    // Every write must carry this header: cross-site forms and images cannot add it.
    .use(async (c, next) => c.req.method !== "GET" && c.req.header("x-app") !== "1" ? c.json({ error: "bad request" }, 400) : next())
    .get("/config", c => c.json({ googleClientId: env.GOOGLE_CLIENT_ID, vapidPublicKey: push.publicKey }))
    .post("/auth/google", zValidator("json", z.object({ credential: z.string().min(10) })), async c => {
      try {
        const id = await deps.verifyGoogle(c.req.valid("json").credential);
        if (!id.verified) return c.json({ error: "Email Google belum terverifikasi" }, 403);
        startSession(c, deps, id.email, id.name);
        return c.json({ ok: true });
      } catch (e) { console.warn("login", (e as Error).message); return c.json({ error: "Login Google ditolak" }, 401); }
    })
    // Local preview only: sign in as any registered email without Google. Refused unless explicitly enabled AND served from localhost.
    .post("/auth/dev", zValidator("json", z.object({ email: z.string().email() })), c => {
      const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.PUBLIC_URL);
      if (!env.ALLOW_DEV_LOGIN || !local) return c.json({ error: "not found" }, 404);
      startSession(c, deps, c.req.valid("json").email.toLowerCase(), "Dev");
      return c.json({ ok: true });
    })
    // Same, as a link you can open in the browser: /api/auth/dev?email=owner@demo.id
    .get("/auth/dev", c => {
      const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.PUBLIC_URL);
      const email = c.req.query("email")?.toLowerCase();
      if (!env.ALLOW_DEV_LOGIN || !local || !email) return c.json({ error: "not found" }, 404);
      startSession(c, deps, email, "Dev");
      return c.redirect("/");
    })
    .post("/auth/logout", c => { endSession(c, deps); return c.json({ ok: true }); })
    .get("/me", auth, c => {
      const u = c.var.user;
      // Remember (once a day) that this person has opened the app, so the owner sees who has signed in.
      const m = u.member;
      if (m && (!m.seenAt || wib(m.seenAt).date !== wib().date)) {
        db.update(members).set({ seenAt: Date.now() }).where(eq(members.email, u.email)).run();
        bus.emit("team");
      }
      return c.json({ email: u.email, name: m?.name ?? u.name, owner: u.owner, member: m ? toMemberLite(m) : null });
    })
    .use("/team/*", auth).route("/team", teamRoutes(deps))
    .use("/tasks/*", auth).route("/tasks", taskRoutes(deps, notify))
    .use("/routines/*", auth).route("/routines", routineRoutes(deps))
    .use("/leaves/*", auth).route("/leaves", leaveRoutes(deps, notify))
    .use("/time/*", auth).route("/time", timeRoutes(deps))
    .use("/resources/*", auth).route("/resources", resourceRoutes(deps))
    .use("/bookings/*", auth).route("/bookings", bookingRoutes(deps))
    .use("/links/*", auth).route("/links", linkRoutes(deps))
    .use("/meta/*", auth).route("/meta", metaRoutes(deps))
    .use("/inbox/*", auth).route("/inbox", inboxRoutes(deps))
    .use("/reports/*", auth).route("/reports", reportRoutes(deps))
    // "I have nothing left to do": tells the admins.
    .post("/ask", auth, c => {
      const u = c.var.user;
      if (!u.member) return c.json({ error: "forbidden" }, 403);
      db.update(members).set({ askAt: Date.now() }).where(eq(members.email, u.email)).run();
      bus.emit("team");
      void notify.ask(u.email);
      return c.json({ ok: true });
    })
    .post("/push/subscribe", auth, zValidator("json", pushSub), c => {
      const sub = c.req.valid("json");
      db.insert(pushSubs).values({ endpoint: sub.endpoint, email: c.var.user.email, sub }).onConflictDoUpdate({ target: pushSubs.endpoint, set: { email: c.var.user.email, sub } }).run();
      return c.json({ ok: true });
    })
    .post("/push/unsubscribe", auth, zValidator("json", z.object({ endpoint: z.string() })), c => {
      db.delete(pushSubs).where(and(eq(pushSubs.endpoint, c.req.valid("json").endpoint), eq(pushSubs.email, c.var.user.email))).run();
      return c.json({ ok: true });
    })
    // Server-sent events: only "something changed" signals; the browser refetches what it is allowed to see.
    .get("/events", auth, c => streamSSE(c, async stream => {
      const off = bus.subscribe(topic => { void stream.writeSSE({ event: "change", data: topic }); });
      stream.onAbort(off);
      await stream.writeSSE({ event: "ready", data: "" });
      while (!stream.aborted) { await stream.sleep(25_000); await stream.writeSSE({ event: "ping", data: "" }); }
    }));

  return new Hono()
    .use(async (c, next) => { await next(); c.header("x-content-type-options", "nosniff"); c.header("referrer-policy", "same-origin"); })
    .route("/api", api);
}
export type AppType = ReturnType<typeof createApp>;
