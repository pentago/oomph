import type { UiSession } from "../../../shared";

type Props = { item: UiSession; selected: boolean; onOpen: (item: UiSession) => void };

export function SessionRow({ item, selected, onOpen }: Props) {
  const title = item.title || "New chat";
  return (
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
  );
}
