import { useSyncExternalStore } from "preact/compat";
import { useEffect, useMemo, useState } from "preact/hooks";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import c from "shiki/langs/c.mjs";
import css from "shiki/langs/css.mjs";
import diff from "shiki/langs/diff.mjs";
import dockerfile from "shiki/langs/dockerfile.mjs";
import go from "shiki/langs/go.mjs";
import html from "shiki/langs/html.mjs";
import java from "shiki/langs/java.mjs";
import json from "shiki/langs/json.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import sql from "shiki/langs/sql.mjs";
import toml from "shiki/langs/toml.mjs";
import tsx from "shiki/langs/tsx.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubDark from "shiki/themes/github-dark-default.mjs";
import githubLight from "shiki/themes/github-light-default.mjs";

export type HighlightTokens = { content: string; color?: string }[][];

const THEME_LIGHT = "github-light-default";
const THEME_DARK = "github-dark-default";
// ponytail: highlighting runs synchronously on the main thread (a worker would unblock it); skip huge blocks
const MAX_HIGHLIGHT_CHARS = 100_000;
// ponytail: cpp/typescript/javascript/jsx grammars cost ~1.2MB in the single-file bundle; the
// tsx grammar covers the whole JS/TS family and c covers C++ approximately. Add grammars if this matters.
const LANGUAGE_FALLBACKS: Record<string, string> = {
  golang: "go",
  ts: "tsx",
  typescript: "tsx",
  js: "tsx",
  javascript: "tsx",
  jsx: "tsx",
  mjs: "tsx",
  cjs: "tsx",
  cpp: "c",
  "c++": "c",
  cc: "c",
  cxx: "c",
  h: "c",
  hpp: "c",
};

let highlighterPromise: Promise<HighlighterCore> | undefined;

/** Created lazily on the first code block so shiki never blocks first paint. */
function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [bash, c, css, diff, dockerfile, go, html, java, json, markdown, python, rust, sql, toml, tsx, yaml],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

/** Mode detection matches theme.ts: `data-mode` on <html>, falling back to the system preference. */
function getIsDark(): boolean {
  const mode = document.documentElement.getAttribute("data-mode");
  if (mode === "light") return false;
  if (mode === "dark") return true;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeIsDark(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function tokenize(
  highlighter: HighlighterCore,
  code: string,
  language: string,
  isDark: boolean,
): HighlightTokens | null {
  const lang = LANGUAGE_FALLBACKS[language.toLowerCase()] ?? language.toLowerCase();
  if (code.length > MAX_HIGHLIGHT_CHARS || !highlighter.getLoadedLanguages().includes(lang)) return null;
  return highlighter.codeToTokensBase(code, { lang, theme: isDark ? THEME_DARK : THEME_LIGHT });
}

/** Tokens for `code`, or null while shiki is loading, disabled, or the language is unknown. */
export function useHighlightTokens(code: string, language: string, enabled: boolean): HighlightTokens | null {
  const isDark = useSyncExternalStore(subscribeIsDark, getIsDark);
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    if (enabled && !highlighter) void loadHighlighter().then(setHighlighter);
  }, [enabled, highlighter]);

  return useMemo(
    () => (enabled && highlighter ? tokenize(highlighter, code, language, isDark) : null),
    [code, language, enabled, highlighter, isDark],
  );
}

const FILE_NAME_LANGUAGES: Record<string, string> = {
  dockerfile: "dockerfile",
  ".yarnrc": "yaml",
  ".prettierrc": "json",
  ".eslintrc": "json",
  "package.json": "json",
  "composer.json": "json",
  "cargo.toml": "toml",
  "pyproject.toml": "toml",
};

const EXTENSION_LANGUAGES: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  html: "html",
  css: "css",
  sql: "sql",
  toml: "toml",
  dockerfile: "dockerfile",
};

/** Language id for a file path; 'text' when unknown. */
export function detectLanguage(filePath?: string): string {
  if (!filePath) return "text";
  const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? "";
  return FILE_NAME_LANGUAGES[fileName] ?? EXTENSION_LANGUAGES[filePath.split(".").pop()?.toLowerCase() ?? ""] ?? "text";
}
