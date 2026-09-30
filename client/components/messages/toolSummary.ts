export type ToolStatus = "active" | "done" | "error";

type Category =
  | "execute"
  | "write"
  | "edit"
  | "read"
  | "search"
  | "list"
  | "network"
  | "task"
  | "todo"
  | "question"
  | "skill"
  | "think"
  | "other";

// [done singular, done plural, active, failed singular, failed plural]; task/todo are count-less.
const LABELS: Record<Category, [string, string, string, string, string]> = {
  execute: ["Ran {n} command", "Ran {n} commands", "Running command", "{n} command failed", "{n} commands failed"],
  write: ["Wrote {n} file", "Wrote {n} files", "Writing file", "{n} write failed", "{n} writes failed"],
  edit: ["Made {n} edit", "Made {n} edits", "Editing file", "{n} edit failed", "{n} edits failed"],
  read: ["Read {n} file", "Read {n} files", "Reading file", "{n} read failed", "{n} reads failed"],
  search: [
    "Searched for {n} pattern",
    "Searched for {n} patterns",
    "Searching",
    "{n} search failed",
    "{n} searches failed",
  ],
  list: [
    "Listed {n} directory",
    "Listed {n} directories",
    "Listing files",
    "{n} listing failed",
    "{n} listings failed",
  ],
  network: ["Fetched {n} page", "Fetched {n} pages", "Fetching page", "{n} fetch failed", "{n} fetches failed"],
  todo: ["Updated tasks", "Updated tasks", "Updating tasks", "Task update failed", "Task update failed"],
  question: [
    "Asked {n} question",
    "Asked {n} questions",
    "Asking question",
    "{n} question failed",
    "{n} questions failed",
  ],
  skill: ["Loaded {n} skill", "Loaded {n} skills", "Loading skill", "{n} skill failed", "{n} skills failed"],
  think: ["Thought {n} time", "Thought {n} times", "Thinking", "{n} thought interrupted", "{n} thoughts interrupted"],
  other: ["Called {n} tool", "Called {n} tools", "Using tool", "{n} tool failed", "{n} tools failed"],
  task: ["Subagent finished", "Subagent finished", "Subagent running", "{n} tool failed", "{n} tools failed"],
};

function categoryOf(name: string): Category {
  const l = name.toLowerCase();
  if (l.includes("todo")) return "todo";
  if (l === "task") return "task";
  if (l.includes("question") || l.includes("ask")) return "question";
  if (l.includes("skill")) return "skill";
  if (l.includes("bash") || l === "sh" || l.includes("cmd") || l.includes("terminal") || l.includes("shell"))
    return "execute";
  if (l.includes("write") || l.includes("save")) return "write";
  if (l.includes("edit") || l.includes("replace") || l.includes("patch")) return "edit";
  if (["web", "fetch", "http", "browse", "network", "exa"].some(k => l.includes(k))) return "network";
  if (l.includes("read") || l.includes("cat")) return "read";
  if (l.includes("grep") || l.includes("search")) return "search";
  if (l.includes("glob") || l.includes("find")) return "list";
  if (l.includes("think") || l.includes("reason") || l.includes("plan")) return "think";
  return "other";
}

export type SummarySegment = { text: string; type: "normal" | "error" | "active" };

const MAX_CATEGORIES = 3;

const phrase = (cat: Category, count: number, phase: "done" | "failed" | "active") => {
  const [one, many, active, failedOne, failedMany] = LABELS[cat];
  const template =
    phase === "active" ? active : phase === "done" ? (count === 1 ? one : many) : count === 1 ? failedOne : failedMany;
  return template.replace("{n}", String(count));
};

/** "Ran 1 command, read 1 file" style summary of a tool group. */
export function summarizeTools(tools: { name: string; status: ToolStatus }[]): SummarySegment[] {
  const order: Category[] = [];
  const done = new Map<Category, number>();
  const failed = new Map<Category, number>();
  const active = new Map<Category, number>();
  for (const { name, status } of tools) {
    const cat = categoryOf(name);
    if (!done.has(cat)) {
      order.push(cat);
      done.set(cat, 0);
      failed.set(cat, 0);
      active.set(cat, 0);
    }
    const bucket = status === "done" ? done : status === "error" ? failed : active;
    bucket.set(cat, (bucket.get(cat) ?? 0) + 1);
  }

  const segments: SummarySegment[] = [];
  const sep = () => segments.length > 0 && segments.push({ text: ", ", type: "normal" });

  const finished = order.filter(cat => (done.get(cat) ?? 0) + (failed.get(cat) ?? 0) > 0);
  for (const cat of finished.slice(0, MAX_CATEGORIES)) {
    const d = done.get(cat) ?? 0;
    const f = failed.get(cat) ?? 0;
    sep();
    if (d > 0 && f > 0) {
      segments.push({ text: phrase(cat, d + f, "done"), type: "normal" });
      segments.push({ text: ` (${f} failed)`, type: "error" });
    } else if (d > 0) {
      segments.push({ text: phrase(cat, d, "done"), type: "normal" });
    } else if (f === 1) {
      segments.push({ text: phrase(cat, f, "failed"), type: "error" });
    } else {
      segments.push({ text: phrase(cat, f, "done"), type: "error" });
      segments.push({ text: " (all failed)", type: "error" });
    }
  }
  if (finished.length > MAX_CATEGORIES) {
    const rest = finished
      .slice(MAX_CATEGORIES)
      .reduce((sum, cat) => sum + (done.get(cat) ?? 0) + (failed.get(cat) ?? 0), 0);
    sep();
    segments.push({ text: rest === 1 ? "And 1 more action" : `And ${rest} more actions`, type: "normal" });
  }
  for (const cat of order.filter(c => (active.get(c) ?? 0) > 0)) {
    sep();
    segments.push({ text: phrase(cat, active.get(cat) ?? 0, "active"), type: "active" });
  }

  if (segments.length === 0) return [{ text: `0/${tools.length} steps`, type: "normal" }];

  // Everything after the first phrase reads mid-sentence, so lowercase it.
  let first = true;
  for (const seg of segments) {
    if (seg.text === ", ") continue;
    if (first) first = false;
    else seg.text = seg.text.charAt(0).toLowerCase() + seg.text.slice(1);
  }
  return segments;
}
