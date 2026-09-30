// Appearance: light/dark preference ("system" follows the OS), color theme, fonts and base font size. The resolved
// mode is written to <html data-mode> because the palette (styles/theme.css) and the code highlighter key off it.
// Everything else is inline custom properties on <html>; the exact css is cached in `oomph-paint` so
// assets/theme-init.js can restore it before first paint.
import { loadFont } from "./fonts";
import { paletteVars, THEMES } from "./themes";

export type ThemeMode = "system" | "light" | "dark";

const KEY = "oomph-theme";
const prefersDark = matchMedia("(prefers-color-scheme: dark)");

export function getThemeMode(): ThemeMode {
  const saved = localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

// Mobile browsers ignore hsl()/var() in <meta name="theme-color">, so resolve the page background to #rrggbb.
function syncThemeColor() {
  const probe = document.createElement("i");
  probe.style.color = "var(--color-bg-100)";
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const rgb = color.startsWith("rgb") ? color.match(/\d+/g)?.slice(0, 3).map(Number) : undefined;
  if (rgb?.length === 3) {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", `#${rgb.map(n => n.toString(16).padStart(2, "0")).join("")}`);
  }
}

export type Look = { theme: string; size: number; ui: string; sidebar: string; chat: string; code: string };
export const SIZE_MIN = 12;
export const SIZE_MAX = 24;
// Defaults reproduce the Claude desktop app: sans interface, serif assistant text. Sidebar "" = same as the interface.
const DEFAULT_LOOK: Look = {
  theme: "default",
  size: 16,
  ui: "Inter",
  sidebar: "",
  chat: "Source Serif 4",
  code: "JetBrains Mono",
};
const LOOK_KEY = "oomph-look";

export function getLook(): Look {
  try {
    return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(LOOK_KEY) ?? "{}") };
  } catch {
    return DEFAULT_LOOK;
  }
}

export function setLook(patch: Partial<Look>) {
  localStorage.setItem(LOOK_KEY, JSON.stringify({ ...getLook(), ...patch }));
  apply();
}

function apply() {
  const pref = getThemeMode();
  const look = getLook();
  const theme = THEMES.find(t => t.id === look.theme) ?? THEMES[0];
  let mode: "light" | "dark" = pref === "system" ? (prefersDark.matches ? "dark" : "light") : pref;
  // Single-variant themes (Zenburn, Dracula) ignore the light/dark preference.
  if (!theme[mode]) mode = theme.dark ? "dark" : "light";
  const palette = theme[mode];
  const vars = palette ? paletteVars(palette) : {};
  for (const [key, family, fallback] of [
    ["--font-ui-sans", look.ui, "system-ui, sans-serif"],
    ["--font-sidebar", look.sidebar, "system-ui, sans-serif"],
    ["--font-chat", look.chat, "Georgia, serif"],
    ["--font-mono", look.code, "ui-monospace, monospace"],
  ]) {
    if (!family) continue;
    loadFont(family);
    vars[key] = `"${family}", ${fallback}`;
  }
  const size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, look.size));
  const css = `font-size:${size}px;${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}`;
  document.documentElement.style.cssText = css;
  document.documentElement.dataset.mode = mode;
  localStorage.setItem("oomph-paint", JSON.stringify({ mode, css }));
  requestAnimationFrame(syncThemeColor);
}

export function setThemeMode(mode: ThemeMode) {
  if (mode === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, mode);
  apply();
}

export function initTheme() {
  apply();
  prefersDark.addEventListener("change", apply);
}
