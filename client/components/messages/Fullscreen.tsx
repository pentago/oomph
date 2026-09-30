import { X } from "lucide-react";
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect } from "preact/hooks";

type FullscreenProps = {
  onClose: () => void;
  children: ComponentChildren;
  title?: string;
  headerRight?: ComponentChildren;
  /** false lets the content own the whole surface (terminal view) */
  showHeader?: boolean;
};

/** Viewport-filling layer. Rendered in a portal because message rows use `contain`, which would trap `fixed`. */
export function Fullscreen({ onClose, children, title, headerRight, showHeader = true }: FullscreenProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div class="fixed inset-0 z-[100] flex flex-col bg-bg-100">
      {showHeader && (
        <div class="flex items-center h-11 px-4 border-b border-border-100/40 shrink-0 gap-3">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            {title && (
              <span class="text-text-100 font-mono text-[length:var(--fs-md)] font-medium truncate min-w-0 flex-1">
                {title}
              </span>
            )}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            {headerRight}
            {headerRight && <div class="w-px h-4 bg-border-200/30" />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close (Esc)"
              title="Close (Esc)"
              class="p-1.5 text-text-400 hover:text-text-100 hover:bg-bg-200/60 rounded-lg transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div class="flex-1 min-h-0">{children}</div>
    </div>,
    document.body,
  );
}
