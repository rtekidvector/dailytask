import type { NewTaskPrefill } from "./viewer";

const KEY = "th-templates";
/** Task templates live in this browser only (title, note, priority, project, labels, checklist). */
export function loadTemplates(): NewTaskPrefill[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter(x => x && typeof x.title === "string") : []; } catch { return []; }
}
export function saveTemplates(list: NewTaskPrefill[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12))); } catch { /* private mode */ }
}
