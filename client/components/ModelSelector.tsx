import { Check, ChevronDown, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { createPortal } from "react-dom";
import type { UiModel } from "../../shared";

type Props = {
  models: UiModel[];
  selected?: UiModel;
  disabled: boolean;
  onOpen: () => void;
  onSelect: (provider: string, modelId: string) => void;
};

function formatContext(limit: number) {
  const k = Math.round(limit / 1000);
  return k >= 1000 ? `${(k / 1000).toFixed(0)}M` : `${k}k`;
}

const sameModel = (a: UiModel, b?: UiModel) => !!b && a.provider === b.provider && a.id === b.id;

export function ModelSelector({ models, selected, disabled, onOpen, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // drives the fade/scale transition
  const [query, setQuery] = useState("");
  const [hl, setHl] = useState(0);
  const [pos, setPos] = useState<{ bottom: number; left?: number; right?: number; width?: number }>({ bottom: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? models.filter(m => [m.name, m.id, m.provider].some(s => s.toLowerCase().includes(q))) : models),
    [models, q],
  );
  const groups = useMemo(() => {
    const by = new Map<string, UiModel[]>();
    for (const m of filtered) by.set(m.provider, [...(by.get(m.provider) ?? []), m]);
    return [...by];
  }, [filtered]);
  const flat = groups.flatMap(([, ms]) => ms);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const toggle = () => {
    if (open) return close();
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    // The trigger lives at the bottom of the screen, so the menu opens upward. Phones get a full-width sheet.
    setPos(
      innerWidth < 640
        ? { bottom: innerHeight - r.top + 8, left: 12, right: 12 }
        : { bottom: innerHeight - r.top + 8, left: r.left, width: 460 },
    );
    setHl(0);
    setOpen(true);
    onOpen();
  };
  const pick = (m: UiModel) => {
    onSelect(m.provider, m.id);
    close();
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return setShown(false);
    const raf = requestAnimationFrame(() => setShown(true));
    const focus = setTimeout(() => search.current?.focus(), 50);
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || menu.current?.contains(e.target) || trigger.current?.contains(e.target))
        return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(focus);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Start on the current model, also once the list arrives after opening.
  useEffect(() => {
    if (open && !q)
      setHl(
        Math.max(
          0,
          flat.findIndex(m => sameModel(m, selected)),
        ),
      );
  }, [open, models]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-idx="${hl}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, hl, filtered]);

  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setHl(h => (flat.length ? (h + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = flat[hl];
      if (m) pick(m);
    }
  };

  const name = selected?.name || "Select model";
  let idx = -1;
  return (
    <div class="relative font-sans min-w-0">
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
        title={name}
        class="group inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg px-2 text-[length:var(--fs-sm)] text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span class="truncate max-w-[40vw] md:max-w-[240px]">{name}</span>
        <ChevronDown size={14} class="shrink-0 text-text-400" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            class={`fixed glass border border-border-200/60 rounded-xl transition-all duration-200 !p-0 overflow-hidden flex flex-col max-h-[min(600px,70vh)] min-w-[280px] max-w-[min(460px,calc(100vw-24px))] ${shown ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
            style={{ ...pos, zIndex: 100, transformOrigin: "bottom left" }}
          >
            <div class="flex flex-col min-h-0 pt-1.5">
              <div class="shrink-0 px-2 pb-1.5">
                <div class="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-bg-200/40 transition-colors focus-within:bg-bg-200/60">
                  <Search aria-hidden="true" className="w-3.5 h-3.5 text-text-400 flex-shrink-0" />
                  <input
                    ref={search}
                    type="text"
                    name="model-search"
                    value={query}
                    onInput={e => {
                      setQuery(e.currentTarget.value);
                      setHl(0);
                    }}
                    onKeyDown={onSearchKey}
                    placeholder="Search models..."
                    aria-label="Search models"
                    autoComplete="off"
                    class="flex-1 min-w-0 bg-transparent border-none outline-none text-[length:var(--fs-base)] text-text-100 placeholder:text-text-400"
                  />
                </div>
              </div>
              <div ref={list} class="overflow-y-auto flex-1 min-h-0 pl-2 pr-1 max-h-[min(500px,60vh)]">
                {flat.length === 0 ? (
                  <div class="px-4 py-10 text-center" role="status">
                    <div class="text-[length:var(--fs-base)] text-text-400">
                      {models.length ? "No models found" : "Loading models..."}
                    </div>
                    {models.length > 0 && (
                      <div class="text-[length:var(--fs-sm)] text-text-500 mt-1">Try a different keyword</div>
                    )}
                  </div>
                ) : (
                  <div class="pb-1 pr-1">
                    {groups.map(([provider, ms]) => (
                      <div key={provider}>
                        <div class="px-2.5 pt-3 pb-1 first:pt-0.5 text-[length:var(--fs-xxs)] font-semibold text-text-400/60 uppercase tracking-wider select-none">
                          {provider}
                        </div>
                        {ms.map(m => {
                          idx++;
                          const i = idx;
                          const isSel = sameModel(m, selected);
                          const isHl = i === hl;
                          return (
                            <div
                              key={`${m.provider}/${m.id}/${i}`}
                              data-idx={i}
                              onPointerEnter={() => setHl(i)}
                              class={`group flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors duration-100 ${isSel ? "bg-accent-main-100/10 text-accent-main-100" : "text-text-200"} ${isHl && !isSel ? "bg-bg-300 text-text-100" : ""}`}
                            >
                              <button
                                type="button"
                                onClick={() => pick(m)}
                                title={`${m.name} · ${m.provider}${m.contextWindow ? ` · ${formatContext(m.contextWindow)}` : ""}`}
                                class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md bg-transparent border-none p-0 text-left text-[length:var(--fs-base)] outline-none focus-visible:outline-none"
                              >
                                <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                                  <span
                                    class={`truncate font-medium ${isSel ? "text-accent-main-100" : "text-text-100"}`}
                                  >
                                    {m.name}
                                  </span>
                                  <div
                                    aria-hidden="true"
                                    class={`flex items-center gap-1 flex-shrink-0 transition-opacity ${isHl || isSel ? "opacity-60" : "opacity-25"}`}
                                  >
                                    {m.reasoning && <Sparkles size={12} />}
                                  </div>
                                </div>
                                <div class="flex items-center gap-2 text-[length:var(--fs-sm)] font-mono flex-shrink-0">
                                  <span class="text-text-500 max-w-[100px] truncate text-right">{m.provider}</span>
                                  {m.contextWindow > 0 && (
                                    <span class="text-text-500 w-[4ch] text-right hidden sm:inline">
                                      {formatContext(m.contextWindow)}
                                    </span>
                                  )}
                                  {isSel && (
                                    <span class="w-5 flex items-center justify-center flex-shrink-0 text-accent-secondary-100">
                                      <Check size={16} aria-hidden="true" />
                                    </span>
                                  )}
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
