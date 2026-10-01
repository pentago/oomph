import { Trash2 } from "lucide-react";
import { useEffect, useState } from "preact/hooks";
import type { UiSession } from "../../../shared";

type Props = {
  item: UiSession;
  selected: boolean;
  onOpen: (item: UiSession) => void;
  onDelete: (item: UiSession) => void;
};

export function SessionRow({ item, selected, onOpen, onDelete }: Props) {
  const title = item.title || "New chat";
  // Deleting can't be undone, so the first click only arms the button; the second one deletes.
  const [armed, setArmed] = useState(false);
  // Safari/iOS don't focus buttons on click, so blur alone can't be the only way back out.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <div class="group relative">
      <button
        type="button"
        onClick={() => onOpen(item)}
        title={`${title}\n${item.cwd}\n${item.messages} messages · ${new Date(item.mtime).toLocaleString()}`}
        class={`flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg border-none px-2.5 text-left select-none transition-colors ${
          selected ? "bg-bg-300 text-text-100" : "bg-transparent text-text-200 hover:bg-bg-300/50 hover:text-text-100"
        }`}
      >
        {item.running ? (
          <span class="relative flex size-2 shrink-0 items-center justify-center">
            <span class="absolute size-1.5 rounded-full bg-success-100" />
            <span class="absolute size-1.5 animate-ping rounded-full bg-success-100 opacity-50" />
          </span>
        ) : (
          <span class="size-2 shrink-0 rounded-full border border-text-500/60" />
        )}
        <span class="min-w-0 flex-1 truncate text-[length:var(--fs-base)]">{title}</span>
      </button>
      <button
        type="button"
        aria-label={armed ? `Confirm deleting ${title}` : `Delete ${title}`}
        title={armed ? "Click again to delete from omp too" : "Delete chat"}
        onClick={() => (armed ? onDelete(item) : setArmed(true))}
        onBlur={() => setArmed(false)}
        onMouseLeave={() => setArmed(false)}
        class={`absolute right-1 top-1/2 inline-flex h-6 -translate-y-1/2 cursor-pointer items-center justify-center gap-1 rounded-md border-none bg-bg-300 text-text-400 transition-opacity hover:text-danger-100 focus-visible:opacity-100 group-hover:opacity-100 ${
          armed ? "px-2 text-danger-100 opacity-100" : "w-6 opacity-0"
        }`}
      >
        <Trash2 size={14} aria-hidden="true" />
        {armed && <span class="text-[length:var(--fs-xs)]">Delete?</span>}
      </button>
    </div>
  );
}
