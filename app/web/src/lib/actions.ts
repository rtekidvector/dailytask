import type { Priority, TaskDTO } from "@shared/schemas";
import { api, ok } from "./api";
import { keys, useAction } from "./queries";

const refresh = [keys.tasks, keys.activity, keys.analytics, keys.team];

/** Mutations on one task. Each one toasts on failure and refreshes the task lists. */
export function useTaskActions(t: Pick<TaskDTO, "id">) {
  const id = t.id, param = { id };
  return {
    setStatus: useAction((status: TaskDTO["status"]) => ok(api.tasks[":id"].status.$patch({ param, json: { status } })), { refresh }),
    remove: useAction(() => ok(api.tasks[":id"].$delete({ param })), { done: "Tugas dihapus", refresh }),
    nudge: useAction(() => ok(api.tasks[":id"].nudge.$post({ param })), { done: "Pengingat terkirim", refresh: [keys.activity, keys.inbox] }),
    giveBack: useAction(() => ok(api.tasks[":id"].return.$post({ param })), { done: "Tugas dikembalikan. Tulis alasannya di komentar.", refresh }),
    saveReport: useAction((report: string) => ok(api.tasks[":id"].report.$put({ param, json: { report } })), { done: "Catatan disimpan", refresh }),
    patch: useAction((json: Parameters<(typeof api.tasks)[":id"]["$patch"]>[0]["json"]) => ok(api.tasks[":id"].$patch({ param, json })), { refresh }),
    addSubtask: useAction((title: string) => ok(api.tasks[":id"].subtasks.$post({ param, json: { title } })), { refresh }),
    toggleSubtask: useAction((v: { sid: string; done: boolean }) => ok(api.tasks[":id"].subtasks[":sid"].$patch({ param: { id, sid: v.sid }, json: { done: v.done } })), { refresh }),
    removeSubtask: useAction((sid: string) => ok(api.tasks[":id"].subtasks[":sid"].$delete({ param: { id, sid } })), { refresh }),
    comment: useAction((v: { text: string; mentions: string[] }) => ok(api.tasks[":id"].comments.$post({ param, json: v })), { refresh }),
    removeComment: useAction((cid: string) => ok(api.tasks[":id"].comments[":cid"].$delete({ param: { id, cid } })), { refresh }),
  };
}
export type { Priority };
