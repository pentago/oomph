import { ChevronDown, Folder, PanelLeft, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SidebarProps } from "./props";
import { SessionRow } from "./sidebar/SessionRow";
import { SidebarFooter } from "./sidebar/SidebarFooter";
import { useIsMobile } from "./sidebar/useIsMobile";

const fade = {
  WebkitMaskImage: "linear-gradient(to right, black 82%, transparent 100%)",
  maskImage: "linear-gradient(to right, black 82%, transparent 100%)",
};
const baseName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
const parentPath = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";

export function Sidebar(p: SidebarProps) {
  const mobile = useIsMobile();
  const showLabels = mobile || !p.collapsed;
  const [search, setSearch] = useState("");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const pending = useRef<"search" | "projects" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const touch = useRef({ x: 0, y: 0, axis: "pending" as "pending" | "horizontal" | "vertical" });

  // The rail's search/project icons expand the sidebar first, then act.
  useEffect(() => {
    if (!showLabels) return setProjectsOpen(false);
    if (pending.current === "search") searchRef.current?.focus();
    if (pending.current === "projects") setProjectsOpen(true);
    pending.current = null;
  }, [showLabels]);

  const expandThen = (action: "search" | "projects") => {
    pending.current = action;
    p.onToggleCollapse();
  };

  const q = search.trim().toLowerCase();
  const visible = p.items.filter(
    i => !q || (i.title ?? "").toLowerCase().includes(q) || i.cwd.toLowerCase().includes(q),
  );
  const cwdLabel = p.newCwd ? baseName(p.newCwd) : "Select project";

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) touch.current = { x: t.clientX, y: t.clientY, axis: "pending" };
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    const s = touch.current;
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (s.axis === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? "horizontal" : "vertical";
    }
    if (s.axis === "horizontal") setSwipeX(Math.min(0, dx));
  };
  const onTouchEnd = () => {
    if (swipeX < -80) p.onClose();
    setSwipeX(0);
  };

  const rail = "h-8 flex items-center rounded-lg active:scale-[0.98] transition-all duration-300 overflow-hidden";
  const railStyle = { width: showLabels ? "100%" : 32, paddingLeft: 6, paddingRight: 6 };

  return (
    <>
      {mobile && (
        <button
          type="button"
          aria-label="Close sidebar"
          tabIndex={p.open ? 0 : -1} // invisible while closed, so keep it out of the Tab order then
          class={`fixed inset-0 z-30 bg-[hsl(var(--always-black)/0.4)] transition-opacity duration-300 ${p.open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
          onClick={p.onClose}
        />
      )}
      <aside
        onTouchStart={mobile ? onTouchStart : undefined}
        onTouchMove={mobile ? onTouchMove : undefined}
        onTouchEnd={mobile ? onTouchEnd : undefined}
        onTouchCancel={mobile ? onTouchEnd : undefined}
        class={`flex flex-col bg-bg-200 overflow-hidden font-[family-name:var(--font-sidebar,var(--font-ui-sans))] ${
          mobile
            ? `fixed left-0 top-0 z-40 h-full shadow-lg ${swipeX ? "" : "transition-transform duration-300 ease-out"}`
            : "relative h-full shrink-0 min-w-0 border-r border-border-300/15 transition-[width] duration-300 ease-out"
        }`}
        style={
          mobile
            ? {
                width: "min(342px, calc(100vw - 72px))",
                transform: p.open ? `translateX(${swipeX}px)` : "translateX(-100%)",
              }
            : { width: p.collapsed ? 49 : 280 }
        }
      >
        <div class="flex flex-col h-full overflow-hidden">
          {/* Header: collapse toggle */}
          <div class="oomph-topbar shrink-0 flex items-center">
            {!mobile && (
              <div
                class="flex-1 flex items-center transition-all duration-300 ease-out"
                style={{ justifyContent: showLabels ? "flex-start" : "center", paddingLeft: showLabels ? 12 : 0 }}
              >
                <button
                  type="button"
                  onClick={p.onToggleCollapse}
                  aria-label={p.collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  class="h-8 w-8 flex items-center justify-center rounded-lg text-text-300 hover:text-text-100 hover:bg-bg-300/50 active:scale-[0.98] transition-all duration-200"
                >
                  <PanelLeft size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div class="flex flex-col gap-0.5 mx-2 -mt-2.5">
            <button
              type="button"
              onClick={p.onNew}
              aria-label="New chat"
              title="New chat"
              class={`${rail} text-text-200 hover:text-text-100 hover:bg-bg-300/50 group`}
              style={railStyle}
            >
              <span class="size-5 flex items-center justify-center shrink-0 rounded-full bg-bg-300 text-text-100">
                <Plus size={14} aria-hidden="true" />
              </span>
              <span
                class="ml-2 text-[length:var(--fs-base)] whitespace-nowrap transition-opacity duration-300"
                style={{ opacity: showLabels ? 1 : 0 }}
              >
                New chat
              </span>
            </button>

            <button
              type="button"
              onClick={() => (showLabels ? setProjectsOpen(!projectsOpen) : expandThen("projects"))}
              aria-expanded={showLabels ? projectsOpen : false}
              aria-label={cwdLabel}
              title={p.newCwd || cwdLabel}
              class={`${rail} ${projectsOpen && showLabels ? "bg-bg-300/50 text-text-100" : "text-text-300 hover:text-text-100 hover:bg-bg-300/50"}`}
              style={railStyle}
            >
              <span class="size-5 flex items-center justify-center shrink-0">
                <Folder size={16} aria-hidden="true" />
              </span>
              <div
                class="ml-2 min-w-0 flex-1 text-left text-[length:var(--fs-base)] transition-opacity duration-300"
                style={{ opacity: showLabels ? 1 : 0 }}
              >
                <div class="block overflow-hidden whitespace-nowrap text-left" style={fade}>
                  {cwdLabel}
                </div>
              </div>
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`ml-auto text-text-400 transition-all duration-200 shrink-0 ${projectsOpen && showLabels ? "" : "-rotate-90"}`}
                style={{ opacity: showLabels ? 1 : 0 }}
              />
            </button>

            <div
              class="overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out"
              style={{
                maxHeight: showLabels && projectsOpen ? 304 : 0,
                opacity: showLabels && projectsOpen ? 1 : 0,
                marginTop: showLabels && projectsOpen ? 4 : 0,
                visibility: showLabels && projectsOpen ? "visible" : "hidden",
                pointerEvents: showLabels && projectsOpen ? "auto" : "none",
              }}
              aria-hidden={!showLabels || !projectsOpen}
            >
              <div class="rounded-xl border border-border-200/60 bg-bg-000 shadow-lg overflow-hidden">
                <div class="max-h-48 overflow-y-auto p-1">
                  {p.cwds.map(cwd => {
                    const active = cwd === p.newCwd;
                    return (
                      <button
                        key={cwd}
                        type="button"
                        onClick={() => {
                          p.onSelectCwd(cwd);
                          setProjectsOpen(false);
                        }}
                        aria-current={active ? "true" : undefined}
                        title={cwd}
                        class={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                          active ? "bg-bg-300 text-text-100" : "text-text-300 hover:text-text-100 hover:bg-bg-300/50"
                        }`}
                      >
                        <span class="w-5 h-5 flex items-center justify-center shrink-0">
                          <Folder size={14} aria-hidden="true" />
                        </span>
                        <div class="flex-1 min-w-0 text-left">
                          <div
                            class="overflow-hidden whitespace-nowrap text-left text-[length:var(--fs-sm)]"
                            style={fade}
                          >
                            {baseName(cwd)}
                          </div>
                          <div class="text-[length:var(--fs-xxs)] text-text-400 truncate opacity-70 font-mono">
                            {parentPath(cwd)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {showLabels ? (
              <div class="relative w-full">
                <span class="pointer-events-none absolute left-[6px] top-1/2 -translate-y-1/2 size-5 flex items-center justify-center text-text-300">
                  <Search size={16} aria-hidden="true" />
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  name="sidebar-chat-search"
                  value={search}
                  onInput={e => setSearch(e.currentTarget.value)}
                  placeholder="Search chats"
                  aria-label="Search chats"
                  autoComplete="off"
                  spellcheck={false}
                  class="h-8 w-full appearance-none rounded-lg border-0 bg-transparent pl-[34px] pr-[26px] text-[length:var(--fs-base)] text-text-100 shadow-none outline-none ring-0 placeholder:text-text-300 hover:bg-bg-300/50 focus:bg-bg-300/50 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    class="absolute right-[6px] top-1/2 flex size-[14px] -translate-y-1/2 items-center justify-center text-text-400 hover:text-text-100"
                    aria-label="Clear search"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => expandThen("search")}
                aria-label="Search chats"
                title="Search chats"
                class={`${rail} text-text-300 hover:text-text-100 hover:bg-bg-300/50`}
                style={{ width: 32, paddingLeft: 6, paddingRight: 6 }}
              >
                <span class="size-5 flex items-center justify-center shrink-0">
                  <Search size={16} aria-hidden="true" />
                </span>
              </button>
            )}
          </div>

          {/* Chats */}
          <div
            class="flex-1 flex flex-col min-h-0 overflow-hidden transition-opacity duration-300 ease-out"
            style={{ opacity: showLabels ? 1 : 0, visibility: showLabels ? "visible" : "hidden" }}
          >
            <div class="px-4 pt-5 pb-1.5 text-[length:var(--fs-sm)] text-text-300 shrink-0">Chats</div>
            <div class="flex-1 overflow-y-auto px-2 pb-3">
              {visible.length === 0 ? (
                <p class="py-12 text-center text-[length:var(--fs-sm)] text-text-400">
                  {q ? "No matches found" : "No chats yet"}
                </p>
              ) : (
                <div class="flex flex-col gap-px">
                  {visible.map(i => (
                    <SessionRow key={i.file} item={i} selected={i.file === p.activeFile} onOpen={p.onOpen} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {!showLabels && <div class="flex-1" />}

          <SidebarFooter showLabels={showLabels} state={p.state} cost={p.cost} online={p.online} />
        </div>
      </aside>
    </>
  );
}
