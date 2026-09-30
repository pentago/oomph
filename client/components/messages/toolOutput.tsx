import { AlertCircle, Maximize2, Minimize2 } from "lucide-react";
import { memo } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { parseAnsi } from "./ansi";
import { CopyButton } from "./CopyButton";
import { Fullscreen } from "./Fullscreen";
import { detectLanguage, useHighlightTokens } from "./highlight";

/** Viewport-relative height cap for tool output. */
export const outputMaxHeight = () => Math.max(120, Math.min(300, Math.floor(window.innerHeight * 0.3)));

export type ToolData = {
  input?: string;
  output?: string;
  error?: string;
  filePath?: string;
  lang: string;
  diff?: DiffRow[];
  notice?: string;
};

export type DiffRow = { kind: "add" | "del" | "ctx"; line?: number; text: string };

// omp's edit details.diff is "+303|text" / "-303|text" / " 294|text"; anything else (e.g. an ellipsis row) is context.
const DISPLAY_DIFF_ROW = /^([+\- ])\s*(\d+)\|(.*)$/;

function parseDisplayDiff(diff: string): DiffRow[] {
  return diff.split("\n").map(row => {
    const m = DISPLAY_DIFF_ROW.exec(row);
    if (!m) return { kind: "ctx", text: row };
    return { kind: m[1] === "+" ? "add" : m[1] === "-" ? "del" : "ctx", line: Number(m[2]), text: m[3] };
  });
}

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const asString = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Header subtitle of a tool row: command, path or pattern. */
export function toolTitle(name: string, args: unknown): string | undefined {
  const a = asRecord(args);
  if (!a) return undefined;
  switch (name) {
    case "bash":
      return asString(a.command);
    case "read":
    case "write":
    case "edit":
    case "ls":
      // omp's hashline edit carries the path in its `[path#TAG]` header instead of a `path` argument.
      return asString(a.path) ?? /^\[(.+?)#[0-9A-Za-z]+\]/.exec(asString(a.input) ?? "")?.[1];
    case "grep":
    case "find": {
      const pattern = asString(a.pattern);
      return pattern && (typeof a.path === "string" ? `${pattern} · ${a.path}` : pattern);
    }
    default:
      return asString(a.description) ?? asString(a.intent) ?? asString(a.i);
  }
}

export function extractToolData(
  name: string,
  args: unknown,
  result: { text: string; isError: boolean; details?: unknown } | undefined,
): ToolData {
  const a = asRecord(args);
  const details = asRecord(result?.details);
  const data: ToolData = { lang: "text" };
  data.filePath =
    asString(details?.filepath) ??
    asString(details?.resolvedPath) ??
    asString(a?.filePath) ??
    asString(a?.path) ??
    asString(details?.path);
  if (name === "bash") data.input = asString(a?.command);
  if (result?.isError) data.error = result.text || "Tool execution failed";
  if (data.filePath) data.lang = detectLanguage(data.filePath);

  const diff = asString(details?.diff);
  if (diff) data.diff = parseDisplayDiff(diff);
  else if (name === "write" && typeof a?.content === "string")
    data.diff = a.content
      .replace(/\n$/, "")
      .split("\n")
      .map((text, i) => ({ kind: "add", line: i + 1, text }));

  if (result && !result.isError && !data.diff && result.text) {
    data.output = result.text;
    const t = result.text.trim();
    if (data.lang === "text" && ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))))
      data.lang = "json";
  }
  return data;
}

function Tokens({ line, tokens }: { line: string; tokens?: { content: string; color?: string }[] }) {
  if (!tokens?.length) return <>{line}</>;
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} style={t.color ? { color: t.color } : undefined}>
          {t.content}
        </span>
      ))}
    </>
  );
}

