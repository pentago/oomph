import { memo } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { CopyButton } from "./CopyButton";
import { useHighlightTokens } from "./highlight";

/** Languages that carry no useful information — hide the label */
const HIDDEN_LANGS: Record<string, true> = { text: true, plain: true, txt: true, plaintext: true };

export type CodeBlockProps = {
  code: string;
  language?: string;
  /** 'default' shows chrome (label + copy), 'reasoning' is minimal */
  variant?: "default" | "reasoning";
  wordwrap?: boolean;
};

export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  variant = "default",
  wordwrap = false,
}: CodeBlockProps) {
  const isReasoning = variant === "reasoning";

  // Highlight lazily once the block is (nearly) in view
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setInView(true), {
      rootMargin: "200px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView]);

  // Auto-detect tree structure if language is missing or text
  const effectiveLanguage =
    language && language !== "text"
      ? language
      : code.includes("├──") || code.includes("└──") || (code.includes("│") && code.includes("──"))
        ? "yaml"
        : language || "text";
  const tokens = useHighlightTokens(code, effectiveLanguage, inView);

  const showLabel = !isReasoning && language && !HIDDEN_LANGS[language.toLowerCase()];

  const scrollClasses = wordwrap ? "overflow-y-auto overflow-x-hidden select-text" : "overflow-auto select-text";

  // Padding: reasoning is tighter; default reserves top for label row and right for copy button
  const contentPad = isReasoning ? "p-3" : showLabel ? "pt-0 pb-3.5 px-4" : "p-4";
  const fontSize = isReasoning ? "text-[length:var(--fs-sm)]" : "text-[length:var(--fs-md)]";
  const lineHeight = isReasoning ? "leading-5" : "leading-6";
  const textColor = isReasoning ? "text-text-300" : "text-text-200";
  const wrap = wordwrap ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]" : "whitespace-pre";

  const content = tokens ? (
    <pre class={`shiki-wrapper m-0 font-mono select-text ${textColor} ${fontSize} ${lineHeight} ${contentPad} ${wrap}`}>
      <code class="font-mono select-text">
        {tokens.map((line, lineIndex) => (
          <span key={lineIndex}>
            {line.map((token, tokenIndex) => (
              <span key={tokenIndex} style={token.color ? { color: token.color } : undefined}>
                {token.content}
              </span>
            ))}
            {lineIndex < tokens.length - 1 ? "\n" : null}
          </span>
        ))}
      </code>
    </pre>
  ) : (
    <pre
      class={`${contentPad} m-0 font-mono select-text ${textColor} ${fontSize} ${lineHeight} ${wordwrap ? wrap : ""}`}
    >
      <code>{code}</code>
    </pre>
  );
  if (isReasoning) {
    return (
      <div ref={ref} class="rounded-md overflow-hidden bg-bg-000 contain-content">
        <div class={scrollClasses}>{content}</div>
      </div>
    );
  }
  return (
    <div
      ref={ref}
      class="group/code relative rounded-xl overflow-hidden border border-border-300/15 bg-bg-000 w-full max-w-full flex flex-col contain-content"
    >
      {showLabel ? (
        <div class="flex min-h-10 items-start justify-between pl-4 pr-0 pt-2 pb-0">
          <div class="flex h-8 min-w-0 items-center text-[length:var(--fs-xs)] leading-none text-text-400 select-none">
            <span class="truncate">{language}</span>
          </div>
          <div class="inline-flex h-8 shrink-0 items-center gap-0.5 pr-2 ">
            <CopyButton text={code} position="static" className="!h-8 !w-8 !p-2" />
          </div>
        </div>
      ) : (
        <div class="absolute top-2 right-2 z-10 opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
          <CopyButton text={code} position="static" className="!h-8 !w-8 !p-2 rounded-md bg-bg-300/70" />
        </div>
      )}

      {/* Scrollable content */}
      <div class={scrollClasses}>{content}</div>
    </div>
  );
});
