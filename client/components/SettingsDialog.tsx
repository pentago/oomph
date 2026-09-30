import { Check, Monitor, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "preact/hooks";
import { MONO_FONTS, SANS_FONTS, SERIF_FONTS } from "../fonts";
import { getLook, getThemeMode, SIZE_MAX, SIZE_MIN, setLook, setThemeMode, type ThemeMode } from "../theme";
import { THEMES } from "../themes";

const MODES = [
  { id: "system", Icon: Monitor, label: "System" },
  { id: "light", Icon: Sun, label: "Light" },
  { id: "dark", Icon: Moon, label: "Dark" },
] as const;

const GROUPS = [
  { label: "Sans-serif", fonts: SANS_FONTS },
  { label: "Serif", fonts: SERIF_FONTS },
  { label: "Monospace", fonts: MONO_FONTS },
];
const FONT_FIELDS = [
  { key: "ui", label: "Interface", none: "System default", groups: GROUPS },
  { key: "sidebar", label: "Sidebar", none: "Same as interface", groups: GROUPS },
  { key: "chat", label: "Replies", none: "System serif", groups: GROUPS },
  { key: "code", label: "Code", none: "System monospace", groups: [GROUPS[2], GROUPS[0], GROUPS[1]] },
] as const;

const heading = "mb-2 text-[length:var(--fs-xxs)] font-bold uppercase tracking-wider text-text-400";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  const [look, setLocal] = useState(getLook);
  const update = (patch: Partial<typeof look>) => {
    setLook(patch);
    setLocal(getLook());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dark = document.documentElement.dataset.mode === "dark";
  return (
    <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-always-black/40 p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close settings"
        class="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Settings"
        class="glass-alt relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border-200/60 bg-bg-000 shadow-lg"
      >
        <div class="flex items-center justify-between border-b border-border-200/40 px-4 py-3">
          <span class="text-[length:var(--fs-lg)] font-medium text-text-100">Settings</span>
          <button type="button" aria-label="Close" onClick={onClose} class="text-text-400 hover:text-text-100">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div class="flex flex-col gap-6 overflow-y-auto p-4">
          <section>
            <div class={heading}>Appearance</div>
            <div class="mb-3 flex rounded-md border border-border-200/30 bg-bg-200/50 p-1">
              {MODES.map(({ id, Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => {
                    setThemeMode(id);
                    setMode(id);
                  }}
                  class={`flex flex-1 items-center justify-center gap-1.5 rounded-sm py-1.5 text-[length:var(--fs-sm)] font-medium transition-colors ${
                    mode === id
                      ? "bg-bg-000 text-text-100 shadow-sm ring-1 ring-border-200/50"
                      : "text-text-400 hover:text-text-200"
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <div class="grid grid-cols-2 gap-2">
              {THEMES.map(t => {
                // Single-variant themes preview the variant they actually use.
                const p = dark ? (t.dark ?? t.light) : (t.light ?? t.dark);
                const active = look.theme === t.id;
                const dot = "h-2 w-2 rounded-full";
                if (!p) return null; // unreachable: every THEMES entry ships at least one variant
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ theme: t.id })}
                    class={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                      active
                        ? "border-accent-main-100/60 bg-accent-main-100/5"
                        : "border-border-200/50 hover:bg-bg-100/50"
                    }`}
                  >
                    <span
                      class="grid h-7 w-7 shrink-0 grid-cols-2 place-content-center gap-1 rounded-md border border-border-200/30 p-1.5"
                      style={{ background: p.bg }}
                    >
                      <span class={dot} style={{ background: p.accent }} />
                      <span class={dot} style={{ background: p.fg }} />
                      <span class={dot} style={{ background: p.green }} />
                      <span class={dot} style={{ background: p.red }} />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-[length:var(--fs-md)] text-text-100">{t.name}</span>
                    {active && <Check size={12} class="shrink-0 text-accent-main-100" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </section>
          <section>
            <div class={heading}>Fonts</div>
            <div class="flex flex-col gap-2">
              {FONT_FIELDS.map(({ key, label, none, groups }) => (
                <label
                  key={key}
                  class="flex items-center justify-between gap-3 text-[length:var(--fs-md)] text-text-200"
                >
                  {label}
                  <select
                    value={look[key]}
                    onChange={e => update({ [key]: e.currentTarget.value })}
                    class="w-48 rounded-md border border-border-200/50 bg-bg-100 px-2 py-1 text-text-100"
                  >
                    <option value="">{none}</option>
                    {groups.map(g => (
                      <optgroup key={g.label} label={g.label}>
                        {g.fonts.map(f => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              ))}
              <label class="mt-2 flex items-center gap-3 text-[length:var(--fs-md)] text-text-200">
                <span class="shrink-0">Font size</span>
                <input
                  type="range"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  step={1}
                  value={look.size}
                  onInput={e => update({ size: Number(e.currentTarget.value) })}
                  class="min-w-0 flex-1 accent-accent-main-100"
                />
                <span class="w-10 shrink-0 text-right tabular-nums text-text-300">{look.size}px</span>
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
