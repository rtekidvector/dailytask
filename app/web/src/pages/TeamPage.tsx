import { useState } from "react";
import { useSearchParams } from "wouter";
import { Page } from "../components/Page";
import { OrgView } from "./OrgPage";
import { Workload } from "../components/Workload";
import { Links } from "../components/Links";
import { ManageTeam } from "../components/ManageTeam";
import { ProjectsLabels } from "../components/ProjectsLabels";
import { useViewer } from "../lib/viewer";

export function TeamPage() {
  const { team, policy } = useViewer();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(["anggota", "struktur", "beban", "proyek"].includes(params.get("t") ?? "") ? params.get("t")! : "anggota");
  const manageable = team.filter(m => policy.isBoss || (policy.canSee(m.email) && (m.email === policy.me || !m.isAdmin)));
  return (
    <Page title="Tim" sub={`${team.length} anggota`} tabs={[{ id: "anggota", label: "Anggota" }, { id: "struktur", label: "Struktur" }, { id: "beban", label: "Beban kerja" }, { id: "proyek", label: "Proyek & label" }]} tab={tab} onTab={setTab}>
      {tab === "anggota" && <><ManageTeam list={manageable} open /><section className="surface"><div className="surface-h"><h2>Tautan admin</h2></div><Links /></section></>}
      {tab === "struktur" && <OrgView />}
      {tab === "beban" && <Workload />}
      {tab === "proyek" && <ProjectsLabels />}
    </Page>
  );
}
