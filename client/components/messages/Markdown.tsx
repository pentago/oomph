import DOMPurify from "dompurify";
import { Marked, marked, type Tokens } from "marked";
import morphdom from "morphdom";
import { memo } from "preact/compat";
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { CodeBlock } from "./CodeBlock";
import { CopyButton } from "./CopyButton";

export type MarkdownProps = {
  content: string;
  variant?: "default" | "reasoning";
};

const BLOCK_CONTENT_CLASS = "space-y-4 whitespace-normal [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const ALERTS = {
  NOTE: {
    label: "Note",
    className: "border-accent-secondary-100/35 border-l-accent-secondary-100 bg-accent-secondary-100/10",
    labelClassName: "text-accent-secondary-100",
  },
  TIP: {
    label: "Tip",
    className: "border-success-100/35 border-l-success-100 bg-success-bg/45",
    labelClassName: "text-success-100",
  },
  IMPORTANT: {
    label: "Important",
    className: "border-accent-main-100/35 border-l-accent-main-100 bg-accent-main-100/10",
    labelClassName: "text-accent-main-100",
  },
  WARNING: {
    label: "Warning",
    className: "border-warning-100/35 border-l-warning-100 bg-warning-bg/45",
    labelClassName: "text-warning-100",
  },
  CAUTION: {
    label: "Caution",
    className: "border-danger-100/35 border-l-danger-100 bg-danger-bg/45",
    labelClassName: "text-danger-100",
  },
} as const;

