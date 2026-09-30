import { ArrowUp, Check, FileText, Plus, Sparkles, Square, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "react-dom";
import type { UiImage } from "../../shared";
import { ModelSelector } from "./ModelSelector";
import type { ComposerProps } from "./props";

const label = (level: string) => level.charAt(0).toUpperCase() + level.slice(1);

// Composer attachments (the + button): images go to the model as real image content, anything else is
// stored by the server and delivered as a path line the agent reads with its own tools.
type ImageAtt = { kind: "image"; id: number; name: string; data: string; mimeType: string; url: string };
type FileAtt = { kind: "file"; id: number; name: string; path?: string; error?: boolean };
type Att = ImageAtt | FileAtt;

export function Composer({
  state,
  models,
  commands,
  defaultModel,
  busy,
  disabled,
  onActivate,
  onSend,
  onAbort,
  onSetThinking,
  onRequestModels,
  onSetModel,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const seqId = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 0, bottom: 0 });
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const levels = state?.thinkingLevels ?? [];
  const current = state?.thinkingLevel;
  // Sending is blocked while an upload is in flight; a failed upload stays as a removable chip.
  const ready = atts.some(a => a.kind === "image" || a.path);
  const uploading = atts.some(a => a.kind === "file" && !a.path && !a.error);
  const canSend = !uploading && (text.trim().length > 0 || ready);

  // Slash-command menu: only while typing the command word itself (starts with "/" and no space yet).
  const query = text.startsWith("/") && !text.includes(" ") ? text.slice(1).toLowerCase() : null;
  const [sel, setSel] = useState(0);
  const [dismissed, setDismissed] = useState(false); // Escape closes until the text changes
  useEffect(() => setDismissed(false), [query]);
  const matches = query === null || dismissed ? [] : commands.filter(c => c.name.toLowerCase().includes(query));
  const highlighted = Math.min(sel, matches.length - 1);
  const itemRef = useRef<HTMLButtonElement>(null);
  // Scroll the highlighted item into view only when the highlight moves. A plain ref callback
  // re-fires on every render (15 s session poll, WS events) and resets the user's scroll position.
  useEffect(() => itemRef.current?.scrollIntoView({ block: "nearest" }), [highlighted, query]);
  const complete = (name: string) => {
    setText(`/${name} `);
    areaRef.current?.focus();
  };

  const dataUrl = (f: File) =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error ?? new Error("read failed"));
      r.readAsDataURL(f);
    });
  // Phone photos are 3-8 MB, too heavy for one websocket frame: redraw through a canvas into a ~1568 px
  // JPEG. Formats the browser can't decode (HEIC on some phones) fall through to the file-upload path.
  const toImage = async (f: File) => {
    try {
      if (f.size <= 300 * 1024) {
        const url = await dataUrl(f);
        return { name: f.name, data: url.slice(url.indexOf(",") + 1), mimeType: f.type || "image/png", url };
      }
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.85);
      return { name: f.name, data: url.slice(url.indexOf(",") + 1), mimeType: "image/jpeg", url };
    } catch {
      return undefined;
    }
  };
  const attach = async (f: File) => {
    const id = ++seqId.current;
    const image = f.type.startsWith("image/") ? await toImage(f) : undefined;
    if (image) {
      setAtts(a => [...a, { kind: "image", id, ...image }]);
      return;
    }
    setAtts(a => [...a, { kind: "file", id, name: f.name }]);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/upload", { method: "POST", body: fd });
      const parsed: unknown = await r.json().catch(() => undefined);
      const path =
        typeof parsed === "object" && parsed !== null && "path" in parsed && typeof parsed.path === "string"
          ? parsed.path
          : undefined;
      if (!r.ok || !path) throw new Error("upload rejected");
      setAtts(a => a.map(x => (x.id === id ? { ...x, path } : x)));
    } catch {
      setAtts(a => a.map(x => (x.id === id ? { ...x, error: true } : x)));
    }
  };
  const addFiles = (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) void attach(f);
    if (fileRef.current) fileRef.current.value = ""; // picking the same file twice must still fire
  };
  // Without an open chat the composer still accepts text: focusing it starts a new chat, and a send
  // before that chat is open just keeps the text (the next one goes through).
  const send = () => {
    if (!canSend) return;
    if (disabled) {
      onActivate();
      return;
    }
    // Images ride along as real image content; files become path lines the agent reads with its tools.
    const images: UiImage[] = [];
    const lines = [text.trim()];
    for (const a of atts) {
      if (a.kind === "image") {
        images.push({ type: "image", data: a.data, mimeType: a.mimeType });
        lines.push(`[Image: ${a.name}]`);
      } else if (a.path) lines.push(`Attached file: ${a.path}`);
    }
    onSend(lines.filter(Boolean).join("\n"), images.length ? images : undefined);
    setText("");
    setAtts([]);
  };

  // Auto-grow the textarea (max height is enforced in composer.css).
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Lift the dock above the on-screen keyboard via visualViewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const inset = window.innerHeight - vv.height - vv.offsetTop;
      root.style.setProperty("--keyboard-inset-bottom", `${inset >= 100 ? Math.round(inset) : 0}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.setProperty("--keyboard-inset-bottom", "0px");
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    setMenuOpen(o => !o);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // IME safety: never treat the Enter that confirms a composition as "send".
    if (composing.current || e.isComposing || e.keyCode === 229) return;
    if (matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((highlighted + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        complete(matches[highlighted].name);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
      }
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <footer class="oomph-composer w-full shrink-0">
      <div class="mx-auto max-w-[54rem] px-2 md:px-4">
        <div
          class={`relative rounded-[1.25rem] border bg-bg-000 shadow-sm focus-within:outline-none ${
            busy ? "animate-border-pulse border-accent-main-100" : "border-border-300"
          }`}
        >
          <div class="pt-5">
            {matches.length > 0 && (
              <div class="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border-200/60 bg-bg-000 shadow-lg">
                {matches.map((c, i) => (
                  <button
                    key={c.name}
                    ref={i === highlighted ? itemRef : null}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => complete(c.name)}
                    onMouseEnter={() => setSel(i)}
                    class={`flex w-full items-baseline gap-3 px-3 py-2 text-left ${
                      i === highlighted ? "bg-bg-300/50" : ""
                    }`}
                  >
                    <span class="shrink-0 font-mono text-[length:var(--fs-sm)] text-text-100">/{c.name}</span>
                    <span class="truncate text-[length:var(--fs-xs)] text-text-400">{c.description}</span>
                  </button>
                ))}
              </div>
            )}
            {atts.length > 0 && (
              <div class="flex flex-wrap gap-2 px-4 pb-2">
                {atts.map(a => (
                  <span
                    key={a.id}
                    class="inline-flex items-center gap-1.5 rounded-lg border border-border-200 bg-bg-000 py-1 pl-1.5 pr-1 text-[length:var(--fs-xs)] text-text-200"
                  >
                    {a.kind === "image" ? (
                      <img src={a.url} alt="" class="h-7 w-7 shrink-0 rounded-md object-cover" />
                    ) : (
                      <FileText size={16} class="shrink-0 text-text-400" aria-hidden="true" />
                    )}
                    <span class="max-w-32 truncate">{a.name}</span>
                    {a.kind === "file" && a.error && <span class="shrink-0 text-danger-100">failed</span>}
                    {a.kind === "file" && !a.path && !a.error && (
                      <span class="shrink-0 animate-pulse text-text-400">uploading…</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => setAtts(x => x.filter(y => y.id !== a.id))}
                      class="shrink-0 cursor-pointer rounded-md p-0.5 text-text-400 transition-colors hover:text-text-100"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={areaRef}
              rows={1}
              value={text}
              placeholder="Write a message..."
              class="w-full resize-none bg-transparent px-4 pb-1.5 text-[1.125rem] leading-relaxed text-text-100 placeholder:text-text-300 focus:outline-none focus:ring-0"
              onFocus={() => disabled && onActivate()}
              onInput={e => setText((e.target as HTMLTextAreaElement).value)}
              onKeyDown={onKeyDown}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={() => (composing.current = false)}
            />
          </div>
          <div class="relative flex items-center gap-1 px-3 pb-3 pt-1.5">
            <button
              type="button"
              aria-label="Attach files or images"
              title="Attach files or images"
              onClick={() => fileRef.current?.click()}
              class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              class="hidden"
              onChange={e => addFiles((e.target as HTMLInputElement).files)}
            />
            <ModelSelector
              models={models}
              selected={state?.model ?? defaultModel}
              disabled={disabled}
              onOpen={onRequestModels}
              onSelect={onSetModel}
            />
            {levels.length > 0 && (
              <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={disabled}
                title={current ? label(current) : "Thinking"}
                onClick={toggleMenu}
                class="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-lg px-2 text-[length:var(--fs-sm)] text-text-400 transition-colors hover:bg-bg-200 hover:text-text-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {current ? label(current) : "Default"}
              </button>
            )}
            {!canSend && busy ? (
              <button
                type="button"
                aria-label="Stop generation"
                onClick={onAbort}
                class="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-main-000 text-oncolor-100 transition-all duration-150 hover:bg-accent-main-200 active:scale-90"
              >
                <Square size={14} fill="currentColor" stroke-width={0} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send message"
                disabled={!canSend}
                onClick={send}
                class="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-main-000 text-oncolor-100 transition-all duration-150 hover:bg-accent-main-200 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div class="h-4" aria-hidden="true" />
      {menuOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ left: menuPos.left, bottom: menuPos.bottom }}
            class="glass fixed z-[100] min-w-[8rem] max-w-[min(320px,90vw)] rounded-xl border border-border-200/60 p-1"
          >
            {levels.map(level => (
              <button
                key={level}
                type="button"
                role="menuitemradio"
                aria-checked={level === current}
                onClick={() => {
                  onSetThinking(level);
                  setMenuOpen(false);
                  areaRef.current?.focus();
                }}
                class="flex w-full cursor-pointer select-none items-start gap-2 rounded-lg border-none bg-transparent px-2 py-2 text-left transition-colors hover:bg-bg-300"
              >
                <span class="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center text-text-400">
                  <Sparkles size={16} aria-hidden="true" />
                </span>
                <span
                  class={`min-w-0 flex-1 text-[length:var(--fs-base)] ${level === current ? "text-text-100" : "text-text-200"}`}
                >
                  {label(level)}
                </span>
                {level === current && (
                  <span class="mt-0.5 flex-shrink-0 text-accent-secondary-100">
                    <Check size={16} aria-hidden="true" />
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </footer>
  );
}
