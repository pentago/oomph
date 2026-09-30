import { memo } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Chevron, Collapse } from "./Collapse";
import { useDisclosure } from "./disclosure";
import { Markdown } from "./Markdown";

// A single collapsed line of markdown: flatten block elements inline so text-ellipsis applies.
const COLLAPSED_MARKDOWN = [
  "h-5 max-h-5 overflow-hidden whitespace-nowrap text-ellipsis",
  "[&_.markdown-stream-block]:!my-0 [&_.markdown-stream-block]:inline",
  "[&_p]:!my-0 [&_p]:inline",
  "[&_h1]:!my-0 [&_h1]:inline [&_h2]:!my-0 [&_h2]:inline [&_h3]:!my-0 [&_h3]:inline",
  "[&_ul]:!my-0 [&_ol]:!my-0 [&_li]:inline [&_li]:!my-0",
  "[&_pre]:!my-0 [&_pre]:inline",
  "[&_code]:inline",
  "[&_blockquote]:!my-0 [&_blockquote]:inline",
  "[&_br]:hidden",
].join(" ");

type ReasoningProps = { text: string; partKey: string; streaming: boolean };

export const Reasoning = memo(function Reasoning({ text, partKey, streaming }: ReasoningProps) {
  const hasContent = !!text.trim();
  const [expanded, setExpanded] = useDisclosure(`message:reasoning:${partKey}`, false);
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  const summary = useMemo(() => text.replace(/\s+/g, " ").trim(), [text]);
  // Collapsed markdown shows only the first line so the ellipsis is not cut mid-paragraph.
  const firstLine = useMemo(() => (text.split(/\r?\n/, 1)[0] ?? "").trim() || summary, [text, summary]);
  const summaryText = summary || (streaming ? "Thinking..." : "");
  const hasLineBreak = /[\r\n]/.test(text);

  useEffect(() => {
    // Streaming reasoning opens itself; finishing collapses it again. A manual toggle wins over both.
    const frame = requestAnimationFrame(() => {
      if (streaming && hasContent) setExpanded(true, { touched: false, respectUser: true });
      else if (!streaming) setExpanded(false, { touched: false, respectUser: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [streaming, hasContent, setExpanded]);

  useEffect(() => {
    const check = () => {
      if (container.current && measure.current)
        setOverflow(measure.current.scrollWidth - container.current.clientWidth > 1);
    };
    check();
    const observer = new ResizeObserver(check);
    if (container.current) observer.observe(container.current);
    document.fonts?.ready.then(check);
    return () => observer.disconnect();
  }, [summaryText]);

  if (!hasContent) return null;

  const measurer = (
    <span
      ref={measure}
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 invisible whitespace-nowrap text-[length:var(--fs-sm)] leading-5"
    >
      {summaryText}
    </span>
  );

  if (!(streaming || hasLineBreak || overflow)) {
    return (
      <div>
        <div ref={container} class="relative min-w-0 overflow-hidden py-1 text-[length:var(--fs-sm)]">
          <Markdown content={text} variant="reasoning" />
          {measurer}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div class="flex flex-col">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          class="group/reasoning flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1 m-0 border-0 bg-transparent text-left cursor-pointer text-text-400 hover:text-text-200 transition-colors"
        >
          <div ref={container} class="relative min-w-0 flex-1 overflow-hidden">
            <span class="relative block min-w-0 max-w-full">
              {expanded ? (
                <span
                  class={`inline-block text-[length:var(--fs-sm)] leading-5 ${streaming ? "reasoning-shimmer-text" : "text-text-400"}`}
                >
                  {streaming ? "Thinking..." : "Thought"}
                </span>
              ) : (
                <div
                  class={`min-w-0 text-[length:var(--fs-sm)] leading-5 ${COLLAPSED_MARKDOWN} ${streaming ? "text-text-200" : "text-text-300"}`}
                >
                  <Markdown content={firstLine} variant="reasoning" />
                </div>
              )}
            </span>
            {measurer}
          </div>
          <Chevron open={expanded} size="sm" extra="group-hover/reasoning:text-text-300" />
        </button>
        <Collapse open={expanded} clip>
          <div class="pt-1 text-[length:var(--fs-sm)]">
            <Markdown content={text} variant="reasoning" />
          </div>
        </Collapse>
      </div>
      <span class="sr-only" role="status" aria-live="polite">
        {summaryText}
      </span>
    </div>
  );
});