function createMarked(isReasoning: boolean): Marked {
  const md: Marked = new Marked({
    tokenizer: {
      // Only ~~double~~ tildes make strikethrough; a lone ~ stays text (1~2, ~5)
      del(src) {
        const cap = /^~~(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))~~(?=[^~]|$)/.exec(src);
        if (!cap?.[1]) return undefined;
        return { type: "del", raw: cap[0], text: cap[1], tokens: this.lexer.inlineTokens(cap[1]) };
      },
    },
    renderer: {
      heading({ tokens, depth }) {
        const className = isReasoning
          ? "text-[length:var(--fs-sm)] font-semibold text-text-300 mt-2 mb-1 first:mt-0 last:mb-0"
          : depth === 1
            ? "text-[1.25rem] font-bold text-text-100 mt-6 mb-3 first:mt-0 last:mb-0"
            : depth === 2
              ? "text-[1.125rem] font-bold text-text-100 mt-6 mb-2 first:mt-0 last:mb-0"
              : depth === 3
                ? "text-[1.0625rem] font-bold text-text-100 mt-5 mb-2 first:mt-0 last:mb-0"
                : "text-[1.0625rem] font-bold text-text-100 mt-4 mb-2 first:mt-0 last:mb-0";
        const tag = Math.min(depth, 4);
        return `<h${tag} class="${className}">${this.parser.parseInline(tokens)}</h${tag}>`;
      },
      paragraph({ tokens }) {
        const className = isReasoning
          ? "text-[length:var(--fs-sm)] mb-2 last:mb-0 leading-5 text-text-400"
          : "mb-4 last:mb-0 text-text-100";
        return `<p class="${className}">${this.parser.parseInline(tokens)}</p>`;
      },
      codespan({ text }) {
        const className = isReasoning
          ? "font-mono text-accent-main-100 text-[0.9em] align-baseline break-words"
          : "rounded-md border border-border-300/20 bg-bg-300/60 px-1.5 py-px font-mono text-[0.85em] text-danger-100 align-baseline break-words";
        return `<code class="${className}">${escapeHtml(text)}</code>`;
      },
      strong({ tokens }) {
        const className = isReasoning ? "font-semibold text-text-300" : "font-bold text-text-100";
        return `<strong class="${className}">${this.parser.parseInline(tokens)}</strong>`;
      },
      em({ tokens }) {
        const className = isReasoning ? "italic text-text-300" : "italic text-text-100";
        return `<em class="${className}">${this.parser.parseInline(tokens)}</em>`;
      },
      del({ tokens }) {
        const className = isReasoning
          ? "text-[length:var(--fs-sm)] text-text-500 line-through decoration-text-500/50"
          : "text-text-400 line-through decoration-text-400/50";
        return `<del class="${className}">${this.parser.parseInline(tokens)}</del>`;
      },
      link({ href, title, tokens }) {
        const className = isReasoning
          ? "text-[length:var(--fs-sm)] font-medium text-accent-main-200/80 hover:text-accent-main-200 underline underline-offset-2 transition-colors"
          : "text-accent-main-200 hover:text-accent-main-100 underline underline-offset-2 transition-colors";
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(href)}" class="${className}"${titleAttr}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, title, text }) {
        const titleAttr = title || text ? ` title="${escapeHtml(title || text)}"` : "";
        const imgTitleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(href)}" class="inline-block max-w-full align-top"${titleAttr}><img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${imgTitleAttr} loading="eager" decoding="async" class="block max-w-full rounded-md"></a>`;
      },
      blockquote({ tokens, text }) {
        const alertMatch = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i.exec(text);
        if (alertMatch?.[1]) {
          const kind = alertMatch[1].toUpperCase() as keyof typeof ALERTS;
          const alert = ALERTS[kind];
          const body = md.parse(text.slice(alertMatch[0].length), { async: false });
          const spacingClass = isReasoning ? "my-2 px-3 py-2" : "my-4 px-4 py-3";
          return `<aside data-markdown-alert="${kind.toLowerCase()}" class="${spacingClass} first:mt-0 last:mb-0 rounded-md border border-l-4 not-italic ${alert.className}"><p class="mb-1 font-semibold ${alert.labelClassName}">${alert.label}</p><div class="text-text-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">${body}</div></aside>`;
        }
        const className = isReasoning
          ? "border-l-2 border-text-500/30 pl-3 py-0.5 my-2 first:mt-0 last:mb-0 text-text-400"
          : "border-l-2 border-border-300/60 pl-4 py-0.5 my-4 first:mt-0 last:mb-0 text-text-200";
        return `<blockquote class="${className}">${this.parser.parse(tokens)}</blockquote>`;
      },
      list({ ordered, start, items }) {
        const tag = ordered ? "ol" : "ul";
        const className = isReasoning
          ? ordered
            ? "text-[length:var(--fs-sm)] list-decimal list-outside mb-2 last:mb-0 space-y-0.5 marker:text-text-500/60"
            : "text-[length:var(--fs-sm)] list-disc list-outside ml-4 mb-2 last:mb-0 space-y-0.5 marker:text-text-500/60"
          : ordered
            ? "list-decimal list-outside mb-4 last:mb-0 space-y-1.5 marker:text-text-300"
            : "list-disc list-outside ml-5 mb-4 last:mb-0 space-y-1.5 marker:text-text-300";
        const startAttr = ordered && start && start !== 1 ? ` start="${start}"` : "";
        return `<${tag}${startAttr} class="${className}">${items.map(item => this.listitem(item)).join("")}</${tag}>`;
      },
      listitem({ tokens }) {
        const className = isReasoning
          ? "text-[length:var(--fs-sm)] text-text-400 pl-1 leading-5"
          : "text-text-100 pl-1.5";
        return `<li class="${className}">${this.parser.parse(tokens)}</li>`;
      },
      // marked 18 emits the task checkbox as a token inside the item
      checkbox({ checked }) {
        return `<input type="checkbox" ${checked ? "checked" : ""} disabled class="mr-2 align-middle">`;
      },
      hr() {
        const className = isReasoning
          ? "border-border-200/40 my-4 first:mt-0 last:mb-0"
          : "border-border-200/60 my-8 first:mt-0 last:mb-0";
        return `<hr class="${className}">`;
      },
    },
  });
  return md;
}

const renderers = { default: createMarked(false), reasoning: createMarked(true) };

/** Numbered lists reserve enough marker width for their last number. */
function orderedListPadding(list: HTMLOListElement): string {
  const start = parseInt(list.getAttribute("start") ?? "1", 10);
  const end = Math.max(start + Math.max(list.children.length, 1) - 1, start);
  const markerChars = String(Math.abs(end)).length + (end < 0 ? 1 : 0);
  return `${Math.max(3, markerChars + 2)}ch`;
}

