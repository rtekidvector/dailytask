// Rebuilds the web app whenever a file in web/src or shared/src changes (full builds: `vite build --watch` is flaky with the PWA plugin).
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
let running = false, again = false, timer;
function build() {
  if (running) { again = true; return; }
  running = true;
  const p = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "build"], { cwd: resolve(root, "web"), stdio: "inherit" });
  p.on("exit", code => { running = false; console.log(code ? "build failed" : "build ok", new Date().toLocaleTimeString()); if (again) { again = false; build(); } });
}
for (const dir of ["web/src", "shared/src"]) watch(resolve(root, dir), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(build, 400); });
build();
