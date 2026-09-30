import { memo } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { UiMessage } from "../../../shared";
import { Chevron, Collapse } from "./Collapse";
import { useDisclosure } from "./disclosure";
import { formatDuration, formatToolName } from "./format";
import { BashBody, DefaultBody, extractToolData, type ToolData, toolTitle } from "./toolOutput";
import { summarizeTools, type ToolStatus } from "./toolSummary";

export type ToolMsg = Extract<UiMessage, { role: "tool" }>;
export type Execution = { id: string; name: string; args: unknown; result?: ToolMsg; status: ToolStatus };

/** Tools whose output the user wants to read: they stay open after finishing. */
const READABLE = /bash|\bsh\b|cmd|terminal|shell|write|save|edit|replace|patch|todo|question|ask/i;

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

type Enriched = Execution & { data: ToolData };

type ToolRowProps = { partKey: string; exec: Enriched; streaming: boolean; startedAt?: number };

const ToolRow = memo(function ToolRow({ partKey, exec, streaming, startedAt }: ToolRowProps) {
  const { name, status, data, result } = exec;
  const active = status === "active";
  const error = status === "error";
  const readable = READABLE.test(name);
  const startExpanded = active || (streaming && readable);
  const [expanded, setExpanded] = useDisclosure(`message:${partKey}`, startExpanded);
  const autoExpanded = useRef(startExpanded && readable);
  const now = useNow(active);
  const seenAt = useRef(Date.now());

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (active) {
        if (readable) autoExpanded.current = true;
        setExpanded(true, { touched: false, respectUser: true });
      } else if (!readable) {
        setExpanded(false, { touched: false, respectUser: true });
      } else if (streaming && !autoExpanded.current) {
        autoExpanded.current = true;
        setExpanded(true, { touched: false, respectUser: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [active, readable, streaming, setExpanded]);

  const title = toolTitle(name, exec.args);
  // A tool is timed from its assistant message's completion to its result. Without that stamp, fall back to
  // the tool's own wall time; a running tool counts from when this row first saw it.
  const from = startedAt ?? seenAt.current;
  const wallTime = asRecord(result?.details)?.wallTimeMs;
  const duration = active
    ? Math.max(0, now - from)
    : result && startedAt !== undefined
      ? result.timestamp !== undefined
        ? result.timestamp - startedAt
        : undefined
      : typeof wallTime === "number"
        ? wallTime
        : undefined;
  const additions = data.diff?.filter(r => r.kind === "add").length ?? 0;
  const deletions = data.diff?.filter(r => r.kind === "del").length ?? 0;
  const shimmer = "reasoning-shimmer-text";

  return (
    <div class="group pt-1">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-0 py-1 text-left transition-colors group/header"
        onClick={() => setExpanded(!expanded)}
      >
        <div class="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
          <span
            class={`shrink-0 font-medium text-[length:var(--fs-md)] leading-tight ${active ? shimmer : error ? "text-danger-100" : "text-text-200 group-hover/header:text-text-100"}`}
          >
            {formatToolName(name)}
          </span>
          {title && (
            <span
              class={`min-w-0 truncate font-mono text-[length:var(--fs-code)] ${active ? shimmer : error ? "text-danger-100/80" : "text-text-400"}`}
            >
              {title}
            </span>
          )}
          {!expanded && !active && !error && (additions > 0 || deletions > 0) && (
            <span class="shrink-0 flex items-center gap-1 text-[length:var(--fs-xxs)] font-mono font-medium tabular-nums">
              {additions > 0 && <span class="text-success-100">+{additions}</span>}
              {deletions > 0 && <span class="text-danger-100">-{deletions}</span>}
            </span>
          )}
        </div>
        <div class="ml-auto flex shrink-0 items-center gap-2">
          {duration !== undefined && !error && (
            <span class={`text-[length:var(--fs-xxs)] font-mono tabular-nums ${active ? shimmer : "text-text-500"}`}>
              {formatDuration(duration)}
            </span>
          )}
        </div>
      </button>
      <Collapse open={expanded} contentClass="pt-1">
        {name === "bash" ? <BashBody data={data} active={active} /> : <DefaultBody data={data} active={active} />}
      </Collapse>
    </div>
  );
});

type ToolGroupProps = { groupId: string; startedAt?: number; executions: Execution[]; streaming: boolean };

/** Consecutive tool calls of one assistant message: a "Ran 1 command, read 1 file" header that expands into per-tool rows. */
export const ToolGroup = memo(
  function ToolGroup({ groupId, startedAt, executions, streaming }: ToolGroupProps) {
    const enriched = useMemo<Enriched[]>(
      () => executions.map(e => ({ ...e, data: extractToolData(e.name, e.args, e.result) })),
      [executions],
    );
    const hasActive = executions.some(e => e.status === "active");
    const hasReadable = executions.some(e => READABLE.test(e.name));
    const startExpanded = hasActive || (streaming && hasReadable);
    const [expanded, setExpanded] = useDisclosure(`message:${groupId}:tool-group:${executions[0]?.id}`, startExpanded);
    const autoExpanded = useRef(startExpanded && hasReadable);

    useEffect(() => {
      if (!hasReadable) {
        setExpanded(false, { touched: false, respectUser: true });
      } else if (hasActive) {
        autoExpanded.current = true;
        setExpanded(true, { touched: false, respectUser: true });
      } else if (streaming && !autoExpanded.current) {
        autoExpanded.current = true;
        setExpanded(true, { touched: false, respectUser: true });
      }
    }, [hasActive, hasReadable, streaming, setExpanded]);

    const summary = summarizeTools(executions);
    const totals = enriched.reduce(
      (sum, e) => {
        if (e.status === "error") return sum;
        return {
          additions: sum.additions + (e.data.diff?.filter(r => r.kind === "add").length ?? 0),
          deletions: sum.deletions + (e.data.diff?.filter(r => r.kind === "del").length ?? 0),
        };
      },
      { additions: 0, deletions: 0 },
    );

    return (
      <div class="flex flex-col">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          class="group/tools flex w-full items-center gap-1.5 rounded-lg py-1 text-left transition-colors"
        >
          <span class="text-[length:var(--fs-sm)] leading-5">
            {summary.map((seg, i) => (
              <span
                key={i}
                class={
                  seg.type === "error"
                    ? "text-danger-100"
                    : seg.type === "active"
                      ? "reasoning-shimmer-text"
                      : "text-text-300"
                }
              >
                {seg.text}
              </span>
            ))}
          </span>
          {!hasActive && (totals.additions > 0 || totals.deletions > 0) && (
            <span class="ml-1.5 inline-flex items-center gap-1 text-[length:var(--fs-xxs)] font-mono font-medium tabular-nums">
              {totals.additions > 0 && <span class="text-success-100">+{totals.additions}</span>}
              {totals.deletions > 0 && <span class="text-danger-100">-{totals.deletions}</span>}
            </span>
          )}
          <Chevron open={expanded} size="sm" extra="group-hover/tools:text-text-300" />
        </button>
        <Collapse open={expanded} clip innerClass="flex flex-col min-h-0 min-w-0 overflow-hidden">
          {enriched.map(e => (
            <ToolRow key={e.id} partKey={`${groupId}:${e.id}`} exec={e} streaming={streaming} startedAt={startedAt} />
          ))}
        </Collapse>
      </div>
    );
  },
  (a, b) =>
    a.groupId === b.groupId &&
    a.startedAt === b.startedAt &&
    a.streaming === b.streaming &&
    a.executions.length === b.executions.length &&
    a.executions.every((e, i) => {
      const o = b.executions[i];
      return e.id === o.id && e.status === o.status && e.result === o.result && e.args === o.args;
    }),
);
