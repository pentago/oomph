// Runs before first paint (see index.html) so users don't get a flash of the default theme. Restores the css that
// theme.ts cached in `oomph-paint`; falls back to the OS/saved light-dark mode. Keep in sync with theme.ts.
(() => {
  const root = document.documentElement;
  try {
    const paint = JSON.parse(localStorage.getItem("oomph-paint"));
    root.style.cssText = paint.css;
    root.dataset.mode = paint.mode;
    return;
  } catch {}
  const saved = localStorage.getItem("oomph-theme");
  root.dataset.mode =
    saved === "light" || saved === "dark"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
})();
