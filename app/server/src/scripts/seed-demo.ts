// Fills a fresh database with a fictional team and a week of varied tasks, for trying the app locally and for screenshots.
//   DATA_DIR=./data npx tsx src/scripts/seed-demo.ts   (then start the server with ALLOW_DEV_LOGIN=1 and sign in via POST /api/auth/dev)
import { join } from "node:path";
import { addDays, wib } from "@shared/time";
import { openDb } from "../db/index.js";
import { activity, bookings, comments, labels, leaves, resources, links, members, notifications, projects, routines, subtasks, taskLabels, tasks } from "../db/schema.js";
import { newId } from "../context.js";

const db = openDb(join(process.env.DATA_DIR ?? "./data", "app.db"));
const owner = process.env.OWNER_EMAIL ?? "owner@demo.id";
const today = wib().date, now = Date.now(), min = 60_000;

const team = [
  { email: "rani@demo.id", name: "Rani", role: "Kepala Kreatif", group: "", isAdmin: true },
  { email: "dimas@demo.id", name: "Dimas", role: "Lead Konten", group: "HCS", isAdmin: true, adminGroups: ["HCS"] },
  { email: "sinta@demo.id", name: "Sinta", role: "Fotografer", group: "HCS" },
  { email: "bayu@demo.id", name: "Bayu", role: "Videografer", group: "HCS" },
  { email: "citra@demo.id", name: "Citra", role: "Editor", group: "HCS" },
  { email: "eko@demo.id", name: "Eko", role: "Sosmed", group: "HUC" },
  { email: "fajar@demo.id", name: "Fajar", role: "Ads", group: "HUC" },
  { email: "gita@demo.id", name: "Gita", role: "Kreator", group: "HUC" },
  { email: "hendra@demo.id", name: "Hendra Kusuma Wardhana Pratama", role: "Koordinator Operasional dan Logistik Gudang Pusat", group: "HCM" },
];
team.forEach((m, i) => db.insert(members).values({ adminGroups: [], ...m, sortOrder: i + 1, seenAt: i < 7 ? now - i * 3600_000 : null }).run());

const P = Object.fromEntries([["lebaran", "Kampanye Lebaran", "pink"], ["katalog", "Katalog Q4", "sky"], ["live", "Live Shopping", "yellow"], ["brand", "Brand Refresh", "lilac"], ["panjang", "Kampanye Hari Raya Idul Fitri dan Ramadhan Seluruh Marketplace", "mint"]].map(([k, name, color]) => {
  const id = newId(); db.insert(projects).values({ id, name: name!, color: color!, createdAt: now }).run(); return [k, id];
}));
const L = Object.fromEntries([["foto", "Foto", "mint"], ["video", "Video", "peach"], ["revisi", "Revisi", "pink"], ["iklan", "Iklan", "sky"]].map(([k, name, color]) => {
  const id = newId(); db.insert(labels).values({ id, name: name!, color: color! }).run(); return [k, id];
}));

