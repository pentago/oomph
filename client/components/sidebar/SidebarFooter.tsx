import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "react-dom";
import type { UiState } from "../../../shared";
import { Logo } from "../Logo";
import { SettingsDialog } from "../SettingsDialog";

const formatCost = (cost: number) => (cost > 0 && cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`);

const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

type Props = { showLabels: boolean; state: UiState | null; cost: number; online: boolean };

export function SidebarFooter({ showLabels, state, cost, online }: Props) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // drives the fade/scale transition
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pos, setPos] = useState({ bottom: 0, left: 0, width: 260 });
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const cu = state?.contextUsage;
  const used = cu?.tokens ?? 0;
  const limit = cu?.contextWindow || 200_000;
  const percent = Math.min(Math.max(cu?.percent ?? 0, 0), 100);
  const barColor = percent >= 90 ? "bg-danger-100" : percent >= 70 ? "bg-warning-100" : "bg-accent-main-100";

  const toggle = () => {
    if (open) return setOpen(false);
    const c = box.current?.getBoundingClientRect();
    const b = trigger.current?.getBoundingClientRect();
    if (!c || !b) return;
    // Expanded: the menu sits above the footer at its width. Collapsed rail: it opens to the right of the button.
    setPos(
      showLabels
        ? { bottom: innerHeight - c.top + 8, left: c.left, width: c.width }
        : { bottom: innerHeight - b.bottom, left: b.right + 16, width: 260 },
    );
    setOpen(true);
  };

  // Opening/closing is driven by one effect so the listeners never outlive the menu.
  useEffect(() => {
    if (!open) return setShown(false);
    const raf = requestAnimationFrame(() => setShown(true));
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !menu.current?.contains(e.target) && !trigger.current?.contains(e.target))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [showLabels]);

  const item =
    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[length:var(--fs-sm)] text-text-200 transition-colors hover:bg-bg-300/50 hover:text-text-100";
  return (
    <div class="shrink-0 pb-[var(--safe-area-inset-bottom)]">
      <div ref={box} class="mx-2 flex flex-col gap-0.5 border-t border-border-300/15 py-2">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
          title={`Context: ${formatTokens(used)} tokens, ${Math.round(percent)}%`}
          class={`flex h-10 items-center gap-2.5 overflow-hidden rounded-lg px-1.5 transition-colors ${
            open ? "bg-bg-300/50 text-text-100" : "text-text-200 hover:bg-bg-300/50 hover:text-text-100"
          }`}
          style={{ width: showLabels ? "100%" : 32 }}
        >
          <span class="relative flex size-6 shrink-0 items-center justify-center rounded-md bg-bg-300">
            <Logo size={14} />
            <span
              class={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-bg-200 ${online ? "bg-success-100" : "bg-danger-100"}`}
            />
          </span>
          {showLabels && (
            <>
              <span class="min-w-0 flex-1 truncate text-left text-[length:var(--fs-base)]">oomph</span>
              <span class="shrink-0 text-[length:var(--fs-xs)] tabular-nums text-text-400">{Math.round(percent)}%</span>
              <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-text-400" />
            </>
          )}
        </button>
      </div>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={{ ...pos, transformOrigin: "bottom left" }}
            class={`fixed z-[9999] overflow-hidden rounded-xl border border-border-200/60 bg-bg-000 shadow-lg transition-all duration-150 ease-out ${
              shown ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`}
          >
            <div class="relative p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[length:var(--fs-sm)] font-medium text-text-200">Context usage</span>
                <span class="text-[length:var(--fs-sm)] leading-none tabular-nums text-text-400">
                  {Math.round(percent)}%
                </span>
              </div>
              <div class="relative mb-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-300">
                <div
                  class={`absolute inset-0 origin-left transition-transform duration-500 ease-out ${barColor}`}
                  style={{ transform: `scaleX(${percent / 100})` }}
                />
              </div>
              <div class="flex justify-between font-mono text-[length:var(--fs-xxs)] text-text-400">
                <span>
                  {formatTokens(used)} / {formatTokens(limit)}
                </span>
                <span>{formatCost(cost)}</span>
              </div>
              <div class="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-border-200/30" />
            </div>

            <div class="p-1">
              <button
                type="button"
                role="menuitem"
                class={item}
                onClick={() => {
                  setOpen(false);
                  setSettingsOpen(true);
                }}
              >
                <Settings size={14} aria-hidden="true" />
                <span>Settings</span>
              </button>
              <form method="post" action="/logout">
                <button type="submit" role="menuitem" class={item}>
                  <LogOut size={14} aria-hidden="true" />
                  <span>Log out</span>
                </button>
              </form>
            </div>

            <div class="relative flex items-center gap-2 px-3 py-2 text-[length:var(--fs-xxs)] text-text-300">
              <div class="pointer-events-none absolute inset-x-3 top-0 h-px bg-border-200/30" />
              <div class={`h-1.5 w-1.5 rounded-full ${online ? "bg-success-100" : "bg-danger-100"}`} />
              <span>{online ? "Connected" : "Offline"}</span>
              <span class="ml-auto font-mono text-text-400">build {BUILD_STAMP}</span>
            </div>
          </div>,
          document.body,
        )}
      {settingsOpen && createPortal(<SettingsDialog onClose={() => setSettingsOpen(false)} />, document.body)}
    </div>
  );
}
