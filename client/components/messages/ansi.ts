export type AnsiSegment = { text: string; fg?: string; bold?: boolean; dim?: boolean; italic?: boolean };

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC byte of ANSI color codes is the point.
const SGR = /\x1b\[[0-9;]*m/g;

const COLORS: Record<number, string> = {
  30: "var(--ansi-black, #545454)",
  31: "var(--ansi-red, #cf4647)",
  32: "var(--ansi-green, #4ea24c)",
  33: "var(--ansi-yellow, #c4a500)",
  34: "var(--ansi-blue, #3d7ec7)",
  35: "var(--ansi-magenta, #b44e91)",
  36: "var(--ansi-cyan, #21a8a5)",
  37: "var(--ansi-white, #cccccc)",
  90: "var(--ansi-bright-black, #767676)",
  91: "var(--ansi-bright-red, #f0706f)",
  92: "var(--ansi-bright-green, #7bc96f)",
  93: "var(--ansi-bright-yellow, #e3d94e)",
  94: "var(--ansi-bright-blue, #6cb5ed)",
  95: "var(--ansi-bright-magenta, #d07fd0)",
  96: "var(--ansi-bright-cyan, #5fd7d7)",
  97: "var(--ansi-bright-white, #eeeeee)",
};

/** Split text containing SGR escapes into styled segments. */
export function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let fg: string | undefined;
  let bold = false;
  let dim = false;
  let italic = false;
  let last = 0;
  const push = (chunk: string) => {
    if (chunk)
      segments.push({ text: chunk, fg, bold: bold || undefined, dim: dim || undefined, italic: italic || undefined });
  };
  for (const match of text.matchAll(SGR)) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    const params = match[0].slice(2, -1);
    for (const code of params === "" ? [0] : params.split(";").map(Number)) {
      if (code === 0) [fg, bold, dim, italic] = [undefined, false, false, false];
      else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 3) italic = true;
      else if (code === 22) [bold, dim] = [false, false];
      else if (code === 23) italic = false;
      else if (code === 39) fg = undefined;
      else if (COLORS[code]) fg = COLORS[code];
    }
  }
  push(text.slice(last));
  return segments;
}
