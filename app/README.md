# Tugas Harian (React + Hono)

Aplikasi tugas harian tim kreatif.

- **Dasbor** ringkasan progres, tenggat, aktivitas, kartu per orang, dan rekap 7/14 hari.
- **Papan** kanban (Belum / Dikerjakan / Selesai) dengan filter orang, proyek, label, prioritas; seret kartu untuk ganti status.
- **Kalender** mingguan berjam; seret tugas untuk menjadwal ulang, klik dua kali slot kosong untuk membuat tugas.
- **Detail tugas**: jadwal, prioritas, proyek, label, checklist, bukti foto/link, komentar dengan @mention, dan linimasa aktivitas.
- **Proyek & label**, **laporan** produktivitas (tepat waktu, beban kerja, per proyek) dengan ekspor CSV, pusat notifikasi (lonceng) + Web Push, pencarian cepat (Ctrl/⌘+K), tema terang/gelap.
- Login Google, tugas rutin, tugas yang bisa dikembalikan admin, serta hak akses pemilik / admin / admin unit / karyawan.

| Bagian | Teknologi |
|---|---|
| `web/` | React 19, Vite, TypeScript, Tailwind v4, TanStack Query, dnd-kit, PWA (vite-plugin-pwa) |
| `server/` | Hono (REST + SSE), Drizzle ORM, SQLite (better-sqlite3), Zod, web-push |
| `shared/` | Skema Zod, aturan akses (`policy.ts`), helper tanggal. Dipakai server dan web |

Klien web memakai `hono/client`, jadi path, body, dan respons API dicek tipenya dari kode server.

## Jalankan lokal
```sh
npm ci
cp server/.env.example server/.env   # isi GOOGLE_CLIENT_ID dan OWNER_EMAIL
npm run dev:server                    # http://127.0.0.1:3000
npm run dev:web                       # http://localhost:5173 (proxy /api ke server)
npm run typecheck && npm test         # tipe + tes server (aturan akses, API, pengingat)
```
Mencoba tanpa Google dengan data contoh (hanya untuk lokal):
```sh
DATA_DIR=./data OWNER_EMAIL=owner@demo.id npx tsx server/src/scripts/seed-demo.ts
ALLOW_DEV_LOGIN=1 PUBLIC_URL=http://localhost:3000/ GOOGLE_CLIENT_ID=x OWNER_EMAIL=owner@demo.id DATA_DIR=./data npm run dev:server
# lalu masuk lewat: curl -X POST localhost:3000/api/auth/dev -H 'x-app: 1' -H 'content-type: application/json' -d '{"email":"owner@demo.id"}'
```
`/api/auth/dev` hanya aktif bila `ALLOW_DEV_LOGIN=1` dan `PUBLIC_URL` adalah localhost; di produksi selalu 404.

Skema DB ada di `server/src/db/schema.ts`; setelah mengubahnya jalankan `npm run db:generate -w server` dan commit folder `server/drizzle`. Migrasi dijalankan otomatis saat server mulai.

## Deploy
Push ke `main` menjalankan `.github/workflows/app.yml`: typecheck, tes, build, lalu image dikirim ke VPS lewat SSH dan dijalankan dengan `deploy/docker-compose.yml`.
Secret repo yang dibutuhkan: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

## Pindah dari versi lama
`node dist/scripts/migrate-legacy.js <tugas.db lama> <app.db baru> [dailytask-export.json]`
