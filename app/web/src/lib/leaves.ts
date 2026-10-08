import type { LeaveDTO, LeaveKind } from "@shared/schemas";

export const LEAVE_LABEL: Record<LeaveKind, string> = { cuti: "Cuti", izin: "Izin", sakit: "Sakit" };
export const LEAVE_STATUS = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" } as const;
/** Approved leave that covers this person on this day. */
export const awayOn = (leaves: readonly LeaveDTO[], email: string, date: string) =>
  leaves.find(l => l.status === "approved" && l.email === email && l.from <= date && l.to >= date);
