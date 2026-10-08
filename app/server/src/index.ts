// Tugas Harian server: JSON API + live updates + Web Push + the built web app, in one process.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OAuth2Client } from "google-auth-library";
import { getCookie } from "hono/cookie";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { readEnv } from "./env.js";
import { createBus } from "./events.js";
import { startJobs } from "./jobs.js";
import { createPush } from "./push.js";

const env = readEnv();
const db = openDb(join(env.DATA_DIR, "app.db"));
const bus = createBus();
const push = createPush(db, env.OWNER_EMAIL, env.PUBLIC_URL);
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const api = createApp({
  db, env, push, bus,
  verifyGoogle: async credential => {
    const p = (await google.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID })).getPayload();
    if (!p?.email) throw new Error("no email in token");
    return { email: p.email.toLowerCase(), name: p.name ?? p.email, verified: !!p.email_verified };
  },
});

// API first, then the built web app with a fallback to index.html for client-side routes.
const web = resolve(env.WEB_DIR);
const app = api;
if (existsSync(web)) {
  const read = () => readFileSync(join(web, "index.html"), "utf8");
  const cached = read(); // in local dev mode re-read each time so a rebuild shows up on refresh
  const index = () => (env.ALLOW_DEV_LOGIN ? read() : cached);
  // Local preview only: open the app already signed in as DEV_AUTO_LOGIN (needs ALLOW_DEV_LOGIN and a localhost PUBLIC_URL).
  const autoLogin = env.ALLOW_DEV_LOGIN && env.DEV_AUTO_LOGIN && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.PUBLIC_URL) ? env.DEV_AUTO_LOGIN : null;
  if (autoLogin) app.use("/*", async (c, next) => {
    if (c.req.method === "GET" && !c.req.path.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(c.req.path) && !getCookie(c, "th_session")) return c.redirect(`/api/auth/dev?email=${encodeURIComponent(autoLogin)}`);
    await next();
  });
  // Local preview: the PWA cache would keep showing an old build, so replace the service worker with one that removes itself.
  if (env.ALLOW_DEV_LOGIN) app.get("/sw.js", c => c.body(
    "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x)))).then(()=>self.registration.unregister()).then(()=>self.clients.matchAll()).then(cs=>cs.forEach(w=>w.navigate(w.url)))));",
    200, { "content-type": "text/javascript", "cache-control": "no-store" }));
  app.use("/*", serveStatic({
    root: web,
    onFound: (path, c) => { c.header("cache-control", /\/assets\//.test(path) ? "public, max-age=31536000, immutable" : "no-cache"); },
  }));
  app.get("*", c => c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.html(index(), 200, { "cache-control": "no-cache" }));
}

startJobs(db, push, bus);
serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, i => console.log(`Tugas Harian listening on ${i.address}:${i.port}`));
