// Popular editor/terminal palettes, expanded into the same CSS tokens as styles/theme.css (HSL triplets).
// Each variant is 7 colors; everything else (surfaces, text ramp, borders, semantic tints) is derived by mixing.
export type Palette = {
  bg: string;
  fg: string;
  accent: string;
  green: string;
  yellow: string;
  red: string;
  blue: string;
  /** Hand-picked bg-000/bg-200/bg-300 (elevated, sidebar, hover/selected); derived from `bg` when absent. */
  ramp?: [string, string, string];
};
export type Theme = { id: string; name: string; light?: Palette; dark?: Palette };

export const THEMES: Theme[] = [
  // id "default" = the static tokens in styles/theme.css (generated from these two palettes); nothing is overridden.
  {
    id: "default",
    name: "Claude",
    dark: {
      bg: "#161617",
      ramp: ["#202021", "#121213", "#2a2b2d"],
      fg: "#ececec",
      accent: "#d97757",
      green: "#6fb58a",
      yellow: "#e0a95b",
      red: "#eb7f82",
      blue: "#6ea8d8",
    },
    light: {
      bg: "#faf9f5",
      ramp: ["#ffffff", "#f3f1ea", "#e9e6dc"],
      fg: "#1f1e1d",
      accent: "#c6613f",
      green: "#3f8f5a",
      yellow: "#b7791f",
      red: "#c9403f",
      blue: "#3b78b4",
    },
  },
  {
    // catppuccin/palette v1.8 (mocha + latte): crust/mantle/base/surface0/surface1 = ramp.
    id: "catppuccin",
    name: "Catppuccin",
    dark: {
      bg: "#1e1e2e",
      ramp: ["#313244", "#181825", "#45475a"],
      fg: "#cdd6f4",
      accent: "#cba6f7",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      red: "#f38ba8",
      blue: "#89b4fa",
    },
    light: {
      bg: "#eff1f5",
      ramp: ["#ffffff", "#e6e9ef", "#ccd0da"],
      fg: "#4c4f69",
      accent: "#8839ef",
      green: "#40a02b",
      yellow: "#df8e1d",
      red: "#d20f39",
      blue: "#1e66f5",
    },
  },
  {
    // folke/tokyonight.nvim extras (night + day); hover/deepest slots derived.
    id: "tokyo-night",
    name: "Tokyo Night",
    dark: {
      bg: "#1a1b26",
      ramp: ["#292e42", "#16161e", "#313443"],
      fg: "#c0caf5",
      accent: "#7aa2f7",
      green: "#9ece6a",
      yellow: "#e0af68",
      red: "#f7768e",
      blue: "#7dcfff",
    },
    light: {
      bg: "#e1e2e7",
      ramp: ["#f0f1f5", "#dbdee8", "#c8cad8"],
      fg: "#3760bf",
      accent: "#2e7de9",
      green: "#587539",
      yellow: "#8c6c3e",
      red: "#f52a65",
      blue: "#007197",
    },
  },
  {
    // rebelot/kanagawa.nvim (wave + lotus); lotus ramp partly derived.
    id: "kanagawa",
    name: "Kanagawa",
    dark: {
      bg: "#1f1f28",
      ramp: ["#2a2a37", "#1a1a22", "#363646"],
      fg: "#dcd7ba",
      accent: "#7e9cd8",
      green: "#98bb6c",
      yellow: "#e6c384",
      red: "#e46876",
      blue: "#7fb4ca",
    },
    light: {
      bg: "#f2ecbc",
      ramp: ["#f8f5da", "#e2ddb3", "#d2ceaa"],
      fg: "#545464",
      accent: "#4d699b",
      green: "#76946a",
      yellow: "#de9800",
      red: "#c84053",
      blue: "#6693bf",
    },
  },
  {
    // jnurmine/Zenburn (dark only).
    id: "zenburn",
    name: "Zenburn",
    dark: {
      bg: "#3f3f3f",
      ramp: ["#4f4f4f", "#2f2f2f", "#5f5f5f"],
      fg: "#dcdccc",
      accent: "#8cd0d3",
      green: "#7f9f7f",
      yellow: "#f0dfaf",
      red: "#dca3a3",
      blue: "#94bff3",
    },
  },
  {
    // morhetz/gruvbox (dark + light).
    id: "gruvbox",
    name: "Gruvbox",
    dark: {
      bg: "#282828",
      ramp: ["#32302f", "#1d2021", "#3c3836"],
      fg: "#ebdbb2",
      accent: "#fabd2f",
      green: "#b8bb26",
      yellow: "#fe8019",
      red: "#fb4934",
      blue: "#83a598",
    },
    light: {
      bg: "#fbf1c7",
      ramp: ["#f9f5d7", "#f2e5bc", "#ebdbb2"],
      fg: "#282828",
      accent: "#d79921",
      green: "#98971a",
      yellow: "#d65d0e",
      red: "#9d0006",
      blue: "#076678",
    },
  },
  {
    // nordtheme (nord0-nord6).
    id: "nord",
    name: "Nord",
    dark: {
      bg: "#2e3440",
      ramp: ["#3b4252", "#262b34", "#434c5e"],
      fg: "#d8dee9",
      accent: "#88c0d0",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      red: "#bf616a",
      blue: "#81a1c1",
    },
    light: {
      bg: "#eceff4",
      ramp: ["#ffffff", "#e5e9f0", "#d8dee9"],
      fg: "#2e3440",
      accent: "#5e81ac",
      green: "#5f8a4c",
      yellow: "#a57f2b",
      red: "#bf616a",
      blue: "#5e81ac",
    },
  },
  {
    // Ethan Schoonover's Solarized (base03/base02 + base3/base2).
    id: "solarized",
    name: "Solarized",
    dark: {
      bg: "#002b36",
      ramp: ["#073642", "#00222b", "#0f3741"],
      fg: "#93a1a1",
      accent: "#268bd2",
      green: "#859900",
      yellow: "#b58900",
      red: "#dc322f",
      blue: "#2aa198",
    },
    light: {
      bg: "#fdf6e3",
      ramp: ["#fefbf2", "#eee8d5", "#dfdccb"],
      fg: "#586e75",
      accent: "#268bd2",
      green: "#859900",
      yellow: "#b58900",
      red: "#dc322f",
      blue: "#2aa198",
    },
  },
  {
    // rose-pine/palette (main + dawn).
    id: "rose-pine",
    name: "Rosé Pine",
    dark: {
      bg: "#191724",
      ramp: ["#1f1d2e", "#14131e", "#26233a"],
      fg: "#e0def4",
      accent: "#c4a7e7",
      green: "#9ccfd8",
      yellow: "#f6c177",
      red: "#eb6f92",
      blue: "#31748f",
    },
    light: {
      bg: "#faf4ed",
      ramp: ["#fffaf3", "#f2e9e1", "#f4ece4"],
      fg: "#464261",
      accent: "#907aa9",
      green: "#56949f",
      yellow: "#ea9d34",
      red: "#b4637a",
      blue: "#286983",
    },
  },
  {
    // sainnhe/everforest (medium + light); bg0/bg1/bg2/bg_dim = ramp.
    id: "everforest",
    name: "Everforest",
    dark: {
      bg: "#2d353b",
      ramp: ["#343f44", "#232a2e", "#3d484d"],
      fg: "#d3c6aa",
      accent: "#a7c080",
      green: "#a7c080",
      yellow: "#dbbc7f",
      red: "#e67e80",
      blue: "#7fbbb3",
    },
    light: {
      bg: "#fdf6e3",
      ramp: ["#fefbf2", "#efebd4", "#f4f0d9"],
      fg: "#5c6a72",
      accent: "#8da101",
      green: "#8da101",
      yellow: "#dfa000",
      red: "#f85552",
      blue: "#3a94c5",
    },
  },
  {
    // Atom's One Dark / One Light syntax themes.
    id: "one",
    name: "One Dark",
    dark: {
      bg: "#282c34",
      ramp: ["#21252b", "#21252b", "#3a3f47"],
      fg: "#abb2bf",
      accent: "#61afef",
      green: "#98c379",
      yellow: "#e5c07b",
      red: "#e06c75",
      blue: "#56b6c2",
    },
    light: {
      bg: "#fafafa",
      ramp: ["#ffffff", "#f0f0f0", "#eaebeb"],
      fg: "#383a42",
      accent: "#4078f2",
      green: "#50a14f",
      yellow: "#c18401",
      red: "#e45649",
      blue: "#0184bc",
    },
  },
  {
    // dracula (dark only; bg dark / current line / comment = ramp-ish).
    id: "dracula",
    name: "Dracula",
    dark: {
      bg: "#282a36",
      ramp: ["#44475a", "#22242e", "#41434d"],
      fg: "#f8f8f2",
      accent: "#bd93f9",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      red: "#ff5555",
      blue: "#8be9fd",
    },
  },
];

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function hsl([r, g, b]: RGB): string {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return `${Math.round(h * 60)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const luminance = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** CSS custom properties (name -> value) for one palette variant. Light variants have a light bg. */
export function paletteVars(p: Palette): Record<string, string> {
  const bg = rgb(p.bg);
  const fg = rgb(p.fg);
  const accent = rgb(p.accent);
  const [green, yellow, red, blue] = [p.green, p.yellow, p.red, p.blue].map(rgb);
  const ramp = p.ramp?.map(rgb);
  const dark = luminance(bg) < 0.5;
  const m = (t: number) => mix(bg, fg, t); // bg -> fg ramp
  const tint = (c: RGB) => mix(bg, c, dark ? 0.18 : 0.12);
  return Object.fromEntries(
    Object.entries({
      "bg-000": ramp?.[0] ?? (dark ? m(0.06) : mix(bg, WHITE, 0.6)),
      "bg-100": bg,
      "bg-200": ramp?.[1] ?? (dark ? mix(bg, BLACK, 0.25) : m(0.05)),
      "bg-300": ramp?.[2] ?? (dark ? mix(bg, BLACK, 0.4) : m(0.1)),
      "text-100": fg,
      "text-200": mix(fg, bg, 0.25),
      "text-300": mix(fg, bg, 0.45),
      "text-400": mix(fg, bg, 0.62),
      "text-500": mix(fg, bg, 0.74),
      "accent-brand": accent,
      "accent-main-000": dark ? mix(accent, bg, 0.2) : mix(accent, BLACK, 0.15),
      "accent-main-100": accent,
      "accent-main-200": mix(accent, WHITE, 0.2),
      "accent-secondary-100": blue,
      "success-100": green,
      "success-bg": tint(green),
      "warning-100": yellow,
      "warning-bg": tint(yellow),
      "danger-100": red,
      "danger-200": mix(red, WHITE, 0.25),
      "danger-bg": tint(red),
      "border-100": m(0.1),
      "border-200": m(0.14),
      "border-300": m(0.22),
      "oncolor-100": luminance(accent) > 0.6 ? BLACK : WHITE,
    }).map(([k, v]) => [`--${k}`, hsl(v)]),
  );
}