/** Read-only, syntax highlighted code with a line-number gutter. */
const CodePreview = memo(function CodePreview({
  code,
  language,
  maxHeight,
}: {
  code: string;
  language: string;
  maxHeight?: number;
}) {
  const tokens = useHighlightTokens(code, language, language !== "text");
  const lines = useMemo(() => code.split("\n"), [code]);
  const gutter = Math.max(44, String(lines.length).length * 8 + 28);
  return (
    <div class={`overflow-auto ${maxHeight === undefined ? "h-full" : ""}`} style={{ maxHeight }}>
      <div class="min-w-max font-mono text-[length:var(--fs-code)] leading-6 text-text-100">
        {lines.map((line, i) => (
          <div key={i} class="flex">
            <span
              class={`sticky left-0 z-[3] box-border shrink-0 select-none bg-bg-000 pl-4 pr-3 text-right ${i === 0 ? "text-accent-main-100" : "text-text-400"}`}
              style={{ width: gutter }}
            >
              {i + 1}
            </span>
            <span class="min-h-6 whitespace-pre pr-4">
              <Tokens line={line} tokens={tokens?.[i]} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

function FullscreenButton({ onClick, label = "Fullscreen" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      class="p-0.5 text-text-400 hover:text-text-200 rounded transition-colors"
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
    >
      <Maximize2 size={13} aria-hidden="true" />
    </button>
  );
}

type ContentBlockProps = {
  label: string;
  filePath?: string;
  language: string;
  content: string;
  variant?: "default" | "error";
};

/** A compact (non-collapsible) content block. */
const ContentBlock = memo(function ContentBlock({
  label,
  filePath,
  language,
  content,
  variant = "default",
}: ContentBlockProps) {
  const error = variant === "error";
  const fileName = filePath?.split(/[/\\]/).pop();
  const [full, setFull] = useState(false);
  const hasContent = !!content.trim();
  return (
    <div
      class={`rounded-lg overflow-hidden text-[length:var(--fs-sm)] ${error ? "border border-danger-100/30 bg-danger-100/5" : "bg-bg-000 border border-border-300/20"}`}
    >
      <div
        class={`flex items-center gap-2 px-3 h-8 select-none transition-colors ${error ? "bg-danger-100/8 hover:bg-danger-100/12" : "bg-bg-300/30 hover:bg-bg-300/50"}`}
      >
        <div class="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span
            class={`font-medium font-mono leading-4 whitespace-nowrap ${error ? "text-danger-100" : "text-text-300"}`}
          >
            {label}
          </span>
          {fileName && <span class="text-text-500 truncate font-mono leading-4 min-w-0 flex-1 ml-0.5">{fileName}</span>}
        </div>
        {hasContent && (
          <div class="flex items-center gap-2.5 font-mono shrink-0">
            <FullscreenButton onClick={() => setFull(true)} />
          </div>
        )}
      </div>
      {full && (
        <Fullscreen
          title={fileName || label}
          onClose={() => setFull(false)}
          headerRight={<CopyButton text={content} position="static" />}
        >
          <CodePreview code={content} language={language} />
        </Fullscreen>
      )}
      {hasContent && (
        <div class="relative group/content">
          <CopyButton text={content} groupName="content" />
          <CodePreview code={content} language={language} maxHeight={outputMaxHeight()} />
        </div>
      )}
    </div>
  );
});

const ROW_STYLE = {
  add: { row: "bg-success-100/10", mark: "+", markClass: "text-success-100" },
  del: { row: "bg-danger-100/10", mark: "-", markClass: "text-danger-100" },
  ctx: { row: "", mark: " ", markClass: "" },
} as const;

function DiffRows({ rows, maxHeight }: { rows: DiffRow[]; maxHeight?: number }) {
  const gutter = Math.max(44, String(Math.max(0, ...rows.map(r => r.line ?? 0))).length * 8 + 28);
  return (
    <div class={`overflow-auto ${maxHeight === undefined ? "h-full" : ""}`} style={{ maxHeight }}>
      <div class="min-w-max font-mono text-[length:var(--fs-code)] leading-6 text-text-100">
        {rows.map((row, i) => {
          const s = ROW_STYLE[row.kind];
          return (
            <div key={i} class={`flex ${s.row}`}>
              <span
                class="box-border shrink-0 select-none pl-4 pr-3 text-right text-text-400"
                style={{ width: gutter }}
              >
                {row.line}
              </span>
              <span class={`w-4 shrink-0 select-none ${s.markClass}`}>{s.mark}</span>
              <span class="min-h-6 whitespace-pre pr-4">{row.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact unified diff. */
const DiffBlock = memo(function DiffBlock({ rows, filePath }: { rows: DiffRow[]; filePath?: string }) {
  const additions = rows.filter(r => r.kind === "add").length;
  const deletions = rows.filter(r => r.kind === "del").length;
  const fileName = filePath?.split(/[/\\]/).pop();
  const [full, setFull] = useState(false);
  const stats = (
    <div class="flex items-center gap-1.5 tabular-nums font-medium text-[length:var(--fs-xxs)] font-mono shrink-0">
      {additions > 0 && <span class="text-success-100">+{additions}</span>}
      {deletions > 0 && <span class="text-danger-100">-{deletions}</span>}
    </div>
  );
  return (
    <div class="rounded-lg overflow-hidden text-[length:var(--fs-sm)] bg-bg-000 border border-border-300/20">
      <div class="flex items-center gap-2 px-3 h-8 select-none bg-bg-300/30">
        <div class="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          {fileName && (
            <span class="text-text-300 truncate font-mono leading-4 min-w-0 flex-1 font-medium">{fileName}</span>
          )}
        </div>
        <div class="flex items-center gap-2.5 font-mono shrink-0">
          {stats}
          <FullscreenButton onClick={() => setFull(true)} />
        </div>
      </div>
      {full && (
        <Fullscreen title={fileName ?? "Diff"} onClose={() => setFull(false)} headerRight={stats}>
          <DiffRows rows={rows} />
        </Fullscreen>
      )}
      <DiffRows rows={rows} maxHeight={outputMaxHeight()} />
    </div>
  );
});

/** Compact default renderer: only the result, never the input. */
export function DefaultBody({ data, active }: { data: ToolData; active: boolean }) {
  const hasOutput = !!(data.diff || data.output?.trim());
  if (active && !hasOutput && !data.error) return null;
  return (
    <div class="flex flex-col gap-2">
      {data.error ? (
        <ContentBlock label="Error" language="text" content={data.error} variant="error" />
      ) : data.diff ? (
        <DiffBlock rows={data.diff} filePath={data.filePath} />
      ) : (
        <ContentBlock label="Output" filePath={data.filePath} language={data.lang} content={data.output ?? ""} />
      )}
      {data.notice && (
        <div class="flex items-start gap-1.5 text-[length:var(--fs-xs)] text-warning-100">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span class="break-all">{data.notice}</span>
        </div>
      )}
    </div>
  );
}

function Ansi({ text }: { text: string }) {
  return (
    <>
      {parseAnsi(text).map((seg, i) =>
        seg.fg || seg.bold || seg.dim || seg.italic ? (
          <span
            key={i}
            style={{
              color: seg.fg,
              fontWeight: seg.bold ? 600 : undefined,
              opacity: seg.dim ? 0.6 : undefined,
              fontStyle: seg.italic ? "italic" : undefined,
            }}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function TerminalCursor() {
  return (
    <span
      class="inline-block w-[6px] h-[14px] bg-text-300 rounded-[1px] align-middle ml-px"
      style={{ animation: "terminal-blink 1s step-end infinite" }}
    />
  );
}

type SurfaceProps = { data: ToolData; active: boolean; fullHeight?: boolean; onToggleFullscreen: () => void };

function TerminalSurface({ data, active, fullHeight, onToggleFullscreen }: SurfaceProps) {
  const command = data.input?.trim();
  const output = data.output?.trim();
  const tokens = useHighlightTokens(command ?? "", "bash", !!command);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(false);
  const atBottom = useRef(true);

  // Follow output only while this run is live; a finished tool opened from history starts at the top.
  useEffect(() => {
    if (active) following.current = true;
    const el = scroll.current;
    if (el && following.current && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [active, output, data.error]);

  const Icon = fullHeight ? Minimize2 : Maximize2;
  const label = fullHeight ? "Exit fullscreen" : "Fullscreen";
  return (
    <div
      class={`rounded-lg border border-border-300/20 bg-bg-000 overflow-hidden font-mono text-[length:var(--fs-code)] leading-[1.6] ${fullHeight ? "h-full flex flex-col" : ""}`}
    >
      <div
        ref={scroll}
        onScroll={() => {
          const el = scroll.current;
          if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        class={`px-3 py-2 overflow-y-auto ${fullHeight ? "flex-1 min-h-0" : ""}`}
        style={fullHeight ? undefined : { maxHeight: outputMaxHeight() }}
      >
        <div class="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            onClick={onToggleFullscreen}
            class="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-500 transition-colors hover:bg-bg-200/60 hover:text-text-100"
            title={label}
            aria-label={label}
          >
            <Icon size={12} aria-hidden="true" />
          </button>
        </div>
        {command && (
          <div class="whitespace-pre-wrap break-all">
            <span class="inline-block w-[1ch] text-center text-accent-main-100 select-none font-semibold">$</span>{" "}
            <span class="text-text-100 whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
              {tokens
                ? tokens.map((line, i) => (
                    <span key={i}>
                      <Tokens line="" tokens={line} />
                      {i < tokens.length - 1 ? "\n" : null}
                    </span>
                  ))
                : command}
            </span>
          </div>
        )}
        {active && !output && !data.error && (
          <div class="mt-0.5">
            <TerminalCursor />
          </div>
        )}
        {output && (
          <div class="text-text-300 whitespace-pre-wrap break-all mt-0.5">
            <Ansi text={output ?? ""} />
            {active && <TerminalCursor />}
          </div>
        )}
        {data.error && (
          <div class="text-danger-100 whitespace-pre-wrap break-all mt-0.5">
            <Ansi text={data.error} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Terminal-style bash output: `$ command`, ANSI-coloured output, blinking cursor while running. */
export function BashBody({ data, active }: { data: ToolData; active: boolean }) {
  const [full, setFull] = useState(false);
  if (!active && !data.error && !data.input?.trim() && !data.output?.trim()) return null;
  return (
    <>
      <TerminalSurface data={data} active={active} onToggleFullscreen={() => setFull(true)} />
      {full && (
        <Fullscreen showHeader={false} onClose={() => setFull(false)}>
          <div class="h-full p-4">
            <TerminalSurface data={data} active={active} fullHeight onToggleFullscreen={() => setFull(false)} />
          </div>
        </Fullscreen>
      )}
    </>
  );
}