function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "button",
      "select",
      "textarea",
      "audio",
      "video",
      "source",
    ],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  });
  const template = document.createElement("template");
  template.innerHTML = clean;
  const { content } = template;
  content.querySelectorAll("a[href]").forEach(anchor => {
    if (anchor.getAttribute("href")?.startsWith("#")) return;
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });
  content.querySelectorAll("ol").forEach(list => {
    list.style.paddingInlineStart = orderedListPadding(list);
  });
  for (const el of content.querySelectorAll("details")) el.classList.add("markdown-html-details");
  for (const el of content.querySelectorAll("summary")) el.classList.add("markdown-html-summary");
  for (const el of content.querySelectorAll("dl")) el.classList.add("markdown-html-definition-list");
  content.querySelectorAll("table").forEach(table => {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-html-table-scroll";
    table.classList.add("markdown-html-table");
    table.before(wrapper);
    wrapper.append(table);
  });
  return template.innerHTML;
}

type StreamBlock =
  | { key: string; kind: "html" | "table"; src: string }
  | { key: string; kind: "code"; src: string; language?: string };

/**
 * Split markdown into top-level blocks with offset-based keys. Blocks before the tail keep
 * identical `src`, so their memo'd components skip re-rendering on every streamed delta.
 */
function splitBlocks(markdown: string): StreamBlock[] {
  const blocks: StreamBlock[] = [];
  const referenceDefinitions: string[] = [];
  let offset = 0;

  // ponytail: re-lexes the whole message per delta (O(n)); an incremental projection would scale
  for (const token of marked.lexer(markdown)) {
    const start = offset;
    offset += token.raw.length;
    if (token.type === "def" && !token.tag.startsWith("^")) {
      referenceDefinitions.push(token.raw);
      continue;
    }
    const last = blocks.at(-1);
    if (!token.raw.trim() && last) {
      if (last.kind !== "code") last.src += token.raw;
      continue;
    }
    if (token.type === "code") {
      blocks.push({
        key: `code:${start}`,
        kind: "code",
        src: token.text,
        language: token.lang?.trim().split(/\s+/, 1)[0] || undefined,
      });
    } else if (token.type === "table") {
      blocks.push({ key: `table:${start}`, kind: "table", src: token.raw });
    } else {
      blocks.push({ key: `html:${start}`, kind: "html", src: token.raw });
    }
  }

  if (!blocks.length) return [{ key: "html:0", kind: "html", src: markdown }];
  if (referenceDefinitions.length) {
    const definitions = referenceDefinitions.join("\n");
    for (const block of blocks) {
      if (block.kind === "html") block.src = `${block.src.replace(/\s+$/, "")}\n\n${definitions}`;
    }
  }
  return blocks;
}

/** Renders parsed HTML into a div Preact never diffs; morphdom keeps unchanged DOM stable while streaming. */
const MarkdownHtmlBlock = memo(function MarkdownHtmlBlock({ src, isReasoning }: { src: string; isReasoning: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const html = sanitizeHtml(renderers[isReasoning ? "reasoning" : "default"].parse(src, { async: false }));
    if (!root.hasChildNodes()) {
      root.innerHTML = html;
      return;
    }
    const next = document.createElement("div");
    next.innerHTML = html;
    morphdom(root, next, { childrenOnly: true, onBeforeElUpdated: (from, to) => !from.isEqualNode(to) });
  }, [src, isReasoning]);

  return <div ref={rootRef} class={BLOCK_CONTENT_CLASS} />;
});

