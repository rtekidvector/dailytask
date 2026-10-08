import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { commentCreate, subtaskCreate, subtaskPatch, taskCreate, taskPatch, taskReport, taskStatus, type Priority } from "@shared/schemas";
import { addDays, weekday, wib } from "@shared/time";
import { activity, comments, labels, members, projects, proofs, routines, subtasks, taskLabels, tasks } from "../db/schema.js";
import { toActivity, toComment } from "../dto.js";
import { loadTeam, newId, type AppEnv, type Deps, type User } from "../context.js";
import type { Notify } from "../notify.js";
import { hydrate, logActivity } from "../services.js";

const MAX_PROOF = 1_500_000;
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isHot = (p: Priority) => p === "high" || p === "urgent";
const PRIORITY_LABEL: Record<Priority, string> = { low: "rendah", normal: "normal", high: "tinggi", urgent: "mendesak" };

export const taskRoutes = ({ db, bus, env }: Deps, notify: Notify) => {
  const find = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get();
  const touch = () => bus.emit("tasks");
  const log = (u: User, taskId: string, kind: string, text: string) => logActivity(db, u, taskId, kind, text);
  const who = (u: User) => u.member?.name ?? u.name;
  const setLabels = (taskId: string, labelIds: string[]) => {
    db.delete(taskLabels).where(eq(taskLabels.taskId, taskId)).run();
    const known = labelIds.length ? new Set(db.select({ id: labels.id }).from(labels).where(inArray(labels.id, labelIds)).all().map(l => l.id)) : new Set<string>();
    for (const labelId of known) db.insert(taskLabels).values({ taskId, labelId }).run();
  };
  const projectOk = (id: string | null | undefined) => !id || !!db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  /** May this user change the task's content (not just its status)? Managers: anyone's. Members: only tasks they made themselves. */
  const canEdit = (u: User, t: typeof tasks.$inferSelect) => u.policy.canManage(t.email) || (u.email === t.email && !!u.member && t.by === "self");
  const canWork = (u: User, t: typeof tasks.$inferSelect) => u.policy.canManage(t.email) || (u.email === t.email && !!u.member);

  return new Hono<AppEnv>()
    // Tasks from `from` onward that the caller may see.
    .get("/", c => {
      const u = c.var.user, from = c.req.query("from") ?? addDays(wib().date, -30);
      const team = loadTeam(db);
      const visible = u.policy.isBoss ? null : team.map(m => m.email).filter(e => u.policy.canSee(e));
      if (visible && !visible.length) return c.json([]);
      const rows = db.select().from(tasks)
        .where(visible ? and(gte(tasks.date, from), inArray(tasks.email, visible)) : gte(tasks.date, from)).all();
      return c.json(hydrate(db, rows));
    })
    .get("/:id", c => {
      const t = find(c.req.param("id"));
      if (!t || !c.var.user.policy.canSee(t.email)) return c.json({ error: "not found" }, 404);
      return c.json(hydrate(db, [t])[0]!);
    })
    .post("/", zValidator("json", taskCreate), c => {
      const u = c.var.user, b = c.req.valid("json"), now = Date.now(), today = wib().date;
      const team = loadTeam(db);
      const emails = [...new Set(b.emails)];
      for (const e of emails) if (!team.some(m => m.email === e)) return c.json({ error: "Anggota tidak ditemukan" }, 404);
      if (!projectOk(b.projectId)) return c.json({ error: "Proyek tidak ditemukan" }, 404);
      const priority: Priority = b.hot && b.priority === "normal" ? "high" : b.priority;

      const self = !u.policy.isManager;
      if (self && (!u.member || emails.length !== 1 || emails[0] !== u.email || b.routineDays)) return c.json({ error: "forbidden" }, 403);
      if (!self && emails.some(e => !u.policy.canManage(e))) return c.json({ error: "forbidden" }, 403);

      const made: (typeof tasks.$inferSelect)[] = [];
      db.transaction(tx => {
        for (const email of emails) {
          const base = {
            email, title: b.title, note: self ? "" : b.note, start: b.start ?? null, due: b.due ?? null, hot: isHot(priority), priority,
            projectId: b.projectId ?? null, needProof: self ? false : b.needProof, by: self ? "self" as const : "owner" as const,
            fromAdmin: self ? null : u.member?.name ?? u.name, createdAt: now,
          };
          if (b.routineDays?.length) {
            const rid = newId(4);
            tx.insert(routines).values({ id: rid, email, title: b.title, note: b.note, start: base.start, due: base.due, days: [...new Set(b.routineDays)].sort(), hot: base.hot, priority, projectId: base.projectId, needProof: b.needProof, byName: base.fromAdmin }).run();
            if (b.routineDays.includes(weekday(today))) {
              const row = { ...base, id: `r-${rid}-${today}`, date: today, routineId: rid };
              tx.insert(tasks).values(row).run();
              tx.insert(activity).values({ id: newId(), taskId: row.id, actorEmail: u.email, actorName: who(u), kind: "created", text: "membuat tugas rutin", at: now }).run();
            }
          } else {
            const row = { ...base, id: newId(), date: b.date ?? today };
            tx.insert(tasks).values(row).run();
            b.subtasks.forEach((title, i) => tx.insert(subtasks).values({ id: newId(), taskId: row.id, title, position: i }).run());
            for (const labelId of b.labelIds) tx.insert(taskLabels).values({ taskId: row.id, labelId }).onConflictDoNothing().run();
            tx.insert(activity).values({ id: newId(), taskId: row.id, actorEmail: u.email, actorName: who(u), kind: "created", text: self ? "membuat tugas sendiri" : `memberi tugas kepada ${team.find(m => m.email === email)?.name ?? email}`, at: now }).run();
            made.push(tx.select().from(tasks).where(eq(tasks.id, row.id)).get()!);
          }
          if (!self) tx.update(members).set({ askAt: null }).where(eq(members.email, email)).run();
        }
      });
      if (!self) made.forEach(t => void notify.newTask(t));
      touch(); bus.emit("team");
      return c.json({ ids: made.map(t => t.id) }, 201);
    })
    // Edit content, schedule, priority, project, labels, or hand the task to someone else.
    .patch("/:id", zValidator("json", taskPatch), c => {
      const u = c.var.user, t = find(c.req.param("id")), b = c.req.valid("json");
      if (!t) return c.json({ error: "not found" }, 404);
      if (!canEdit(u, t)) return c.json({ error: "forbidden" }, 403);
      if (b.projectId !== undefined && !projectOk(b.projectId)) return c.json({ error: "Proyek tidak ditemukan" }, 404);
      const manager = u.policy.canManage(t.email);
      if (!manager && (b.email !== undefined || b.needProof !== undefined)) return c.json({ error: "forbidden" }, 403);
      if (b.email !== undefined && b.email !== t.email) {
        if (!loadTeam(db).some(m => m.email === b.email) || !u.policy.canManage(b.email)) return c.json({ error: "forbidden" }, 403);
      }
      const { labelIds, ...cols } = b;
      const patch: Partial<typeof tasks.$inferInsert> = { ...cols };
      if (b.priority) patch.hot = isHot(b.priority);
      if (b.date !== undefined || b.start !== undefined || b.due !== undefined) { patch.remDue = false; patch.remLate = false; }
      const start = b.start === undefined ? t.start : b.start, due = b.due === undefined ? t.due : b.due;
      if (start && due && start >= due) return c.json({ error: "Jam selesai harus setelah jam mulai" }, 400);

      const notes: string[] = [];
      if (b.title !== undefined && b.title !== t.title) notes.push("mengubah judul");
      if (b.note !== undefined && b.note !== t.note) notes.push("mengubah deskripsi");
      if ((b.date !== undefined && b.date !== t.date) || (b.start !== undefined && b.start !== t.start) || (b.due !== undefined && b.due !== t.due))
        notes.push(`mengatur jadwal ke ${b.date ?? t.date}${start || due ? ` ${start ?? "…"}–${due ?? "…"}` : ""}`);
      if (b.priority && b.priority !== t.priority) notes.push(`mengubah prioritas menjadi ${PRIORITY_LABEL[b.priority]}`);
      if (b.projectId !== undefined && b.projectId !== t.projectId) notes.push("memindahkan proyek");
      if (labelIds) notes.push("mengubah label");
      const reassigned = b.email !== undefined && b.email !== t.email;
      db.transaction(() => {
        if (Object.keys(patch).length) db.update(tasks).set(patch).where(eq(tasks.id, t.id)).run();
        if (labelIds) setLabels(t.id, labelIds);
        if (reassigned) { db.update(members).set({ askAt: null }).where(eq(members.email, b.email!)).run(); }
      });
      if (reassigned) {
        const to = loadTeam(db).find(m => m.email === b.email)?.name ?? b.email!;
        notes.push(`mengalihkan tugas ke ${to}`);
        void notify.assigned({ ...t, email: b.email! }, who(u));
      }
      if (notes.length) log(u, t.id, reassigned ? "assigned" : "edited", notes.join(", "));
      touch();
      return c.json({ ok: true });
    })
    .patch("/:id/status", zValidator("json", taskStatus), c => {
      const u = c.var.user, t = find(c.req.param("id")), { status } = c.req.valid("json");
      if (!t) return c.json({ error: "not found" }, 404);
      if (!canWork(u, t)) return c.json({ error: "forbidden" }, 403);
      // Members finish a task through /complete (proof); managers can set it directly.
      if (status === "done" && !u.policy.canManage(t.email)) return c.json({ error: "Selesaikan tugas lewat form bukti" }, 400);
      const now = Date.now();
      db.update(tasks).set({
        status,
        doneAt: status === "done" ? now : null,
        ...(status === "done" ? { returnedAt: null } : {}),
        ...(status === "doing" && !t.startedAt ? { startedAt: now } : {}),
      }).where(eq(tasks.id, t.id)).run();
      if (status !== t.status) log(u, t.id, "status", status === "done" ? "menyelesaikan tugas" : status === "doing" ? "mulai mengerjakan" : "mengembalikan ke belum dikerjakan");
      touch();
      if (status === "done") void notify.done({ ...t, status }, u.email);
      return c.json({ ok: true });
    })
    // Mark done with proof: multipart { photo?: JPEG, link?, note?, skipProof? }.
    .post("/:id/complete", async c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t) return c.json({ error: "not found" }, 404);
      if (!canWork(u, t)) return c.json({ error: "forbidden" }, 403);
      const form = await c.req.parseBody();
      const photo = form.photo instanceof File && form.photo.size ? new Uint8Array(await form.photo.arrayBuffer()) : null;
      let link = typeof form.link === "string" ? form.link.trim() : "";
      const note = typeof form.note === "string" ? form.note.trim().slice(0, 600) : "";
      const skip = form.skipProof === "1";
      if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
      if (link && !URL.canParse(link)) return c.json({ error: "Link tidak valid" }, 400);
      if (photo && (!isJpeg(photo) || photo.length > MAX_PROOF)) return c.json({ error: "Foto harus JPG dan kurang dari 1,5 MB" }, 400);
      if (!skip && !photo && !link) return c.json({ error: "Lampirkan foto atau link sebagai bukti" }, 400);
      if (skip && t.needProof && !u.policy.canManage(t.email)) return c.json({ error: "Tugas ini wajib bukti" }, 400);
      const now = Date.now();
      db.transaction(tx => {
        if (photo) tx.insert(proofs).values({ taskId: t.id, data: Buffer.from(photo), at: now }).onConflictDoUpdate({ target: proofs.taskId, set: { data: Buffer.from(photo), at: now } }).run();
        if (!skip && !photo) tx.delete(proofs).where(eq(proofs.taskId, t.id)).run();
        tx.update(tasks).set({
          status: "done", doneAt: now, returnedAt: null,
          ...(skip ? {} : { proofLink: link || null, proofAt: now, hasPhoto: !!photo }),
          ...(note ? { report: note, reportAt: now } : {}),
        }).where(eq(tasks.id, t.id)).run();
      });
      log(u, t.id, "status", skip ? "menyelesaikan tugas" : "menyelesaikan tugas dengan bukti");
      touch();
      void notify.done({ ...t, status: "done" }, u.email);
      return c.json({ ok: true });
    })
    .post("/:id/return", c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t) return c.json({ error: "not found" }, 404);
      if (!u.policy.canManage(t.email) || t.status !== "done" || t.by === "self") return c.json({ error: "forbidden" }, 403);
      db.update(tasks).set({ status: "doing", doneAt: null, returnedAt: Date.now(), revisions: t.revisions + 1 }).where(eq(tasks.id, t.id)).run();
      log(u, t.id, "returned", "mengembalikan tugas untuk diperbaiki");
      touch();
      void notify.returned(t);
      return c.json({ ok: true });
    })
    // A manager's reminder to the assignee. At most one per task per hour, so it can't be used to spam.
    .post("/:id/nudge", c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t) return c.json({ error: "not found" }, 404);
      if (!u.policy.canManage(t.email) || t.email === u.email || t.status === "done") return c.json({ error: "forbidden" }, 403);
      const last = db.select({ at: activity.at }).from(activity).where(and(eq(activity.taskId, t.id), eq(activity.kind, "nudged"))).orderBy(desc(activity.at)).get();
      if (last && Date.now() - last.at < 3_600_000) return c.json({ error: "Sudah diingatkan kurang dari satu jam lalu." }, 429);
      log(u, t.id, "nudged", "mengingatkan tugas ini");
      touch();
      void notify.nudged(t, who(u));
      return c.json({ ok: true });
    })
    .put("/:id/report", zValidator("json", taskReport), c => {
      const u = c.var.user, t = find(c.req.param("id")), { report } = c.req.valid("json");
      if (!t) return c.json({ error: "not found" }, 404);
      if (!canWork(u, t)) return c.json({ error: "forbidden" }, 403);
      db.update(tasks).set({ report: report || null, reportAt: report ? Date.now() : null }).where(eq(tasks.id, t.id)).run();
      touch();
      return c.json({ ok: true });
    })
    .delete("/:id", c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t) return c.json({ ok: true });
      const ownSelf = u.email === t.email && !!u.member && t.by === "self";
      if (!ownSelf && !u.policy.canManage(t.email)) return c.json({ error: "forbidden" }, 403);
      db.delete(tasks).where(eq(tasks.id, t.id)).run();
      touch();
      return c.json({ ok: true });
    })
    .get("/:id/proof", c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t || !u.policy.canSee(t.email)) return c.body(null, 404);
      const p = db.select().from(proofs).where(eq(proofs.taskId, t.id)).get();
      if (!p) return c.body(null, 404);
      return c.body(new Uint8Array(p.data), 200, { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" });
    })
    // ---- checklist
    .post("/:id/subtasks", zValidator("json", subtaskCreate), c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t || !u.policy.canSee(t.email)) return c.json({ error: "not found" }, 404);
      if (!canWork(u, t)) return c.json({ error: "forbidden" }, 403);
      const pos = db.select({ p: subtasks.position }).from(subtasks).where(eq(subtasks.taskId, t.id)).orderBy(desc(subtasks.position)).get()?.p ?? -1;
      const row = { id: newId(), taskId: t.id, title: c.req.valid("json").title, position: pos + 1 };
      db.insert(subtasks).values(row).run();
      touch();
      return c.json({ id: row.id, title: row.title, done: false }, 201);
    })
    .patch("/:id/subtasks/:sid", zValidator("json", subtaskPatch), c => {
      const u = c.var.user, t = find(c.req.param("id")), b = c.req.valid("json");
      const s = db.select().from(subtasks).where(eq(subtasks.id, c.req.param("sid"))).get();
      if (!t || !s || s.taskId !== t.id || !u.policy.canSee(t.email)) return c.json({ error: "not found" }, 404);
      if (!canWork(u, t)) return c.json({ error: "forbidden" }, 403);
      db.update(subtasks).set(b).where(eq(subtasks.id, s.id)).run();
      if (b.done !== undefined && b.done !== s.done) log(u, t.id, "subtask", `${b.done ? "mencentang" : "membatalkan centang"} "${s.title}"`);
      touch();
      return c.json({ ok: true });
    })
    .delete("/:id/subtasks/:sid", c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t || !u.policy.canSee(t.email)) return c.json({ ok: true });
      if (!canWork(u, t)) return c.json({ error: "forbidden" }, 403);
      db.delete(subtasks).where(and(eq(subtasks.id, c.req.param("sid")), eq(subtasks.taskId, t.id))).run();
      touch();
      return c.json({ ok: true });
    })
    // ---- comments (with @mentions) and timeline
    .post("/:id/comments", zValidator("json", commentCreate), c => {
      const u = c.var.user, t = find(c.req.param("id")), b = c.req.valid("json");
      if (!t || !u.policy.canSee(t.email)) return c.json({ error: "not found" }, 404);
      const row = { id: newId(), taskId: t.id, by: who(u), byEmail: u.email, text: b.text, at: Date.now() };
      db.insert(comments).values(row).run();
      log(u, t.id, "comment", "menulis komentar");
      // Only people who can see the task are worth mentioning: its assignee, the owner, and admins who manage the assignee.
      const team = loadTeam(db);
      const audience = new Set([t.email, ...team.filter(m => m.isAdmin).map(m => m.email), env.OWNER_EMAIL]);
      const mentioned = [...new Set(b.mentions)].filter(e => e !== u.email && audience.has(e));
      if (mentioned.length) void notify.mention(mentioned, t, who(u), b.text);
      const counterpart = (u.email === t.email ? [] : [t.email]).filter(e => !mentioned.includes(e) && e !== u.email);
      if (counterpart.length) void notify.commented(counterpart, t, who(u), b.text);
      touch();
      return c.json(toComment(row), 201);
    })
    .delete("/:id/comments/:cid", c => {
      const u = c.var.user, t = find(c.req.param("id"));
      const cm = db.select().from(comments).where(eq(comments.id, c.req.param("cid"))).get();
      if (!t || !cm || cm.taskId !== t.id) return c.json({ ok: true });
      if (cm.byEmail !== u.email && !u.policy.canManage(t.email)) return c.json({ error: "forbidden" }, 403);
      db.delete(comments).where(eq(comments.id, cm.id)).run();
      touch();
      return c.json({ ok: true });
    })
    .get("/:id/activity", c => {
      const t = find(c.req.param("id"));
      if (!t || !c.var.user.policy.canSee(t.email)) return c.json({ error: "not found" }, 404);
      return c.json(db.select().from(activity).where(eq(activity.taskId, t.id)).orderBy(asc(activity.at)).all().map(a => toActivity(a, t.title)));
    });
};
