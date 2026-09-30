import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "preact/hooks";

/** Clipboard write that also works on non-secure origins (execCommand fallback). */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through to the legacy path
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Failed to copy text to clipboard");
}

type CopyButtonProps = {
  text: string;
  className?: string;
  position?: "absolute" | "static";
  /** Name of the `group/<name>` ancestor that reveals an absolute button on hover. */
  groupName?: string;
};

export function CopyButton({ text, className, position = "absolute", groupName }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await copyText(text);
    } catch (err) {
      console.error("copy failed", err);
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  const hover = groupName ? `group-hover/${groupName}:opacity-100` : "group-hover:opacity-100";
  return (
    <button
      type="button"
      onClick={onClick}
      class={[
        "inline-flex items-center justify-center h-7 w-7 p-1.5 rounded-md transition-colors duration-150",
        copied ? "text-success-100" : "text-text-400 hover:text-text-200",
        position === "absolute" ? `absolute top-2 right-2 z-10 opacity-0 ${hover}` : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={copied ? "Copied" : "Copy"}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}
