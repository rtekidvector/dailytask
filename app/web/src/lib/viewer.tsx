import type { Priority } from "@shared/schemas";
import { createContext, useContext } from "react";
import type { LabelDTO, MeDTO, MemberDTO, ProjectDTO } from "@shared/schemas";
import type { Policy } from "@shared/policy";

export interface Viewer {
  me: MeDTO; team: MemberDTO[]; policy: Policy;
  projects: ProjectDTO[]; labels: LabelDTO[];
  member: (email: string) => MemberDTO | undefined;
  project: (id: string | null) => ProjectDTO | undefined;
  label: (id: string) => LabelDTO | undefined;
}
export const ViewerContext = createContext<Viewer | null>(null);
export const useViewer = () => {
  const v = useContext(ViewerContext);
  if (!v) throw new Error("ViewerContext missing");
  return v;
};

/** Selected day (shared by every page), the task drawer, and the new-task / search dialogs. */
export interface Ui {
  date: string; setDate: (d: string) => void;
  openTask: (id: string) => void; closeTask: () => void; taskId: string | null;
  newTask: (prefill?: NewTaskPrefill) => void;
  openSearch: () => void;
}
export interface NewTaskPrefill { emails?: string[]; date?: string; start?: string; due?: string; projectId?: string; title?: string; note?: string; priority?: Priority; labelIds?: string[]; steps?: string[] }
export const UiContext = createContext<Ui | null>(null);
export const useUi = () => {
  const v = useContext(UiContext);
  if (!v) throw new Error("UiContext missing");
  return v;
};
