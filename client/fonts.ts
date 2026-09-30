// Curated Google Fonts (all have 400 + 700). `null` = keep the built-in system stack. Loaded on demand from
// fonts.googleapis.com, so the browser (not the server) needs internet access.
// ponytail: fixed list, no free-text family box; add one if someone needs a font that isn't here.
export const SANS_FONTS = [
  "Inter",
  "Geist",
  "Roboto",
  "Open Sans",
  "Lato",
  "DM Sans",
  "Space Grotesk",
  "Montserrat",
  "Poppins",
  "Work Sans",
  "Source Sans 3",
  "IBM Plex Sans",
  "Public Sans",
  "Nunito Sans",
  "Rubik",
  "Manrope",
  "Barlow",
  "Karla",
  "Fira Sans",
  "Ubuntu",
  "Noto Sans",
];

export const SERIF_FONTS = [
  "Source Serif 4",
  "Merriweather",
  "Lora",
  "Newsreader",
  "Literata",
  "Fraunces",
  "Spectral",
  "Playfair Display",
  "Cormorant Garamond",
  "Alegreya",
  "PT Serif",
  "Noto Serif",
  "Crimson Pro",
  "EB Garamond",
  "Libre Baskerville",
  "IBM Plex Serif",
  "Bitter",
  "Domine",
  "Cardo",
  "Zilla Slab",
];

export const MONO_FONTS = [
  "JetBrains Mono",
  "Geist Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
  "Roboto Mono",
  "Martian Mono",
  "Sometype Mono",
  "Inconsolata",
  "Space Mono",
  "Ubuntu Mono",
  "Red Hat Mono",
  "Chivo Mono",
  "Cascadia Code",
  "Overpass Mono",
  "Anonymous Pro",
  "Cousine",
  "Fira Mono",
];

const loaded = new Set<string>();

/** Adds the stylesheet for `family` once. */
export function loadFont(family: string) {
  if (loaded.has(family)) return;
  loaded.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@400;700&display=swap`;
  document.head.append(link);
}
