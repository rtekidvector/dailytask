// Shared write helpers: task timeline entries, the in-app inbox, and loading the parts of a task that live in other tables.
import { inArray } from "drizzle-orm";
import type { SubtaskDTO } from "@shared/schemas";
import type { Db } from "./db/index.js";
import { activity, comments, notifications, subtasks, taskLabels, tasks } from "./db/schema.js";
import { toTask } from "./dto.js";
import { newId, type User } from "./context.js";
import type { Bus } from "./events.js";

/** Adds an entry to a task's timeline (or the workspace feed when taskId is null). */
export function logActivity(db: Db, who: Pick<User, "email" | "name" | "member">, taskId: string | null, kind: string, text: string) {
  db.insert(activity).values({ id: newId(), taskId, actorEmail: who.email, actorName: who.member?.name ?? who.name, kind, text, at: Date.now() }).run();
}

/** Puts a message in each person's bell. */
export function deliverInbox(db: Db, bus: Bus, emails: Iterable<string>, kind: string, taskId: string | null, text: string) {
  const now = Date.now(), rows = [...new Set(emails)].map(email => ({ id: newId(), email, kind, taskId, text, at: now }));
  if (!rows.length) return;
  db.insert(notifications).values(rows).run();
  bus.emit("inbox");
}

type TaskRow = typeof tasks.$inferSelect;
/** Tasks as the API returns them: with comments, labels, and subtasks attached. */
export function hydrate(db: Db, rows: TaskRow[]) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const cs = Map.groupBy(db.select().from(comments).where(inArray(comments.taskId, ids)).all(), c => c.taskId);
  const ls = Map.groupBy(db.select().from(taskLabels).where(inArray(taskLabels.taskId, ids)).all(), l => l.taskId);
  const ss = Map.groupBy(db.select().from(subtasks).where(inArray(subtasks.taskId, ids)).all(), s => s.taskId);
  return rows.map(r => toTask(r, {
    comments: (cs.get(r.id) ?? []).sort((a, b) => a.at - b.at),
    labelIds: (ls.get(r.id) ?? []).map(l => l.labelId),
    subtasks: (ss.get(r.id) ?? []).sort((a, b) => a.position - b.position).map((s): SubtaskDTO => ({ id: s.id, title: s.title, done: s.done })),
  }));
}
