import { COLORS, type Color, type LabelDTO, type ProjectDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { keys, useAction } from "../lib/queries";
import { COLOR_LABEL } from "../lib/tasks";
import { useViewer } from "../lib/viewer";
import { ConfirmButton } from "./ui";

function ColorPick({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div className="chips" role="radiogroup" aria-label="Warna">
      {COLORS.map(c => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]} data-c={c} onClick={() => onChange(c)}
          style={{ width: 22, height: 22, borderRadius: "50%", border: 0, background: `var(--c-${c})`, boxShadow: value === c ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "inset 0 0 0 1px rgb(0 0 0 / .1)" }} />
      ))}
    </div>
  );
}

function ProjectRow({ p }: { p: ProjectDTO }) {
  const { policy } = useViewer();
  const patch = useAction((j: Partial<Pick<ProjectDTO, "name" | "color" | "archived">>) => ok(api.meta.projects[":id"].$patch({ param: { id: p.id }, json: j })), { refresh: [keys.meta] });
  const del = useAction(() => ok(api.meta.projects[":id"].$delete({ param: { id: p.id } })), { done: "Proyek dihapus", refresh: [keys.meta, keys.tasks] });
  return (
    <div className="mrow">
      <span className="avatar sm" style={{ background: `var(--c-${p.color})`, width: 28, height: 28 }} />
      <input className="input" style={{ flex: "1 1 160px", width: "auto" }} defaultValue={p.name} maxLength={60} aria-label="Nama proyek" onBlur={e => e.target.value.trim() && e.target.value.trim() !== p.name && patch.mutate({ name: e.target.value.trim() })} />
      <ColorPick value={p.color} onChange={c => patch.mutate({ color: c })} />
      <button className="btn small" onClick={() => patch.mutate({ archived: !p.archived })}>{p.archived ? "Aktifkan" : "Arsipkan"}</button>
      {policy.isBoss && <ConfirmButton className="btn small danger" label="Hapus" armed="Yakin hapus?" onConfirm={() => del.mutate()} />}
    </div>
  );
}
function LabelRow({ l }: { l: LabelDTO }) {
  const patch = useAction((j: Partial<Pick<LabelDTO, "name" | "color">>) => ok(api.meta.labels[":id"].$patch({ param: { id: l.id }, json: j })), { refresh: [keys.meta] });
  const del = useAction(() => ok(api.meta.labels[":id"].$delete({ param: { id: l.id } })), { done: "Label dihapus", refresh: [keys.meta, keys.tasks] });
  return (
    <div className="mrow">
      <span className="avatar sm" style={{ background: `var(--c-${l.color})`, width: 28, height: 28 }} />
      <input className="input" style={{ flex: "1 1 160px", width: "auto" }} defaultValue={l.name} maxLength={30} aria-label="Nama label" onBlur={e => e.target.value.trim() && e.target.value.trim() !== l.name && patch.mutate({ name: e.target.value.trim() })} />
      <ColorPick value={l.color} onChange={c => patch.mutate({ color: c })} />
      <ConfirmButton className="btn small danger" label="Hapus" armed="Yakin hapus?" onConfirm={() => del.mutate()} />
    </div>
  );
}

export function ProjectsLabels() {
  const { projects, labels } = useViewer();
  const addP = useAction((f: FormData) => ok(api.meta.projects.$post({ json: { name: String(f.get("name")), color: String(f.get("color")) as Color } })), { done: "Proyek ditambahkan", refresh: [keys.meta] });
  const addL = useAction((f: FormData) => ok(api.meta.labels.$post({ json: { name: String(f.get("name")), color: String(f.get("color")) as Color } })), { done: "Label ditambahkan", refresh: [keys.meta] });
  const form = (add: typeof addP, ph: string) => (
    <form className="row" style={{ paddingTop: 12 }} onSubmit={e => { e.preventDefault(); const f = e.currentTarget; if (String(new FormData(f).get("name")).trim()) add.mutate(new FormData(f), { onSuccess: () => f.reset() }); }}>
      <label className="field"><span>Nama</span><input className="input" name="name" placeholder={ph} maxLength={60} /></label>
      <label className="field" style={{ flex: "0 0 150px" }}><span>Warna</span><select className="input" name="color" defaultValue="lilac">{COLORS.map(c => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}</select></label>
      <button className="btn primary" type="submit">Tambah</button>
    </form>
  );
  return (
    <div className="two" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
      <section className="surface"><div className="surface-h"><h2>Proyek &amp; kampanye</h2></div>
        <p className="foot">Kelompokkan tugas per kampanye. Warna proyek dipakai di papan dan kalender.</p>
        {projects.map(p => <ProjectRow key={p.id} p={p} />)}
        {!projects.length && <p className="empty">Belum ada proyek.</p>}
        {form(addP, "Contoh: Kampanye Lebaran")}
      </section>
      <section className="surface"><div className="surface-h"><h2>Label</h2></div>
        <p className="foot">Penanda lintas proyek, mis. Foto, Video, Revisi.</p>
        {labels.map(l => <LabelRow key={l.id} l={l} />)}
        {!labels.length && <p className="empty">Belum ada label.</p>}
        {form(addL, "Contoh: Video")}
      </section>
    </div>
  );
}