type Seed = { who: string; d: number; title: string; s?: string; due?: string; st?: "todo" | "doing" | "done"; pr?: "low" | "normal" | "high" | "urgent"; pj?: string; lb?: string[]; sub?: [string, boolean][]; late?: boolean; note?: string };
const seeds: Seed[] = [
  { who: "sinta", d: 0, title: "Foto produk koleksi Lebaran (12 SKU)", s: "09:00", due: "12:00", st: "doing", pr: "high", pj: "lebaran", lb: ["foto"], sub: [["Siapkan studio", true], ["Foto flatlay", true], ["Foto model", false], ["Pilih & kirim 40 foto terbaik", false]] },
  { who: "sinta", d: 0, title: "Retouch foto katalog halaman 3-6", s: "13:30", due: "16:00", st: "todo", pj: "katalog", lb: ["foto"], note: "Warna kain harus sesuai swatch." },
  { who: "bayu", d: 0, title: "Shooting video reels unboxing", s: "10:00", due: "11:30", st: "done", pr: "normal", pj: "lebaran", lb: ["video"] },
  { who: "bayu", d: 0, title: "Siapkan lighting untuk live shopping malam", s: "17:00", due: "19:00", st: "todo", pr: "urgent", pj: "live" },
  { who: "citra", d: 0, title: "Edit reels unboxing (30 detik)", s: "11:30", due: "15:00", st: "doing", pr: "high", pj: "lebaran", lb: ["video", "revisi"], sub: [["Potong klip", true], ["Warna & audio", false], ["Subtitle", false]] },
  { who: "citra", d: 0, title: "Revisi thumbnail katalog", due: "17:00", st: "todo", lb: ["revisi"], pj: "katalog" },
  { who: "eko", d: 0, title: "Jadwalkan 7 posting Instagram minggu ini", s: "09:30", due: "11:00", st: "done", pj: "lebaran" },
  { who: "eko", d: 0, title: "Balas komentar & DM prioritas", s: "14:00", due: "15:00", st: "todo" },
  { who: "fajar", d: 0, title: "Optimasi iklan Meta: ganti kreatif CTR rendah", s: "10:00", due: "12:30", st: "doing", pr: "high", lb: ["iklan"], pj: "lebaran", sub: [["Tarik laporan kemarin", true], ["Pilih 3 kreatif baru", false]] },
  { who: "gita", d: 0, title: "Skrip konten live shopping jam 20.00", s: "13:00", due: "15:30", st: "todo", pr: "high", pj: "live" },
  { who: "hendra", d: 0, title: "Cek stok & kirim restock list ke gudang", due: "16:00", st: "todo", pr: "normal" },
  { who: "sinta", d: -1, title: "Foto detail aksesoris (macro)", s: "09:00", due: "11:00", st: "done", pj: "katalog", lb: ["foto"] },
  { who: "bayu", d: -1, title: "Backup footage ke Drive", due: "17:00", st: "done" },
  { who: "citra", d: -1, title: "Color grading teaser Brand Refresh", s: "13:00", due: "17:00", st: "done", pj: "brand", lb: ["video"] },
  { who: "eko", d: -1, title: "Laporan engagement mingguan", due: "16:00", st: "doing", late: true },
  { who: "fajar", d: -2, title: "Riset kompetitor iklan", st: "done", pj: "brand" },
  { who: "sinta", d: 1, title: "Foto lookbook outdoor", s: "08:00", due: "11:00", st: "todo", pr: "high", pj: "lebaran", lb: ["foto"] },
  { who: "bayu", d: 1, title: "Shooting behind the scenes", s: "13:00", due: "15:00", st: "todo", pj: "brand", lb: ["video"] },
  { who: "citra", d: 1, title: "Edit video profil brand", s: "10:00", due: "16:00", st: "todo", pj: "brand", lb: ["video"], pr: "normal" },
  { who: "gita", d: 1, title: "Rekam konten edukasi bahan kain", s: "09:00", due: "10:30", st: "todo", pj: "brand" },
  { who: "eko", d: 2, title: "Konsep carousel Hari Raya", s: "10:00", due: "12:00", st: "todo", pj: "lebaran" },
  { who: "fajar", d: 2, title: "Setup kampanye iklan katalog", s: "14:00", due: "16:00", st: "todo", pr: "high", pj: "katalog", lb: ["iklan"] },
  { who: "hendra", d: 3, title: "Audit SOP packing", st: "todo", pr: "low" },
  { who: "gita", d: 0, title: "Menyusun dan menyiapkan laporan lengkap evaluasi performa seluruh kampanye konten, iklan, dan live shopping selama kuartal ini untuk dipresentasikan", s: "15:30", due: "17:30", st: "todo", pr: "urgent", pj: "panjang", lb: ["foto", "video", "revisi", "iklan"], note: "Kumpulkan semua data penjualan, engagement, dan biaya iklan dari setiap platform marketplace, bandingkan dengan target bulanan, lalu rangkum temuan utama beserta rekomendasi perbaikan untuk kuartal berikutnya agar tim bisa langsung menindaklanjuti dengan cepat dan tepat sasaran.", sub: [["Tarik data penjualan semua marketplace bulan ini", false], ["Susun grafik", false]] },
  { who: "sinta", d: 3, title: "Seleksi foto untuk katalog cetak", s: "11:00", due: "13:00", st: "todo", pj: "katalog" },
  { who: "bayu", d: 4, title: "Edit highlight live shopping", s: "09:00", due: "12:00", st: "todo", pj: "live", lb: ["video"] },
];
const dirs: Record<string, string> = { sinta: "dimas", bayu: "dimas", citra: "dimas", eko: "rani", fajar: "rani", gita: "rani", hendra: "rani" };
const byName = (n: string) => team.find(t => t.email.startsWith(n + "@"))!;
const ids: string[] = [];
seeds.forEach((s, i) => {
  const m = byName(s.who), id = newId(), admin = byName(dirs[s.who]!);
  const created = now - (3 + (i % 5)) * 3600_000, day = addDays(today, s.d);
  const doneAt = s.st === "done" ? (s.due ? Date.parse(`${day}T${s.due}:00+07:00`) - 20 * min : now - 2 * 3600_000) : null;
  db.insert(tasks).values({
    id, email: m.email, date: day, title: s.title, note: s.note ?? "", start: s.s ?? null, due: s.due ?? null, status: s.st ?? "todo", hot: s.pr === "high" || s.pr === "urgent",
    priority: s.pr ?? "normal", projectId: s.pj ? P[s.pj] : null, needProof: true, by: "owner", fromAdmin: admin.name, createdAt: created,
    startedAt: s.st && s.st !== "todo" ? Math.min(created + 40 * min, (doneAt ?? now) - 30 * min) : null, doneAt, proofLink: s.st === "done" ? "https://drive.google.com/demo-hasil" : null, proofAt: s.st === "done" ? doneAt : null,
  }).run();
  ids.push(id);
  (s.lb ?? []).forEach(l => db.insert(taskLabels).values({ taskId: id, labelId: L[l]! }).run());
  (s.sub ?? []).forEach(([title, done], k) => db.insert(subtasks).values({ id: newId(), taskId: id, title, done, position: k }).run());
  db.insert(activity).values({ id: newId(), taskId: id, actorEmail: admin.email, actorName: admin.name, kind: "created", text: `memberi tugas kepada ${m.name}`, at: created }).run();
  if (s.st && s.st !== "todo") db.insert(activity).values({ id: newId(), taskId: id, actorEmail: m.email, actorName: m.name, kind: "status", text: s.st === "done" ? "menyelesaikan tugas dengan bukti" : "mulai mengerjakan", at: doneAt ?? created + 40 * min }).run();
});
const c = (idx: number, by: string, text: string, ago: number) => { const m = byName(by); db.insert(comments).values({ id: newId(), taskId: ids[idx]!, by: m.name, byEmail: m.email, text, at: now - ago * min }).run(); };
c(0, "dimas", "@Sinta tolong prioritaskan 6 SKU best seller dulu ya.", 90); c(0, "sinta", "Siap, model datang jam 10.", 60);
c(4, "dimas", "Intro terlalu panjang, potong jadi 3 detik.", 45); c(4, "citra", "Oke, saya revisi sebentar lagi.", 30);
db.insert(routines).values({ id: newId(4), email: "eko@demo.id", title: "Cek insight Instagram", note: "", start: "09:00", due: "09:30", days: [1, 2, 3, 4, 5], needProof: false, byName: "Rani" }).run();
db.insert(links).values({ id: newId(), title: "Tracker Omzet", url: "https://docs.google.com/spreadsheets/demo", createdAt: now }).run();
db.insert(leaves).values([
  { id: newId(), email: "eko@demo.id", kind: "cuti", from: addDays(today, 3), to: addDays(today, 5), reason: "Acara keluarga", status: "approved", decidedBy: "owner@demo.id", decidedAt: now - 3600_000, createdAt: now - 86400_000 },
  { id: newId(), email: "fajar@demo.id", kind: "izin", from: addDays(today, 1), to: addDays(today, 1), reason: "Urus dokumen", status: "pending", createdAt: now - 7200_000 },
  { id: newId(), email: "gita@demo.id", kind: "sakit", from: addDays(today, -1), to: addDays(today, 0), reason: "", status: "approved", decidedBy: "owner@demo.id", decidedAt: now - 86400_000, createdAt: now - 90000_000 },
]).run();
const res = [["Kamera Sony A7 IV", "alat"], ["Lighting kit 3 titik", "alat"], ["Gimbal & mic wireless", "alat"], ["Studio foto", "studio"], ["Rooftop (lokasi shooting)", "lokasi"]].map(([name, kind], i) => ({ id: newId(), name: name!, kind: kind as "alat" | "studio" | "lokasi", createdAt: now + i }));
db.insert(resources).values(res).run();
db.insert(bookings).values([
  { id: newId(), resourceId: res[0]!.id, email: "sinta@demo.id", date: today, start: "08:00", end: "11:00", note: "Foto lookbook", createdAt: now },
  { id: newId(), resourceId: res[1]!.id, email: "sinta@demo.id", date: today, start: "08:00", end: "11:00", note: "", createdAt: now },
  { id: newId(), resourceId: res[3]!.id, email: "bayu@demo.id", date: today, start: "13:00", end: "16:00", note: "Shooting behind the scenes", createdAt: now },
  { id: newId(), resourceId: res[2]!.id, email: "bayu@demo.id", date: today, start: "13:00", end: "16:00", note: "", createdAt: now },
  { id: newId(), resourceId: res[4]!.id, email: "citra@demo.id", date: addDays(today, 1), start: "09:00", end: "12:00", note: "Konten Lebaran", createdAt: now },
]).run();
for (const e of [owner, "rani@demo.id", "dimas@demo.id"]) {
  db.insert(notifications).values([
    { id: newId(), email: e, kind: "done", taskId: ids[2]!, text: "Bayu menyelesaikan tugas: Shooting video reels unboxing", at: now - 25 * min },
    { id: newId(), email: e, kind: "comment", taskId: ids[4]!, text: "Komentar baru di \"Edit reels unboxing\": Citra: Oke, saya revisi sebentar lagi.", at: now - 30 * min },
    { id: newId(), email: e, kind: "ask", taskId: null, text: "Hendra minta tugas: Semua tugasnya sudah selesai.", at: now - 3 * 3600_000, readAt: now - 2 * 3600_000 },
  ]).run();
}
console.log(`Demo siap: ${team.length} anggota, ${seeds.length} tugas. Pemilik: ${owner}`);
