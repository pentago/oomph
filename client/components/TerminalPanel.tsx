import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ChevronDown, Columns2, Plus, Terminal as TerminalIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ServerMsg } from "../../shared";

type Send = (o: object) => void;
type Handlers = { current: Map<string, (m: ServerMsg) => void> };

// The page's theme tokens are HSL triplets; xterm wants real colors, and they change with the look settings.
const token = (name: string, alpha = 1) =>
  `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim()} / ${alpha})`;
const palette = () => ({
  background: token("--bg-000"),
  foreground: token("--text-100"),
  cursor: token("--accent-main-100"),
  selectionBackground: token("--accent-main-100", 0.3),
});

type PaneProps = { id: string; cwd: string; visible: boolean; send: Send; handlers: Handlers; onExit: () => void };

// One shell. The server runs it for as long as this component is mounted.
function TermPane({ id, cwd, visible, send, handlers, onExit }: PaneProps) {
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>();
  const fit = useRef<FitAddon>();

  useEffect(() => {
    const t = new Terminal({
      fontFamily: "monospace", // a browser can't use the user's terminal font; the system's generic mono is the closest
      fontSize: 13,
      cursorBlink: true,
      minimumContrastRatio: 4.5, // the default ANSI colors can vanish on a light theme
      theme: palette(),
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(box.current as HTMLDivElement);
    f.fit();
    term.current = t;
    fit.current = f;

    send({ t: "termOpen", id, cwd, cols: t.cols, rows: t.rows });
    t.onData(data => send({ t: "termIn", id, data }));
    t.onResize(({ cols, rows }) => send({ t: "termResize", id, cols, rows }));
    handlers.current.set(id, m => {
      if (m.t === "term") t.write(m.data);
      else if (m.t === "termExit") onExit();
    });
    const size = new ResizeObserver(() => f.fit()); // a hidden pane measures 0x0 and fit() ignores that
    size.observe(box.current as HTMLDivElement);
    const look = new MutationObserver(() => {
      t.options.theme = palette();
    });
    look.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-mode"] });
    return () => {
      handlers.current.delete(id);
      size.disconnect();
      look.disconnect();
      send({ t: "termClose", id });
      t.dispose();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    fit.current?.fit();
    term.current?.focus();
  }, [visible]);

  return <div ref={box} class="h-full w-full" />;
}

type Tab = { id: number; label: string; panes: string[] }; // panes sit side by side, one shell each

type Props = {
  cwd: string;
  visible: boolean;
  send: Send;
  sink: { current: ((m: ServerMsg) => void) | null }; // where App forwards the server's `term` / `termExit` messages
  onHide: () => void;
  onExit: () => void; // the last shell is gone
};

const iconBtn =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-text-400 transition-colors hover:bg-bg-200 hover:text-text-100";

const HEIGHT_KEY = "oomph-term-height";
const MIN_HEIGHT = 120;

// Bottom terminal like an IDE's: tabs, each tab can be split into side-by-side shells. Everything stays mounted
// while hidden so scrollback survives toggling.
export function TerminalPanel({ cwd, visible, send, sink, onHide, onExit }: Props) {
  const seq = useRef(0); // ids for tabs and panes
  const labels = useRef(0);
  const make = (): Tab => ({ id: ++seq.current, label: `Terminal ${++labels.current}`, panes: [`p${++seq.current}`] });
  const [tabs, setTabs] = useState<Tab[]>(() => [make()]);
  const [active, setActive] = useState(() => tabs[0].id);
  const tabsRef = useRef(tabs); // events can arrive faster than renders, so decisions read this, not the closure
  const handlers = useRef(new Map<string, (m: ServerMsg) => void>());
  const [height, setHeight] = useState(() => Number(localStorage.getItem(HEIGHT_KEY)) || 288);

  useEffect(() => {
    sink.current = m => {
      if (m.t === "term" || m.t === "termExit") handlers.current.get(m.id)?.(m);
    };
    return () => {
      sink.current = null;
    };
  }, []);

  const commit = (next: Tab[]) => {
    tabsRef.current = next;
    setTabs(next);
  };
  const add = () => {
    const tab = make();
    commit([...tabsRef.current, tab]);
    setActive(tab.id);
  };
  const split = () => {
    const pane = `p${++seq.current}`;
    commit(tabsRef.current.map(t => (t.id === active && t.panes.length < 4 ? { ...t, panes: [...t.panes, pane] } : t)));
  };
  // Drop one pane, or the whole tab when `pane` is omitted or it was the last one.
  const drop = (tabId: number, pane?: string) => {
    const before = tabsRef.current;
    const next = before.flatMap(t =>
      t.id !== tabId ? [t] : pane && t.panes.length > 1 ? [{ ...t, panes: t.panes.filter(p => p !== pane) }] : [],
    );
    if (next.length === 0) return onExit();
    commit(next);
    if (!next.some(t => t.id === active)) {
      setActive(
        next[
          Math.min(
            before.findIndex(t => t.id === tabId),
            next.length - 1,
          )
        ].id,
      );
    }
  };

  // Drag the top edge to resize; the panes refit through their own ResizeObservers.
  const resize = (e: PointerEvent) => {
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const h0 = height;
    let h = h0;
    const move = (m: PointerEvent) => {
      h = Math.max(MIN_HEIGHT, h0 + y0 - m.clientY);
      setHeight(h);
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      localStorage.setItem(HEIGHT_KEY, String(h));
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  };
  return (
    <div
      class={visible ? "relative flex w-full shrink-0 flex-col border-t border-border-300 bg-bg-000" : "hidden"}
      style={{ height, maxHeight: "calc(100dvh - 10rem)" }} // leaves room for the composer
    >
      <button
        type="button"
        aria-label="Resize terminal"
        title="Drag to resize"
        onPointerDown={resize}
        class="group absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-row-resize touch-none items-center justify-center border-none bg-transparent p-0"
      >
        <span class="flex gap-1 rounded-full bg-bg-000 px-1.5 py-0.5">
          {[0, 1, 2].map(i => (
            <span key={i} class="size-1 rounded-full bg-text-400 group-hover:bg-text-100" />
          ))}
        </span>
      </button>
      <div class="flex h-9 shrink-0 items-stretch border-b border-border-300 bg-bg-100">
        {tabs.map(t => (
          <div
            key={t.id}
            class={`flex items-center gap-2 border-r border-border-300 pl-3 pr-1.5 text-[length:var(--fs-sm)] ${
              t.id === active ? "bg-bg-000 text-text-100" : "text-text-400 hover:text-text-200"
            }`}
          >
            <button
              type="button"
              onClick={() => setActive(t.id)}
              class="flex h-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-inherit"
            >
              <TerminalIcon size={14} aria-hidden="true" />
              {t.label}
            </button>
            <button
              type="button"
              aria-label={`Close ${t.label}`}
              onClick={() => drop(t.id)}
              class="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-inherit hover:bg-bg-300"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
        <div class="ml-auto flex items-center gap-0.5 px-2">
          <button type="button" aria-label="New terminal" title="New terminal" onClick={add} class={iconBtn}>
            <Plus size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Split terminal" title="Split terminal" onClick={split} class={iconBtn}>
            <Columns2 size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Hide terminal" title="Hide terminal" onClick={onHide} class={iconBtn}>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1">
        {tabs.map(t => (
          <div key={t.id} class={t.id === active ? "flex h-full" : "hidden"}>
            {t.panes.map(p => (
              <div key={p} class="h-full min-w-0 flex-1 border-l border-border-200 px-3 pb-2 first:border-l-0">
                <TermPane
                  id={p}
                  cwd={cwd}
                  visible={visible && t.id === active}
                  send={send}
                  handlers={handlers}
                  onExit={() => drop(t.id, p)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
