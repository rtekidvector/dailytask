import type { Color, Priority, TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { today } from "./format";

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Rendah", normal: "Normal", high: "Tinggi", urgent: "Mendesak" };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const COLOR_LABEL: Record<Color, string> = { lilac: "Ungu", pink: "Merah muda", yellow: "Kuning", lime: "Lime", mint: "Mint", sky: "Biru muda", peach: "Peach", gray: "Abu" };

export const sortTasks = (arr: TaskDTO[]) => arr.slice().sort((a, b) => {
  const st = { todo: 0, doing: 0, done: 1 };
  const da = a.start || a.due || "99:99", db = b.start || b.due || "99:99";
  return st[a.status] - st[b.status] || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (da < db ? -1 : da > db ? 1 : 0) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.createdAt - b.createdAt;
});

/** The day's tasks plus (when viewing today) unfinished ones from earlier days. */
export function splitDay(all: TaskDTO[], date: string) {
  return {
    day: sortTasks(all.filter(t => t.date === date)),
    late: date === today() ? sortTasks(all.filter(t => t.date < date && t.status !== "done")) : [],
  };
}
/** Idle = nothing unfinished for today (including leftovers from earlier days). */
export const isIdle = (all: TaskDTO[] | undefined) => !!all && !all.some(t => t.date <= today() && t.status !== "done");

/** Monday of the week containing `date`. */
export function weekStart(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y!, m! - 1, d).getDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
export const subtaskProgress = (t: TaskDTO) => ({ done: t.subtasks.filter(s => s.done).length, total: t.subtasks.length });