function TableCell({
  text,
  header,
  isReasoning,
  copyText,
}: {
  text: string;
  header: boolean;
  isReasoning: boolean;
  copyText?: string;
}) {
  const html = {
    __html: sanitizeHtml(renderers[isReasoning ? "reasoning" : "default"].parseInline(text, { async: false })),
  };
  if (header) {
    return (
      <th
        class={
          isReasoning
            ? "px-3 py-1.5 text-left text-[length:var(--fs-sm)] font-medium whitespace-nowrap border-b border-border-200/32"
            : "relative px-3 py-2.5 text-left text-[0.9375rem] font-bold whitespace-nowrap border-b border-border-200/38"
        }
        dangerouslySetInnerHTML={copyText ? undefined : html}
      >
        {copyText ? (
          <>
            <span class="block pr-8" dangerouslySetInnerHTML={html} />
            <span class="absolute inset-y-0 right-0 flex items-center px-2">
              <CopyButton
                text={copyText}
                position="static"
                className="!p-1 opacity-0 group-hover/table:opacity-100 group-focus-within/table:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
              />
            </span>
          </>
        ) : undefined}
      </th>
    );
  }
  return (
    <td
      class={
        isReasoning
          ? "px-3 py-1.5 text-[length:var(--fs-sm)] text-text-300 w-max border-b border-border-200/18"
          : "px-3 py-2 text-[0.9375rem] text-text-100 leading-[1.55] w-max border-b border-border-200/14"
      }
      dangerouslySetInnerHTML={html}
    />
  );
}

const MarkdownTable = memo(function MarkdownTable({ src, isReasoning }: { src: string; isReasoning: boolean }) {
  const table = marked.lexer(src).find((token): token is Tokens.Table => token.type === "table");
  if (!table) return null;

  const copyText = [
    `| ${table.header.map(cell => cell.text).join(" | ")} |`,
    `| ${table.header.map(() => "---").join(" | ")} |`,
    ...table.rows.map(row => `| ${row.map(cell => cell.text).join(" | ")} |`),
  ].join("\n");
  const rowClass = isReasoning ? "hover:bg-bg-200/10 transition-colors" : "hover:bg-bg-200/12 transition-colors";

  const body = (
    <>
      <thead class={isReasoning ? "text-text-400" : "text-text-100"}>
        <tr class={rowClass}>
          {table.header.map((cell, i) => (
            <TableCell
              key={i}
              text={cell.text}
              header
              isReasoning={isReasoning}
              copyText={i === table.header.length - 1 && !isReasoning ? copyText : undefined}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={rowIndex} class={rowClass}>
            {row.map((cell, cellIndex) => (
              <TableCell key={cellIndex} text={cell.text} header={false} isReasoning={isReasoning} />
            ))}
          </tr>
        ))}
      </tbody>
    </>
  );

  return (
    <div class="markdown-stream-block">
      <div class={BLOCK_CONTENT_CLASS}>
        {isReasoning ? (
          <div class="overflow-x-auto my-2 first:mt-0 last:mb-0 w-full">
            <table class="min-w-full border-collapse text-[length:var(--fs-sm)]">{body}</table>
          </div>
        ) : (
          <div class="group/table relative my-5 first:mt-0 last:mb-0 rounded-lg border border-border-300/20 w-full">
            <div class="overflow-x-auto">
              <table class="w-full text-[0.9375rem] border-collapse">{body}</table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const MarkdownStreamBlock = memo(function MarkdownStreamBlock({
  block,
  isReasoning,
}: {
  block: StreamBlock;
  isReasoning: boolean;
}) {
  if (block.kind === "table") return <MarkdownTable src={block.src} isReasoning={isReasoning} />;
  if (block.kind === "code") {
    return (
      <div class="markdown-stream-block">
        <div class={BLOCK_CONTENT_CLASS}>
          <div class={isReasoning ? "my-2 first:mt-0 last:mb-0 w-full" : "my-4 first:mt-0 last:mb-0 w-full"}>
            <CodeBlock
              code={block.src}
              language={block.language}
              variant={isReasoning ? "reasoning" : "default"}
              wordwrap={isReasoning}
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="markdown-stream-block">
      <MarkdownHtmlBlock src={block.src} isReasoning={isReasoning} />
    </div>
  );
});

export const Markdown = memo(function Markdown({ content, variant = "default" }: MarkdownProps) {
  const isReasoning = variant === "reasoning";
  const blocks = useMemo(() => splitBlocks(content), [content]);

  return (
    <div
      class={`markdown-content ${isReasoning ? "text-[length:var(--fs-sm)] leading-5 text-text-400" : "font-[family-name:var(--font-chat)] text-[1.0625rem] leading-[1.65] text-text-100"} break-words min-w-0 overflow-hidden`}
    >
      {blocks.map(block => (
        <MarkdownStreamBlock key={block.key} block={block} isReasoning={isReasoning} />
      ))}
    </div>
  );
});
