import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BookingDTO, ProjectReportDTO, ResourceDTO, ActivityDTO, AnalyticsDTO, LeaveDTO, LinkDTO, MeDTO, MemberDTO, MetaDTO, NotificationDTO, RoutineDTO, RunningTimerDTO, TaskDTO, TimeEntryDTO, TimeReportDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { ApiError, api, ok } from "./api";

export const keys = {
  me: ["me"] as const, team: ["team"] as const, tasks: ["tasks"] as const, routines: ["routines"] as const, links: ["links"] as const,
  meta: ["meta"] as const, inbox: ["inbox"] as const, activity: ["activity"] as const, analytics: ["analytics"] as const, leaves: ["leaves"] as const, timer: ["timer"] as const, resources: ["resources"] as const,
};

/** null = not signed in. */
export const useMe = () => useQuery({
  queryKey: keys.me,
  queryFn: async (): Promise<MeDTO | null> => {
    const res = await api.me.$get();
    if (res.status === 401) return null;
    return (await ok(Promise.resolve(res))) as unknown as MeDTO;
  },
  staleTime: Infinity, retry: false,
});
export const useTeam = (enabled: boolean) => useQuery({ queryKey: keys.team, enabled, queryFn: () => ok(api.team.$get()) as unknown as Promise<MemberDTO[]> });
/** Tasks from `from` onward. */
export const useTasks = (from: string, enabled: boolean) => useQuery({
  queryKey: [...keys.tasks, from], enabled, placeholderData: prev => prev,
  queryFn: () => ok(api.tasks.$get({ query: { from } })) as unknown as Promise<TaskDTO[]>,
});
export const useTask = (id: string | null) => useQuery({
  queryKey: [...keys.tasks, "one", id], enabled: !!id,
  queryFn: () => ok(api.tasks[":id"].$get({ param: { id: id! } })) as unknown as Promise<TaskDTO>,
});
export const useRoutines = (enabled: boolean) => useQuery({ queryKey: keys.routines, enabled, queryFn: () => ok(api.routines.$get()) as unknown as Promise<RoutineDTO[]> });
export const useLinks = (enabled: boolean) => useQuery({ queryKey: keys.links, enabled, queryFn: () => ok(api.links.$get()) as unknown as Promise<LinkDTO[]> });

export const useLeaves = (enabled: boolean) => useQuery({ queryKey: keys.leaves, enabled, queryFn: () => ok(api.leaves.$get()) as unknown as Promise<LeaveDTO[]> });
export const useRunning = (enabled: boolean) => useQuery({ queryKey: keys.timer, enabled, queryFn: () => ok(api.time.running.$get()) as unknown as Promise<RunningTimerDTO | null> });
export const useTaskTime = (id: string) => useQuery({ queryKey: [...keys.timer, "task", id], queryFn: () => ok(api.time.task[":taskId"].$get({ param: { taskId: id } })) as unknown as Promise<{ entries: TimeEntryDTO[]; totalMin: number }> });
export const useTimeReport = (from: string, to: string) => useQuery({ queryKey: [...keys.timer, "report", from, to], queryFn: () => ok(api.time.report.$get({ query: { from, to } })) as unknown as Promise<TimeReportDTO> });
export const useProjectReport = (id: string) => useQuery({ queryKey: [...keys.analytics, "project", id], queryFn: () => ok(api.reports.project[":id"].$get({ param: { id } })) as unknown as Promise<ProjectReportDTO> });
export const useResources = (enabled: boolean) => useQuery({ queryKey: [...keys.resources, "list"], enabled, queryFn: () => ok(api.resources.$get()) as unknown as Promise<ResourceDTO[]> });
export const useBookings = (from: string, to: string) => useQuery({ queryKey: [...keys.resources, "bookings", from, to], placeholderData: prev => prev, queryFn: () => ok(api.bookings.$get({ query: { from, to } })) as unknown as Promise<BookingDTO[]> });
export const useMeta = (enabled: boolean) => useQuery({ queryKey: keys.meta, enabled, queryFn: () => ok(api.meta.$get()) as unknown as Promise<MetaDTO> });
export const useInbox = (enabled: boolean) => useQuery({
  queryKey: keys.inbox, enabled,
  queryFn: () => ok(api.inbox.notifications.$get()) as unknown as Promise<{ items: NotificationDTO[]; unread: number }>,
});
export const useFeed = (enabled: boolean, limit = 25) => useQuery({ queryKey: [...keys.activity, "feed", limit], enabled, queryFn: () => ok(api.inbox.activity.$get({ query: { limit: String(limit) } })) as unknown as Promise<ActivityDTO[]> });
export const useTaskActivity = (id: string | null) => useQuery({
  queryKey: [...keys.activity, id], enabled: !!id,
  queryFn: () => ok(api.tasks[":id"].activity.$get({ param: { id: id! } })) as unknown as Promise<ActivityDTO[]>,
});
export const useAnalytics = (from: string, to: string, enabled: boolean) => useQuery({
  queryKey: [...keys.analytics, from, to], enabled,
  queryFn: () => ok(api.reports.analytics.$get({ query: { from, to } })) as unknown as Promise<AnalyticsDTO>,
});

export const windowFrom = (date: string, today: string) => addDays(date < today ? date : today, -30);

/** Server-sent events: the server only says what changed; we refetch it. EventSource reconnects on its own. */
export function useLive(qc: QueryClient, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const es = new EventSource("/api/events");
    es.addEventListener("change", e => {
      const topic = (e as MessageEvent<string>).data;
      if (topic === "tasks") for (const k of [keys.tasks, keys.routines, keys.activity, keys.analytics, keys.timer]) void qc.invalidateQueries({ queryKey: k });
      else if (topic === "meta") void qc.invalidateQueries({ queryKey: keys.meta });
      else if (topic === "inbox") void qc.invalidateQueries({ queryKey: keys.inbox });
      else if (topic === "team") void qc.invalidateQueries({ queryKey: keys.team });
      else if (topic === "leaves") void qc.invalidateQueries({ queryKey: keys.leaves });
      else if (topic === "resources") void qc.invalidateQueries({ queryKey: keys.resources });
      else if (topic === "links") void qc.invalidateQueries({ queryKey: keys.links });
    });
    es.addEventListener("ready", () => void qc.invalidateQueries()); // after a reconnect, catch up on anything missed
    return () => es.close();
  }, [qc, active]);
}

export const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Gagal menyimpan. Periksa koneksi lalu coba lagi.";

/** Mutation that toasts success/failure and refreshes the given query groups. */
export function useAction<V = void>(fn: (v: V) => Promise<unknown>, opts: { done?: string | ((v: V) => string); refresh?: (readonly string[])[] } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, v) => {
      for (const k of opts.refresh ?? [keys.tasks, keys.team]) void qc.invalidateQueries({ queryKey: k });
      const m = typeof opts.done === "function" ? opts.done(v) : opts.done;
      if (m) toast.success(m);
    },
    onError: e => {
      toast.error(errorText(e));
      for (const k of opts.refresh ?? [keys.tasks, keys.team]) void qc.invalidateQueries({ queryKey: k }); // undo any optimistic change
    },
  });
}

/** Show a change right away (drag and drop); the refetch after the request confirms or reverts it. */
export function patchTaskLocally(qc: QueryClient, id: string, patch: Partial<TaskDTO>) {
  qc.setQueriesData<TaskDTO[] | TaskDTO>({ queryKey: keys.tasks }, old =>
    Array.isArray(old) ? old.map(t => (t.id === id ? { ...t, ...patch } : t)) : old && !Array.isArray(old) && old.id === id ? { ...old, ...patch } : old);
}
