import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { enablePush, pushSupported } from "../lib/push";
import { errorText } from "../lib/queries";

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<unknown> }
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } },
  set: (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* private mode */ } },
};

/** "Add to home screen" hint; uses the browser's install prompt when it offers one. */
export function InstallCard() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(() => store.get("tipInstall"));
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (standalone() || hidden) return null;
  const hide = () => { store.set("tipInstall"); setHidden(true); };
  return (
    <section className="tip">
      <b>Pasang aplikasi di HP-mu</b>
      {evt ? <p>Supaya bisa dibuka dari ikon di layar utama, tanpa mencari link lagi.</p>
        : isIOS() ? <p>Di Safari, ketuk tombol Bagikan ⬆ lalu pilih <em>Tambah ke Layar Utama</em>.</p>
        : <p>Di Chrome, ketuk menu ⋮ lalu pilih <em>Instal aplikasi</em> atau <em>Tambahkan ke layar utama</em>.</p>}
      <div className="chips">
        {evt && <button className="btn primary small" onClick={async () => { const e = evt; setEvt(null); void e.prompt(); try { await e.userChoice; } catch { /* dismissed */ } }}>Pasang aplikasi</button>}
        <button className="btn small ghost" onClick={hide}>{evt ? "Nanti saja" : "Mengerti, sembunyikan"}</button>
      </div>
    </section>
  );
}

export function NotifyCard({ manager }: { manager: boolean }) {
  const [perm, setPerm] = useState(() => (pushSupported() ? Notification.permission : "denied"));
  const [off, setOff] = useState(false);
  if (perm !== "default" || off) return null;
  return (
    <section className="tip">
      <b className="iconline"><Bell size={16} />Aktifkan notifikasi</b>
      <p>{manager ? "Dapatkan pemberitahuan saat tugas selesai atau ada yang minta tugas." : "Dapatkan pemberitahuan saat ada tugas baru, tugas dikembalikan, dan pengingat tenggat."}</p>
      <div className="chips">
        <button className="btn primary small" onClick={async () => {
          try { if (await enablePush()) toast.success("Notifikasi aktif di perangkat ini"); } catch (e) { toast.error(errorText(e)); }
          setPerm(Notification.permission);
        }}>Aktifkan</button>
        <button className="btn small ghost" onClick={() => setOff(true)}>Nanti</button>
      </div>
    </section>
  );
}
