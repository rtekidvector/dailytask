import { z } from "zod";

export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
/** Colour tokens for projects and labels; the web app maps each to a pastel surface. */
export const COLORS = ["lilac", "pink", "yellow", "lime", "mint", "sky", "peach", "gray"] as const;
export type Color = (typeof COLORS)[number];

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const email = z.string().trim().toLowerCase().email().max(120);
const unit = z.string().trim().toUpperCase().max(20);

export const memberCreate = z.object({
  email, name: z.string().trim().min(1).max(40), role: z.string().trim().max(60).default(""), group: unit.default(""),
});
export const memberPatch = z.object({
  name: z.string().trim().min(1).max(40), role: z.string().trim().max(60), group: unit,
  isAdmin: z.boolean(), adminGroups: z.array(unit).max(20),
}).partial();
export const memberMove = z.object({ email });
export const memberOrder = z.object({ emails: z.array(z.string()).max(200) });

export const taskCreate = z.object({
  emails: z.array(email).min(1).max(100),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(600).default(""),
  date: date.optional(),
  start: hm.nullish(), due: hm.nullish(),
  hot: z.boolean().default(false),
  priority: z.enum(PRIORITIES).default("normal"),
  projectId: z.string().nullish(),
  labelIds: z.array(z.string()).max(10).default([]),
  subtasks: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  needProof: z.boolean().default(true),
  // Routine: appears automatically on the chosen weekdays (0 = Sunday).
  routineDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).refine(t => !(t.start && t.due) || t.start < t.due, { message: "Jam selesai harus setelah jam mulai", path: ["due"] });
/** Partial edit of a task: title/notes/schedule/priority/project/labels, or reassigning to someone else. */
export const taskPatch = z.object({
  title: z.string().trim().min(1).max(120), note: z.string().trim().max(600),
  date, start: hm.nullable(), due: hm.nullable(),
  priority: z.enum(PRIORITIES), projectId: z.string().nullable(), labelIds: z.array(z.string()).max(10),
  needProof: z.boolean(), email,
}).partial();
export const subtaskCreate = z.object({ title: z.string().trim().min(1).max(160) });
export const subtaskPatch = z.object({ title: z.string().trim().min(1).max(160), done: z.boolean() }).partial();
export const projectInput = z.object({ name: z.string().trim().min(1).max(60), color: z.enum(COLORS).default("lilac"), description: z.string().trim().max(300).default(""), archived: z.boolean().default(false) });
export const projectClose = z.object({
  summary: z.string().trim().max(1000).default(""),
  links: z.array(z.string().trim().url().max(500).refine(u => /^https?:\/\//i.test(u), "Hanya tautan http(s)")).max(10).default([]),
  force: z.boolean().default(false),
});
export const labelInput = z.object({ name: z.string().trim().min(1).max(30), color: z.enum(COLORS).default("gray") });
export const LEAVE_KINDS = ["cuti", "izin", "sakit"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const leaveCreate = z.object({ kind: z.enum(LEAVE_KINDS), from: date, to: date, reason: z.string().trim().max(200).default("") });
export const leaveDecision = z.object({ status: z.enum(["approved", "rejected"]) });
export const RESOURCE_KINDS = ["alat", "studio", "lokasi"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const resourceInput = z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(RESOURCE_KINDS).default("alat"), note: z.string().trim().max(200).default(""), archived: z.boolean().default(false) });
export const bookingCreate = z.object({ resourceId: z.string().min(1), date, start: hm, end: hm, taskId: z.string().nullish(), note: z.string().trim().max(200).default("") });
export const notificationsRead = z.object({ ids: z.array(z.string()).max(200).optional() });
export const taskStatus = z.object({ status: z.enum(STATUSES) });
export const taskReport = z.object({ report: z.string().trim().max(600) });
export const commentCreate = z.object({ text: z.string().trim().min(1).max(600), mentions: z.array(email).max(10).default([]) });
export const linkCreate = z.object({ title: z.string().trim().min(1).max(80), url: z.string().trim().url().max(500) });
export const pushSub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

// ---- shapes returned by the API ----
export interface MemberDTO {
  email: string; name: string; role: string; group: string; isAdmin: boolean; adminGroups: string[];
  sortOrder: number; hasPhoto: boolean; photoV: number; seenAt: number | null; askAt: number | null;
}
export interface CommentDTO { id: string; by: string; byEmail: string; text: string; at: number }
export interface SubtaskDTO { id: string; title: string; done: boolean }
export interface ProjectDTO { id: string; name: string; color: Color; description: string; archived: boolean; createdAt: number; closedAt: number | null; closedBy: string | null; summary: string; links: string[] }
export interface LabelDTO { id: string; name: string; color: Color }
export interface ActivityDTO { id: string; taskId: string | null; taskTitle: string | null; actorEmail: string; actorName: string; kind: string; text: string; at: number }
export interface NotificationDTO { id: string; kind: string; taskId: string | null; text: string; at: number; read: boolean }
export interface PersonStat { email: string; name: string; total: number; done: number; onTime: number; late: number; open: number; overdue: number }
export interface AnalyticsDTO {
  from: string; to: string;
  totals: { total: number; done: number; open: number; overdue: number; onTimeRate: number | null; avgCompletionMin: number | null };
  perPerson: PersonStat[];
  daily: { date: string; created: number; done: number }[];
  byProject: { projectId: string | null; total: number; done: number }[];
  byPriority: Record<Priority, number>;
  byLabel: { labelId: string; total: number; done: number }[];
}
export interface TaskDTO {
  id: string; email: string; date: string; title: string; note: string; start: string | null; due: string | null;
  status: Status; hot: boolean; priority: Priority; projectId: string | null; labelIds: string[]; subtasks: SubtaskDTO[]; needProof: boolean; by: "owner" | "self"; fromAdmin: string | null; routineId: string | null;
  createdAt: number; startedAt: number | null; doneAt: number | null; returnedAt: number | null; revisions: number;
  proofLink: string | null; proofAt: number | null; hasPhoto: boolean; report: string | null; reportAt: number | null;
  comments: CommentDTO[];
}
export interface RoutineDTO { id: string; email: string; title: string; note: string; start: string | null; due: string | null; days: number[]; hot: boolean; needProof: boolean; byName: string | null }
export interface LinkDTO { id: string; title: string; url: string; createdAt: number }
export interface MetaDTO { owner: { email: string; name: string }; projects: ProjectDTO[]; labels: LabelDTO[] }
export interface MeDTO { email: string; name: string; owner: boolean; member: MemberDTO | null }
export interface LeaveDTO { id: string; email: string; kind: LeaveKind; from: string; to: string; reason: string; status: "pending" | "approved" | "rejected"; decidedBy: string | null; decidedAt: number | null; createdAt: number }
export interface TimeEntryDTO { id: string; taskId: string; email: string; startedAt: number; endedAt: number | null }
export interface RunningTimerDTO { entry: TimeEntryDTO; taskTitle: string }
export interface TimeReportDTO {
  from: string; to: string; totalMin: number;
  perPerson: { email: string; name: string; min: number }[];
  byProject: { projectId: string | null; min: number }[];
  daily: { date: string; min: number }[];
}
export interface ProjectReportDTO {
  project: ProjectDTO;
  stats: { total: number; done: number; open: number; onTime: number; late: number; minutes: number; withProof: number; revisions: number };
  tasks: { id: string; title: string; email: string; name: string; date: string; status: Status; priority: Priority; doneAt: number | null; hasPhoto: boolean; proofLink: string | null; report: string | null; minutes: number; revisions: number }[];
}
export interface ResourceDTO { id: string; name: string; kind: ResourceKind; note: string; archived: boolean }
export interface BookingDTO { id: string; resourceId: string; email: string; taskId: string | null; taskTitle: string | null; date: string; start: string; end: string; note: string }
