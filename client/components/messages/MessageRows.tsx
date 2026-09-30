import { AlertCircle } from "lucide-react";
import { memo } from "preact/compat";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { UiMessage, UiPart } from "../../../shared";
import type { LiveTool } from "../props";
import { Spark } from "../Spark";
import { Chevron, Collapse } from "./Collapse";
import { CopyButton } from "./CopyButton";
import { useDisclosure } from "./disclosure";
import { formatDuration } from "./format";
import { Markdown } from "./Markdown";
import { Reasoning } from "./Reasoning";
import type { ToolStatus } from "./toolSummary";
import { type Execution, ToolGroup, type ToolMsg } from "./tools";

// Copy/action bars show on hover for mouse users and always for touch.
const ACTION_BAR =
  "flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:pointer-events-auto transition-opacity";

const PREVIEW_LINES = 8;
const LEADING_RELAXED = 1.625;

function UserBubble({ text }: { text: string }) {
  const content = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const measure = () => {
      const base = Number.parseFloat(getComputedStyle(el).getPropertyValue("--fs-lg"));
      if (Number.isFinite(base) && base > 0) setOverflow(el.scrollHeight > base * LEADING_RELAXED * PREVIEW_LINES + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [text]);

  const collapsed = !expanded;
  return (
    <div class="px-4 py-2.5 bg-bg-300 rounded-2xl max-w-[85%]">
      <div class="relative">
        <div
          ref={content}
          class={`m-0 break-words text-[length:var(--fs-lg)] text-text-100 leading-relaxed whitespace-pre-wrap${collapsed ? " overflow-hidden" : ""}`}
          style={
            collapsed
              ? { maxHeight: `calc(var(--fs-lg) * ${LEADING_RELAXED} * ${PREVIEW_LINES})`, contain: "layout paint" }
              : undefined
          }
        >
          {text}
        </div>
        {overflow && collapsed && (
          <div class="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-bg-300 to-transparent pointer-events-none" />
        )}
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          class="mt-1 text-[length:var(--fs-sm)] text-text-400 hover:text-text-200 transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export const UserRow = memo(function UserRow({ text }: { text: string }) {
  return (
    <div class="flex flex-col items-end group">
      <div class="flex flex-col gap-1 items-end w-full">
        {text && <UserBubble text={text} />}
        <div class={ACTION_BAR}>{text && <CopyButton text={text} position="static" />}</div>
      </div>
    </div>
  );
});

type ErrorProps = { title: string; description: string; severity: "error" | "warning"; stateKey: string };

const MessageError = memo(function MessageError({ title, description, severity, stateKey }: ErrorProps) {
  const [expanded, setExpanded] = useDisclosure(stateKey, false);
  const color = severity === "error" ? "text-danger-100" : "text-warning-100";
  const border = severity === "error" ? "border-danger-100/20" : "border-warning-100/20";
  return (
    <div class={`px-3 py-2 rounded-xl border ${border} bg-bg-000`}>
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <AlertCircle size={16} aria-hidden="true" className={`w-4 h-4 ${color} flex-shrink-0`} />
        <span class={`text-[length:var(--fs-md)] ${color} flex-1 min-w-0 truncate`}>{title}</span>
        <Chevron open={expanded} />
      </button>
      <Collapse open={expanded} variant="fade" innerClass="overflow-hidden">
        <div class={`mt-2 pt-2 space-y-1.5 border-t ${border}`}>
          <p class="text-[length:var(--fs-sm)] text-text-300 break-words">{description}</p>
        </div>
      </Collapse>
    </div>
  );
});

type AssistantMsg = Extract<UiMessage, { role: "assistant" }>;

export type AssistantRowProps = {
  msg: AssistantMsg;
  rowKey: string;
  results: (ToolMsg | undefined)[]; // aligned with the toolCall parts of `msg`
  lives: (LiveTool | undefined)[]; // aligned with the toolCall parts of `msg`
  streaming: boolean; // this message's text is still arriving
  awaitingTools: boolean; // last assistant message of a busy chat: unresolved tools are running
  turnDuration?: number; // set on the last assistant message of a finished turn
  latestInTurn: boolean;
};

type Block = { type: "part"; part: UiPart; index: number } | { type: "tools"; executions: Execution[]; first: number };

function toolStatus(result: ToolMsg | undefined, live: LiveTool | undefined, awaiting: boolean): ToolStatus {
  if (result) return result.isError ? "error" : "done";
  if (live) return live.status === "running" ? "active" : live.status === "error" ? "error" : "done";
  return awaiting ? "active" : "done";
}

/** Consecutive tool calls merge into one group; text and thinking stay individual blocks. */
function groupBlocks(props: AssistantRowProps): Block[] {
  const blocks: Block[] = [];
  let toolIndex = 0;
  props.msg.parts.forEach((part, index) => {
    if (part.type !== "toolCall") {
      blocks.push({ type: "part", part, index });
      return;
    }
    const i = toolIndex++;
    const result = props.results[i];
    const exec: Execution = {
      id: part.id,
      name: part.name,
      args: part.args,
      result,
      status: toolStatus(result, props.lives[i], props.awaitingTools),
    };
    const last = blocks[blocks.length - 1];
    if (last?.type === "tools") last.executions.push(exec);
    else blocks.push({ type: "tools", executions: [exec], first: index });
  });
  return blocks;
}

function assistantError(
  msg: AssistantMsg,
): { title: string; description: string; severity: "error" | "warning" } | undefined {
  if (msg.stopReason === "error")
    return { title: "Error", description: msg.errorMessage ?? "An unknown error occurred.", severity: "error" };
  if (msg.stopReason === "aborted")
    return { title: "Message Aborted", description: msg.errorMessage ?? "Message Aborted", severity: "warning" };
  return undefined;
}

// The server may report when the message finished (its entry timestamp); `timestamp` is when it started.
const completedAt = (msg: AssistantMsg): number | undefined =>
  "completedAt" in msg && typeof msg.completedAt === "number" ? msg.completedAt : undefined;

const sameArray = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export const AssistantRow = memo(
  function AssistantRow(props: AssistantRowProps) {
    const { msg, rowKey, streaming, turnDuration, latestInTurn } = props;
    const blocks = groupBlocks(props);
    const error = assistantError(msg);
    const fullText = msg.parts.map(p => (p.type === "text" ? p.text : "")).join("");
    const errorView = error && <MessageError {...error} stateKey={`message:${rowKey}:error`} />;

    if (msg.parts.length === 0) return errorView ? <div class="flex flex-col gap-2 w-full">{errorView}</div> : null;

    return (
      <div class="flex flex-col gap-2 w-full group">
        <div class="flex flex-col gap-2">
          {blocks.map(block => {
            if (block.type === "tools") {
              return (
                <ToolGroup
                  key={`${rowKey}:tg:${block.first}`}
                  groupId={rowKey}
                  startedAt={completedAt(msg)}
                  executions={block.executions}
                  streaming={streaming}
                />
              );
            }
            const { part, index } = block;
            if (part.type === "text") {
              if (!part.text.trim() && !streaming) return null;
              return (
                <div key={`${rowKey}:${index}`} style={{ contain: "layout" }}>
                  <Markdown content={part.text} />
                </div>
              );
            }
            if (part.type === "thinking") {
              // A thinking block is finished once anything follows it.
              return (
                <Reasoning
                  key={`${rowKey}:${index}`}
                  text={part.text}
                  partKey={`${rowKey}:${index}`}
                  streaming={streaming && index === msg.parts.length - 1}
                />
              );
            }
            return null;
          })}
        </div>
        {errorView}
        {!streaming && turnDuration !== undefined && turnDuration > 0 && (
          <div class="flex items-center gap-3 text-[length:var(--fs-xs)] text-text-400">
            <span>{formatDuration(turnDuration)} total</span>
          </div>
        )}
        {latestInTurn && !streaming && fullText.trim() && (
          <div class="-ml-1.5 flex items-center gap-1">
            <CopyButton text={fullText} position="static" />
          </div>
        )}
        {latestInTurn && (
          <Spark size={28} class={`mt-3 ${props.awaitingTools ? "animate-spin [animation-duration:3s]" : ""}`} />
        )}
      </div>
    );
  },
  (a, b) =>
    a.msg === b.msg &&
    a.rowKey === b.rowKey &&
    a.streaming === b.streaming &&
    a.awaitingTools === b.awaitingTools &&
    a.turnDuration === b.turnDuration &&
    a.latestInTurn === b.latestInTurn &&
    sameArray(a.results, b.results) &&
    sameArray(a.lives, b.lives),
);

/** Advisor notes are plain markdown; runtime errors reported by the app get the error block. */
export const NoteRow = memo(function NoteRow({ text, rowKey }: { text: string; rowKey: string }) {
  if (text.startsWith("error: ")) {
    return (
      <MessageError
        title="Error"
        description={text.slice("error: ".length)}
        severity="error"
        stateKey={`message:${rowKey}:error`}
      />
    );
  }
  return <Markdown content={text} />;
});
