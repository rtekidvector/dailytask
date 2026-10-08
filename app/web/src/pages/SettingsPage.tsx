import { useState } from "react";
import { toast } from "sonner";
import { Page } from "../components/Page";
import { InstallCard } from "../components/Cards";
import { ProfileForm } from "../components/ManageTeam";
import { enablePush, pushSupported, unregisterPush } from "../lib/push";
import { errorText } from "../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { api, ok } from "../lib/api";
import { getTheme, setTheme, type Theme } from "../lib/theme";
import { keys } from "../lib/queries";
import { useViewer } from "../lib/viewer";

export function SettingsPage() {
  const { me, member } = useViewer();
  const [perm, setPerm] = useState(() => (pushSupported() ? Notification.permission : "unsupported"));
  const m = member(me.email);
  const qc = useQueryClient();
  const [theme, setT] = useState<Theme>(getTheme);
  const pick = (t: Theme) => { setTheme(t); setT(t); };
  const out = async () => { if (pushSupported() && Notification.permission === "granted") await unregisterPush(); await ok(api.auth.logout.$post()); qc.clear(); await qc.invalidateQueries({ queryKey: keys.me }); };
  return (
    <Page noNew title="Pengaturan" sub={me.email}>
      <div className="two" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", maxWidth: 1040 }}>
        <section className="surface"><div className="surface-h"><h2>Profil</h2></div>
          {m ? <ProfileForm m={m} onClose={() => { /* stays on the page */ }} /> : <p className="muted">Kamu masuk sebagai pemilik ({me.email}). Pemilik tidak memiliki profil anggota.</p>}
        </section>
        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <section className="surface"><div className="surface-h"><h2>Notifikasi</h2></div>
            {perm === "unsupported" && <p className="muted">Browser ini belum mendukung notifikasi push. Di iPhone, pasang aplikasi ke layar utama dulu.</p>}
            {perm === "granted" && <><p>Notifikasi aktif di perangkat ini.</p><div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}><button className="btn small" onClick={async () => { await unregisterPush(); toast.success("Notifikasi dimatikan di perangkat ini"); }}>Matikan di perangkat ini</button></div></>}
            {perm === "denied" && <p className="muted">Notifikasi diblokir. Izinkan lewat pengaturan situs di browser, lalu muat ulang.</p>}
            {perm === "default" && <><p className="muted">Dapatkan pemberitahuan tugas baru, pengingat tenggat, dan komentar.</p><div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}><button className="btn primary" onClick={async () => { try { if (await enablePush()) toast.success("Notifikasi aktif di perangkat ini"); } catch (e) { toast.error(errorText(e)); } setPerm(Notification.permission); }}>Aktifkan notifikasi</button></div></>}
          </section>
          <section className="surface"><div className="surface-h"><h2>Tampilan</h2></div>
            <div className="seg" role="group" aria-label="Tema"><button aria-pressed={theme === "light"} onClick={() => pick("light")}>Terang</button><button aria-pressed={theme === "dark"} onClick={() => pick("dark")}>Gelap</button></div>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>Pilihan disimpan di browser ini.</p>
          </section>
          <section className="surface"><div className="surface-h"><h2>Pintasan keyboard</h2></div>
            <ul className="keys">{[["Ctrl/⌘ + K", "Cari dan perintah"], ["/", "Cari"], ["N", "Tugas baru"], ["G lalu D", "Dasbor"], ["G lalu P", "Papan"], ["G lalu L", "Daftar"], ["G lalu K", "Kalender"], ["G lalu Y", "Proyek"], ["G lalu A", "Alat & studio"], ["G lalu I", "Izin & cuti"], ["G lalu R", "Laporan"], ["G lalu H", "Riwayat"]].map(([k, v]) => <li key={k}><kbd>{k}</kbd><span>{v}</span></li>)}</ul>
          </section>
          <InstallCard />
          <section className="surface"><div className="surface-h"><h2>Akun</h2></div><p className="muted" style={{ marginBottom: 10 }}>{me.email}</p><button className="btn" onClick={out}>Keluar</button></section>
        </div>
      </div>
    </Page>
  );
}
