import { ArrowDown } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { UiMessage } from "../../../shared";
import type { LiveTool, MessageListProps } from "../props";
import { Spark } from "../Spark";
import { AssistantRow, type AssistantRowProps, NoteRow, UserRow } from "./MessageRows";
import type { ToolMsg } from "./tools";

// Tighter padding when the chat surface is narrower than this.
const COMPACT_WIDTH = 680;
// Distance from the bottom that still counts as "at the bottom".
const AT_BOTTOM_PX = 10;
// Height of the fade above the composer where messages dissolve. The last message rests just above it.
const FADE_PX = 64;
const BOTTOM_SPACER_PX = FADE_PX;

type Item =
  | { kind: "user"; key: string; text: string }
  | { kind: "note"; key: string; text: string }
  | { kind: "assistant"; key: string; props: AssistantRowProps };

const isAssistant = (item?: Item) => item?.kind === "assistant";

// Vertical padding of a row: turn boundaries get 16px, runs of assistant rows pack to 8px.
function rowPadding(item: Item, prev?: Item, next?: Item): string {
  if (item.kind === "user") return "py-4";
  if (isAssistant(prev) && isAssistant(next)) return "py-1";
  if (isAssistant(prev)) return "pt-1 pb-4";
  if (isAssistant(next)) return "pt-4 pb-1";
  return "py-4";
}

// Rebuilt on every delta, so unchanged messages must keep referentially equal props for the row memo checks.
function buildItems(msgs: UiMessage[], liveTools: Record<string, LiveTool>, busy: boolean): Item[] {
  const resultById = new Map<string, ToolMsg>();
  for (const m of msgs) if (m.role === "tool") resultById.set(m.toolCallId, m);

  let lastAssistant = -1;
  msgs.forEach((m, i) => {
    if (m.role === "assistant") lastAssistant = i;
  });

  const items: Item[] = [];
  const turn: { userAt?: number; lastDoneAt?: number; latest?: AssistantRowProps } = {};
  const closeTurn = () => {
    if (turn.latest) {
      turn.latest.latestInTurn = true;
      // Duration of a finished turn: user prompt to the last completed assistant message.
      if (turn.userAt !== undefined && turn.lastDoneAt !== undefined)
        turn.latest.turnDuration = turn.lastDoneAt - turn.userAt;
    }
    turn.latest = undefined;
  };

  msgs.forEach((m, i) => {
    const key = m.id ?? `#${i}`;
    if (m.role === "user") {
      closeTurn();
      turn.userAt = m.timestamp;
      turn.lastDoneAt = undefined;
      items.push({ kind: "user", key, text: m.text });
    } else if (m.role === "note") {
      items.push({ kind: "note", key, text: m.text });
    } else if (m.role === "assistant") {
      const calls = m.parts.filter(p => p.type === "toolCall");
      const isLast = i === lastAssistant;
      const streaming = busy && isLast && m.stopReason === undefined;
      const props: AssistantRowProps = {
        msg: m,
        rowKey: key,
        results: calls.map(c => resultById.get(c.id)),
        lives: calls.map(c => liveTools[c.id]),
        streaming,
        awaitingTools: busy && isLast,
        latestInTurn: false,
      };
      if (!streaming && m.timestamp !== undefined) turn.lastDoneAt = m.timestamp;
      turn.latest = props;
      items.push({ kind: "assistant", key, props });
    }
    // role "tool" messages are rendered inside their assistant's tool cards.
  });
  // The turn in progress has no duration yet; everything before it is finished.
  const openTurn = busy ? turn.latest : undefined;
  if (openTurn) {
    openTurn.latestInTurn = true;
    turn.latest = undefined;
  }
  closeTurn();
  return items;
}

