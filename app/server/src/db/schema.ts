import { sqliteTable, text, integer, blob, index, primaryKey } from "drizzle-orm/sqlite-core";

const bool = (name: string) => integer(name, { mode: "boolean" });

export const members = sqliteTable("members", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  group: text("grp").notNull().default(""),
  isAdmin: bool("is_admin").notNull().default(false),
  adminGroups: text("admin_groups", { mode: "json" }).$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(999),
  photo: blob("photo", { mode: "buffer" }),
  photoV: integer("photo_v").notNull().default(0),
  seenAt: integer("seen_at"),
  askAt: integer("ask_at"),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("lilac"),
  description: text("description").notNull().default(""),
  archived: bool("archived").notNull().default(false),
  createdAt: integer("created_at").notNull(),
  /** Closing report: set when a manager closes the project; cleared when it is reopened. */
  closedAt: integer("closed_at"),
  closedBy: text("closed_by"),
  summary: text("summary").notNull().default(""),
  resultLinks: text("result_links", { mode: "json" }).$type<string[]>().notNull().default([]),
});

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("gray"),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => members.email, { onDelete: "cascade", onUpdate: "cascade" }),
  date: text("date").notNull(),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  /** How many times a manager sent it back for fixes. */
  revisions: integer("revisions").notNull().default(0),
  start: text("start"),
  due: text("due"),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
  hot: bool("hot").notNull().default(false),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  needProof: bool("need_proof").notNull().default(true),
  by: text("by", { enum: ["owner", "self"] }).notNull().default("owner"),
  fromAdmin: text("from_admin"),
  routineId: text("routine_id"),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  doneAt: integer("done_at"),
  returnedAt: integer("returned_at"),
  proofLink: text("proof_link"),
  proofAt: integer("proof_at"),
  hasPhoto: bool("has_photo").notNull().default(false),
  report: text("report"),
  reportAt: integer("report_at"),
  remDue: bool("rem_due").notNull().default(false),
  remLate: bool("rem_late").notNull().default(false),
}, t => [index("tasks_email_date").on(t.email, t.date), index("tasks_date").on(t.date)]);

export const proofs = sqliteTable("proofs", {
  taskId: text("task_id").primaryKey().references(() => tasks.id, { onDelete: "cascade" }),
  data: blob("data", { mode: "buffer" }).notNull(),
  at: integer("at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  by: text("by").notNull(),
  byEmail: text("by_email").notNull().default(""),
  text: text("text").notNull(),
  at: integer("at").notNull(),
}, t => [index("comments_task").on(t.taskId)]);

export const routines = sqliteTable("routines", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => members.email, { onDelete: "cascade", onUpdate: "cascade" }),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  start: text("start"),
  due: text("due"),
  days: text("days", { mode: "json" }).$type<number[]>().notNull(),
  hot: bool("hot").notNull().default(false),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  needProof: bool("need_proof").notNull().default(true),
  byName: text("by_name"),
});

export const links = sqliteTable("links", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  exp: integer("exp").notNull(),
});

export const pushSubs = sqliteTable("push_subs", {
  endpoint: text("endpoint").primaryKey(),
  email: text("email").notNull(),
  sub: text("sub", { mode: "json" }).$type<{ endpoint: string; keys: { p256dh: string; auth: string } }>().notNull(),
}, t => [index("push_email").on(t.email)]);

export const meta = sqliteTable("meta", { k: text("k").primaryKey(), v: text("v").notNull() });

export const taskLabels = sqliteTable("task_labels", {
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  labelId: text("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
}, t => [primaryKey({ columns: [t.taskId, t.labelId] })]);

export const subtasks = sqliteTable("subtasks", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  done: bool("done").notNull().default(false),
  position: integer("position").notNull().default(0),
}, t => [index("subtasks_task").on(t.taskId)]);

/** Who did what to a task (or, with taskId null, to the workspace). Shown as the task timeline and the dashboard feed. */
export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  actorEmail: text("actor_email").notNull(),
  actorName: text("actor_name").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  at: integer("at").notNull(),
}, t => [index("activity_task").on(t.taskId), index("activity_at").on(t.at)]);

/** In-app notification inbox (the bell). Push notifications are sent in addition. */
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  kind: text("kind").notNull(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  at: integer("at").notNull(),
  readAt: integer("read_at"),
}, t => [index("notifications_email").on(t.email, t.at)]);

/** Leave / absence requests: a member asks, a manager approves or rejects. Dates are inclusive WIB calendar days. */
export const leaves = sqliteTable("leaves", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => members.email, { onDelete: "cascade", onUpdate: "cascade" }),
  kind: text("kind", { enum: ["cuti", "izin", "sakit"] }).notNull(),
  from: text("from_date").notNull(),
  to: text("to_date").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  decidedBy: text("decided_by"),
  decidedAt: integer("decided_at"),
  createdAt: integer("created_at").notNull(),
}, t => [index("leaves_email").on(t.email, t.from)]);

/** Work timer: one row per start/stop. A row with no end is a timer that is running now (at most one per person). */
export const timeEntries = sqliteTable("time_entries", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
}, t => [index("time_task").on(t.taskId), index("time_email").on(t.email, t.startedAt)]);

/** Shared equipment, studios and locations that can be booked for a time slot. */
export const resources = sqliteTable("resources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["alat", "studio", "lokasi"] }).notNull().default("alat"),
  note: text("note").notNull().default(""),
  archived: bool("archived").notNull().default(false),
  createdAt: integer("created_at").notNull(),
});
export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  date: text("date").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, t => [index("bookings_slot").on(t.resourceId, t.date)]);
