export type Theme = "light" | "dark";
const KEY = "th-theme";
export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark") return v; } catch { /* private mode */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
}
export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");