export function MessageList({ msgs, liveTools, busy }: MessageListProps) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTop = useRef(0);
  const firstMsg = useRef<UiMessage | undefined>(undefined);
  const [compact, setCompact] = useState(false);
  const [away, setAway] = useState(false);

  const items = useMemo(() => buildItems(msgs, liveTools, busy), [msgs, liveTools, busy]);

  const follow = (on: boolean) => {
    stick.current = on;
    setAway(!on);
  };
  const toBottom = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // A different chat starts pinned to the bottom; otherwise follow new content only while pinned.
  useLayoutEffect(() => {
    if (msgs[0] !== firstMsg.current) {
      firstMsg.current = msgs[0];
      follow(true);
    }
    if (stick.current) toBottom();
  }, [msgs, liveTools, busy]);

  // Streaming growth and expand/collapse animations resize the content without changing props.
  useLayoutEffect(() => {
    const el = content.current;
    const outer = box.current;
    if (!el || !outer) return;
    const observer = new ResizeObserver(() => {
      if (stick.current) toBottom();
    });
    observer.observe(el);
    const sizer = new ResizeObserver(() => setCompact(outer.clientWidth < COMPACT_WIDTH));
    sizer.observe(outer);
    return () => {
      observer.disconnect();
      sizer.disconnect();
    };
  }, []);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < AT_BOTTOM_PX) {
      if (!stick.current) follow(true);
    } else if (stick.current && el.scrollTop < lastTop.current - 1) {
      follow(false); // scrolled up: stop following
    }
    lastTop.current = el.scrollTop;
  };

  let touchY = 0;
  const pxClass = compact ? "px-3" : "px-5";

  return (
    <div class="relative min-h-0 flex-1">
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: scroll-follow listeners only watch bubbling events; the buttons inside handle input. */}
      <div
        ref={box}
        data-chat-scroll-root="true"
        class="h-full overflow-y-auto overflow-x-hidden contain-content pt-6"
        style={{ overflowAnchor: "none" }}
        onScroll={onScroll}
        onWheel={e => e.deltaY < 0 && stick.current && follow(false)}
        onTouchStart={e => (touchY = e.touches[0]?.clientY ?? 0)}
        onTouchMove={e => (e.touches[0]?.clientY ?? 0) > touchY + 4 && stick.current && follow(false)}
        // Toggling a tool card or thinking block should not drag the view to the bottom.
        onClick={e => e.target instanceof Element && e.target.closest("button") && stick.current && follow(false)}
      >
        <div ref={content}>
          {items.map((item, i) => (
            <div key={item.key} data-message-id={item.key}>
              <div class={`w-full max-w-[44rem] mx-auto ${pxClass} ${rowPadding(item, items[i - 1], items[i + 1])}`}>
                {item.kind === "user" ? (
                  <UserRow text={item.text} />
                ) : item.kind === "note" ? (
                  <NoteRow text={item.text} rowKey={item.key} />
                ) : (
                  <AssistantRow {...item.props} />
                )}
              </div>
            </div>
          ))}
          {busy && items.at(-1)?.kind === "user" && (
            <div class={`w-full max-w-[44rem] mx-auto ${pxClass} py-4`}>
              <Spark size={28} class="animate-spin [animation-duration:3s]" />
            </div>
          )}
        </div>
        <div style={{ height: BOTTOM_SPACER_PX }} aria-hidden="true" />
      </div>
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-bg-100 via-bg-100/70 to-transparent"
        style={{ height: FADE_PX }}
        aria-hidden="true"
      />
      {away && items.length > 0 && (
        <div class="pointer-events-none absolute inset-x-0 bottom-2.5 z-10 flex justify-center">
          <button
            type="button"
            onClick={() => {
              follow(true);
              toBottom();
            }}
            class="h-[32px] w-[32px] min-w-[32px] rounded-full bg-bg-000 border border-border-300/30 flex items-center justify-center text-text-300 hover:text-text-100 hover:bg-bg-300 transition-colors shrink-0 pointer-events-auto"
            aria-label="Scroll to bottom"
          >
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
