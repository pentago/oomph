import { ChevronDown } from "lucide-react";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

const UNMOUNT_DELAY_MS = 320;

/** Keep children mounted while the collapse animation runs. */
function useDelayedRender(show: boolean): boolean {
  const [rendered, setRendered] = useState(show);
  useEffect(() => {
    if (show) {
      setRendered(true);
      return;
    }
    const timer = setTimeout(() => setRendered(false), UNMOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [show]);
  return show || rendered;
}

type CollapseProps = {
  open: boolean;
  children: ComponentChildren;
  /** `fade` also animates opacity (cards); `height` only animates the grid row. */
  variant?: "height" | "fade";
  /** Let horizontal overflow (shimmer, shadows) escape the vertical clip. */
  clip?: boolean;
  innerClass?: string;
  contentClass?: string;
};

export function Collapse({
  open,
  children,
  variant = "height",
  clip,
  innerClass = "min-h-0 min-w-0 overflow-hidden",
  contentClass,
}: CollapseProps) {
  const mounted = useDelayedRender(open);
  const outer =
    variant === "fade"
      ? `grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`
      : `grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`;
  const body = mounted ? children : null;
  return (
    <div class={outer}>
      <div class={innerClass} style={clip ? { clipPath: "inset(0 -100% 0 -100%)" } : undefined}>
        {contentClass ? <div class={contentClass}>{body}</div> : body}
      </div>
    </div>
  );
}

/** Chevron that points down when open and right when closed. */
export function Chevron({ open, size = "md", extra = "" }: { open: boolean; size?: "sm" | "md"; extra?: string }) {
  const rotate = `transition-transform duration-300 ${open ? "" : "-rotate-90"} ${extra}`;
  return size === "sm" ? (
    <span class={`inline-flex h-5 w-3 shrink-0 items-center justify-center text-text-500 ${rotate}`}>
      <ChevronDown size={12} aria-hidden="true" />
    </span>
  ) : (
    <ChevronDown size={16} aria-hidden="true" className={`w-4 h-4 text-text-400 ${rotate}`} />
  );
}
