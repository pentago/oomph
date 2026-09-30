import { PanelLeft } from "lucide-react";
import type { HeaderProps } from "./props";
import { useIsMobile } from "./sidebar/useIsMobile";

export function Header(p: HeaderProps) {
  const mobile = useIsMobile();
  return (
    <div class="oomph-topbar flex shrink-0 items-center justify-between gap-2 bg-bg-100 px-2 md:px-6">
      <div class="flex min-w-0 items-center gap-1">
        {mobile && (
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={p.onOpenDrawer}
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-300 transition-colors hover:bg-bg-300 hover:text-text-100"
          >
            <PanelLeft size={16} aria-hidden="true" />
          </button>
        )}
        <span class="flex min-w-0 cursor-default select-none items-center gap-2 px-2 text-[length:var(--fs-base)] text-text-200">
          <span class="truncate">{p.title}</span>
        </span>
      </div>
      {!p.online && (
        <span
          class="flex shrink-0 items-center gap-1.5 px-2 text-[length:var(--fs-xxs)] text-danger-100"
          title="Disconnected, retrying"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-danger-100" />
          Offline
        </span>
      )}
    </div>
  );
}
