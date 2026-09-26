export type ThemePref = "system" | "light" | "dark";
const KEY = "dulce-theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
}

export function applyTheme(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* */ }
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#170e12" : "#F4527A");
}

export function watchSystemTheme() {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const on = () => { if (getThemePref() === "system") applyTheme("system"); };
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}
