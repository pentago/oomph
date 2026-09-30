// oomph: minimal web front end for omp. Each open chat is served by one omp: the terminal omp that has it open (through
// the plugin's lifeline connection, see the end of this file) or else an `omp --mode rpc` child of ours.
// Auth: password login. The omp plugin (`extension.ts`) generates the password; `bun server.ts passwd` sets one by
// hand. Only an argon2id hash is stored, in ~/.config/oomph/password. A successful login sets an HttpOnly cookie
// signed with a random secret, so restarts don't log you out.
// POSTs and the WebSocket upgrade must carry an Origin matching the host they were sent to (blocks cross-site request
// forgery against this bash-capable server). There is no Host allowlist, so the server works under any name, IP or
// proxy; a DNS-rebinding page gets no cookie and can only guess passwords against the login backoff.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, rmSync } from "node:fs";
import { chmod, mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ServerWebSocket, Subprocess } from "bun";
import type { ClientMsg, UiCommand, UiMessage, UiModel, UiPart, UiState } from "./shared";

// The plugin runs this file through the omp binary with BUN_BE_BUN=1; drop it so the `omp` children we spawn act as
// omp. Bun.spawn's default env is a startup snapshot, so openSession passes `env: process.env` explicitly.
delete process.env.BUN_BE_BUN;

const CONF_DIR = process.env.OOMPH_CONFIG ?? join(homedir(), ".config", "oomph");
const PW_FILE = join(CONF_DIR, "password");
const SECRET_FILE = join(CONF_DIR, "secret");
const PID_FILE = join(CONF_DIR, "pid"); // lets `/oomph stop` find us
const LIFELINE = process.env.OOMPH_LIFELINE; // unix socket path, set by the plugin; see the end of this file
const MIN_PASSWORD = 12;
const COOKIE = "oomph_session";
const SESSION_MS = 30 * 24 * 3600_000;
const HOST = process.env.OOMPH_HOST ?? "127.0.0.1";
const PORT = Number(process.env.OOMPH_PORT ?? 8788);
const SESSIONS_DIR = join(process.env.OMP_AGENT_DIR ?? join(homedir(), ".omp", "agent"), "sessions");
const IDLE_MS = 30 * 60_000; // reap idle processes nobody is watching
const LIST_LIMIT = 60;

// Constant-time compare so a signature can't be probed byte by byte.
const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ---- auth ------------------------------------------------------------------------------------

async function setPassword() {
  await mkdir(CONF_DIR, { recursive: true, mode: 0o700 });
  Bun.spawnSync(["stty", "-echo"], { stdin: "inherit" });
  let first: string | null;
  let second: string | null;
  try {
    first = prompt("New password (min 12 chars): ");
    console.log();
    second = prompt("Repeat password: ");
    console.log();
  } finally {
    Bun.spawnSync(["stty", "echo"], { stdin: "inherit" });
  }
  if (!first || first !== second) {
    console.error("Password empty or the two entries differ");
    process.exit(1);
  }
  if (first.length < MIN_PASSWORD) {
    console.error(`Password must be at least ${MIN_PASSWORD} characters`);
    process.exit(1);
  }
  await Bun.write(PW_FILE, await Bun.password.hash(first), { mode: 0o600 });
  await chmod(PW_FILE, 0o600); // Bun.write only applies mode when it creates the file
  console.log(`Password saved to ${PW_FILE}`);
}

async function createSecret() {
  const secret = randomBytes(32).toString("hex");
  await mkdir(CONF_DIR, { recursive: true, mode: 0o700 });
  await Bun.write(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

if (Bun.argv[2] === "passwd") {
  await setPassword();
  process.exit(0);
}
if (!(await Bun.file(PW_FILE).exists())) {
  console.error("No password set. Run: bun server.ts passwd");
  process.exit(1);
}
const SECRET = (await Bun.file(SECRET_FILE).exists())
  ? (await Bun.file(SECRET_FILE).text()).trim()
  : await createSecret();

// Cookie = `${expiry}.${hmac}`. The key mixes in the password hash, so changing the password logs everyone out.
// The hash file is re-read per check so a new password takes effect without a restart.
async function sign(exp: string) {
  const hash = (await Bun.file(PW_FILE).text()).trim();
  return createHmac("sha256", `${SECRET}:${hash}`).update(exp).digest("base64url");
}

async function authed(req: Request) {
  const cookie = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "")?.[1] ?? "";
  const [exp, sig = ""] = cookie.split(".");
  if (!exp || Number(exp) < Date.now()) return false;
  return eq(sig, await sign(exp));
}

// ponytail: one global backoff for failed logins, because a reverse proxy hides client IPs. Anyone who can reach the
// login can lock it for up to 30s by spamming it; add per-client lockout if that ever matters.
let failures = 0;
let lockedUntil = 0;
let verifying = false; // one argon2 check at a time, so parallel requests can't each get a free guess

const loginPage = (error = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fafbfa">
<title>oomph - sign in</title>
<style>
  :root { color-scheme: light; --bg: 150 10% 99%; --panel: 150 12% 96%; --text: 170 15% 15%; --dim: 170 8% 55%; --line: 160 10% 75%; --accent: 165 45% 42%; --danger: 5 60% 55%; }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; --bg: 210 20% 18%; --panel: 210 20% 14%; --text: 210 15% 92%; --dim: 210 8% 55%; --line: 210 15% 32%; --accent: 165 45% 45%; --danger: 5 70% 65%; } }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: hsl(var(--bg)); color: hsl(var(--text)); font: 15px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif; }
  form { width: min(92vw, 340px); display: grid; gap: 12px; padding: 28px 24px; border: 1px solid hsl(var(--line) / .5); border-radius: 16px; background: hsl(var(--panel)); }
  h2 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
  input, button { font: inherit; padding: 11px 12px; border-radius: 12px; border: 1px solid hsl(var(--line) / .6); background: hsl(var(--bg)); color: inherit; outline: none; }
  input:focus { border-color: hsl(var(--accent)); box-shadow: 0 0 0 3px hsl(var(--accent) / .18); }
  button { cursor: pointer; border-color: hsl(var(--accent)); background: hsl(var(--accent)); color: #fff; font-weight: 500; }
  button:hover { filter: brightness(1.06); }
  .err { color: hsl(var(--danger)); margin: 0; font-size: 13px; }
</style></head><body>
<form method="post" action="/login">
  <h2 style="margin:0">oomph</h2>
  <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
  <button type="submit">Sign in</button>
  ${error ? `<p class="err">${error}</p>` : ""}
</form></body></html>`;

// ---- shapes of the untrusted JSON we read (omp frames, session files) ------------------------

type Part = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  intent?: string;
  arguments?: Record<string, unknown>;
};
type Message = {
  role?: string;
  content?: string | Part[];
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  display?: boolean;
  details?: unknown;
  timestamp?: number;
  provider?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number };
  };
};
type RawModel = { id: string; name?: string; provider: string; contextWindow?: number; reasoning?: boolean };
type Frame = {
  id?: string;
  type?: string;
  success?: boolean;
  error?: string | { message?: string };
  isTerminal?: boolean;
  messageId?: string;
  message?: Message;
  assistantMessageEvent?: { type?: string; delta?: string };
  status?: string;
  text?: string; // command_output
  commands?: { name: string; description?: string }[]; // available_commands_update
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  intent?: string;
  isError?: boolean;
  data?: {
    sessionFile?: string;
    isStreaming?: boolean;
    model?: RawModel;
    thinkingLevel?: string;
    sessionName?: string;
    contextUsage?: { tokens?: number | null; contextWindow?: number; percent?: number | null };
    levels?: string[];
    models?: RawModel[];
  };
};
type Entry = {
  id?: string;
  parentId?: string | null;
  type?: string;
  message?: Message;
  title?: string;
  cwd?: string;
  timestamp?: string; // ISO time the entry was appended
  content?: string; // custom_message entries carry their text and display flag at entry level
  display?: boolean;
  details?: unknown;
};

// ---- message shaping (shared by history and live events) -------------------------------------

// Oversized JSON is replaced by a truncated string so one huge tool call can't blow up a frame.
const limitJson = (v: unknown, n: number): unknown => {
  const s = JSON.stringify(v ?? null);
  return s.length <= n ? v : { _truncated: cut(s, n) };
};

function toUiPart(p: Part): UiPart[] {
  if (p.type === "text") return [{ type: "text", text: cut(p.text ?? "", 50_000) }];
  if (p.type === "thinking") return [{ type: "thinking", text: cut(p.thinking ?? p.text ?? "", 20_000) }];
  if (p.type === "toolCall") {
    const i = p.arguments?.i;
    return [
      {
        type: "toolCall",
        id: p.id ?? "",
        name: p.name ?? "",
        intent: p.intent ?? (typeof i === "string" ? i : undefined),
        args: limitJson(p.arguments, 4000),
      },
    ];
  }
  return [];
}

// Advisor notes carry their text in details.notes[0].note; `content` wraps it in an <advisory> tag.
function noteText(details: unknown, body: string): string {
  if (details && typeof details === "object" && "notes" in details && Array.isArray(details.notes)) {
    const first: unknown = details.notes[0];
    if (first && typeof first === "object" && "note" in first && typeof first.note === "string")
      return cut(first.note, 800);
  }
  return cut(body.replace(/<\/?advisory[^>]*>/g, "").trim(), 800);
}

function toUi(m: Message, id?: string, completedAt?: number): UiMessage | null {
  const parts: Part[] = Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content ?? "") }];
  const body = parts
    .filter(p => p.type === "text")
    .map(p => p.text ?? "")
    .join("\n");
  const base = { id, timestamp: m.timestamp, completedAt };
  switch (m.role) {
    case "user":
      return { ...base, role: "user", text: cut(body, 20_000) };
    case "assistant":
      return {
        ...base,
        role: "assistant",
        parts: parts.flatMap(toUiPart),
        provider: m.provider,
        model: m.model,
        stopReason: m.stopReason,
        errorMessage: m.errorMessage,
        usage: m.usage && {
          input: m.usage.input ?? 0,
          output: m.usage.output ?? 0,
          cacheRead: m.usage.cacheRead ?? 0,
          cacheWrite: m.usage.cacheWrite ?? 0,
          totalTokens: m.usage.totalTokens ?? 0,
          cost: m.usage.cost?.total ?? 0,
        },
      };
    case "toolResult":
      return {
        ...base,
        role: "tool",
        toolCallId: m.toolCallId ?? "",
        name: m.toolName ?? "",
        isError: !!m.isError,
        text: cut(body, 20_000),
        details: limitJson(m.details, 20_000),
      };
    case "custom":
      return m.display ? { ...base, role: "note", text: noteText(m.details, body) } : null;
    default:
      return null;
  }
}

const toModel = (m: RawModel): UiModel => ({
  provider: m.provider,
  id: m.id,
  name: m.name ?? m.id,
  contextWindow: m.contextWindow ?? 0,
  reasoning: !!m.reasoning,
});

// ---- session files ---------------------------------------------------------------------------

type SessionMeta = { title?: string; cwd: string; messages: number };
const metaCache = new Map<string, { mtime: number; meta: SessionMeta }>(); // one entry per file, refreshed when its mtime changes

// Title, cwd and message count. Untitled chats fall back to their first user message.
async function sessionMeta(file: string, mtime: number): Promise<SessionMeta> {
  const hit = metaCache.get(file);
  if (hit?.mtime === mtime) return hit.meta;
  let title: string | undefined;
  let cwd = "";
  let messages = 0;
  let firstUser: string | undefined;
  for (const line of (await Bun.file(file).text()).split("\n")) {
    try {
      if (line.includes('"type":"message"')) {
        messages++;
        if (!firstUser && line.includes('"role":"user"')) {
          const e: Entry = JSON.parse(line);
          const body = toUi(e.message ?? {}, e.id);
          if (body?.role === "user") firstUser = body.text.replace(/\s+/g, " ").trim();
        }
      } else if (line.startsWith('{"type":"title"') || line.includes('"type":"session"')) {
        const e: Entry = JSON.parse(line);
        if (e.type === "title" && e.title) title = e.title;
        if (e.type === "session") cwd = e.cwd ?? "";
      }
    } catch {}
  }
  const meta = { title: title || (firstUser ? cut(firstUser, 80) : undefined), cwd, messages };
  metaCache.set(file, { mtime, meta });
  return meta;
}

async function listSessions() {
  const found: { file: string; mtime: number }[] = [];
  for (const dir of await readdir(SESSIONS_DIR).catch(() => [])) {
    for (const f of await readdir(join(SESSIONS_DIR, dir)).catch(() => [])) {
      if (!f.endsWith(".jsonl")) continue;
      const file = join(SESSIONS_DIR, dir, f);
      found.push({ file, mtime: (await stat(file)).mtimeMs });
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  const running = new Set([...sessions.values()].map(s => s.file).concat([...claims.keys()]));
  return Promise.all(
    found.slice(0, LIST_LIMIT).map(async ({ file, mtime }) => ({
      file,
      mtime,
      ...(await sessionMeta(file, mtime)),
      running: running.has(file),
    })),
  );
}

// Active branch of a session, read straight from its JSONL (no RPC paging/busy limits).
async function history(file: string) {
  const entries: Entry[] = [];
  for (const line of (await Bun.file(file).text()).split("\n")) {
    try {
      if (line) entries.push(JSON.parse(line));
    } catch {}
  }
  const byId = new Map(entries.flatMap(e => (e.id ? [[e.id, e] as const] : [])));
  const chain: Entry[] = [];
  for (let cur = entries.findLast(e => e.id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    chain.push(cur);
  }
  return chain
    .reverse()
    .flatMap(e => {
      const at = e.timestamp ? Date.parse(e.timestamp) : undefined;
      if (e.type === "message" && e.message) return [toUi(e.message, e.id, at)];
      if (e.type === "custom_message" && e.display) {
        return [
          toUi({ role: "custom", content: e.content, display: true, details: e.details, timestamp: at }, e.id, at),
        ];
      }
      return [];
    })
    .filter(m => m !== null);
}

// ---- omp processes -----------------------------------------------------------------------------

// A chat is served by exactly one omp: a terminal omp that has it open (`owner`, reached through its lifeline
// connection) or else our own `omp --mode rpc` child (`proc`). Never both: omp has no cross-process lock on session
// files, so two writers would fork the chat.
type Holder = Bun.Socket<{ buf: string; dec: TextDecoder; out: Buffer[]; file?: string }>;
type Sess = {
  key: string;
  cwd: string;
  file?: string;
  proc?: Subprocess<"pipe", "pipe", "ignore">;
  owner?: Holder;
  pending: Map<string, (r: Frame) => void>;
  subs: Set<ServerWebSocket<unknown>>;
  streaming: boolean;
  state?: UiState;
  last: number;
  seq: number;
  ended?: string; // last message that got its final `msg`; later deltas for it would duplicate text
  commands?: UiCommand[]; // slash commands the child omp advertised (terminal-owned chats have none)
};
const sessions = new Map<string, Sess>();
const claims = new Map<string, Holder>(); // session file -> terminal omp that has it open
let modelCache: { at: number; items: UiModel[] } | undefined; // the model list is global, so one fetch serves every session
// The default model (modelRoles.default in ~/.omp/agent/config.yml) belongs in the composer before any chat
// exists, and only omp knows it: a fresh headless omp starts on exactly that model, so ask one once.
let defaultModel: UiModel | undefined;
let defaultProbe: Promise<void> | undefined;
async function probeDefaultModel(): Promise<void> {
  if (!defaultProbe)
    defaultProbe = (async () => {
      let proc: Subprocess<"pipe", "pipe", "ignore"> | undefined;
      try {
        proc = Bun.spawn(["omp", "--mode", "rpc", "--no-ui", "--allow-home"], {
          cwd: homedir(),
          env: process.env,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "ignore",
        });
        const reply = (async () => {
          const dec = new TextDecoder();
          let buf = "";
          for await (const chunk of proc.stdout) {
            buf += dec.decode(chunk, { stream: true });
            for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
              const line = buf.slice(0, i);
              buf = buf.slice(i + 1);
              try {
                const f: Frame = JSON.parse(line);
                if (f.type === "response" && f.id === "probe") return f;
              } catch {}
            }
          }
        })();
        proc.stdin.write(`${JSON.stringify({ id: "probe", type: "get_state" })}\n`);
        proc.stdin.flush();
        const f = await Promise.race([reply, new Promise<undefined>(r => setTimeout(r, 10_000))]);
        if (f?.success && f.data?.model) defaultModel = toModel(f.data.model);
      } catch {
        // no omp on PATH or it never answered: the composer falls back to "Select model"
      } finally {
        proc?.kill();
      }
    })();
  return defaultProbe;
}

const isSessionFile = (file: string) => file.startsWith(`${SESSIONS_DIR}/`) && file.endsWith(".jsonl");

// Socket writes can be partial when the kernel buffer is full (a big message or tool result); queue the rest and
// finish it on `drain`, or the terminal would get a cut-off JSON line.
function sendTo(h: Holder, text: string) {
  if (h.data.out.length) return void h.data.out.push(Buffer.from(text));
  const b = Buffer.from(text);
  const n = h.write(b);
  if (n < b.length) h.data.out.push(b.subarray(Math.max(n, 0)));
}
function flushTo(h: Holder) {
  const q = h.data.out;
  while (q[0]) {
    const n = h.write(q[0]);
    if (n < q[0].length) {
      q[0] = q[0].subarray(Math.max(n, 0));
      return;
    }
    q.shift();
  }
}

function emit(s: Sess, ev: object) {
  const msg = JSON.stringify({ t: "ev", key: s.key, ev });
  for (const ws of s.subs) ws.send(msg);
}

function write(s: Sess, cmd: object, id?: string) {
  const line = `${JSON.stringify({ id, ...cmd })}\n`;
  if (s.owner) sendTo(s.owner, line);
  else if (s.proc) {
    s.proc.stdin.write(line);
    s.proc.stdin.flush();
  }
}

function failPending(s: Sess, error: string) {
  for (const done of s.pending.values()) done({ success: false, error });
  s.pending.clear();
}

function rpc(s: Sess, cmd: object): Promise<Frame> {
  const id = `r${++s.seq}`;
  const { promise, resolve } = Promise.withResolvers<Frame>();
  s.pending.set(id, resolve);
  write(s, cmd, id);
  return promise;
}

// Pull model, thinking level and context usage from omp and push them to viewers.
async function refreshState(s: Sess) {
  const [st, lv] = await Promise.all([
    rpc(s, { type: "get_state" }),
    rpc(s, { type: "get_available_thinking_levels" }),
  ]);
  if (!st.success || !st.data) return;
  const d = st.data;
  s.file = d.sessionFile ?? s.file;
  s.streaming = !!d.isStreaming;
  s.state = {
    model: d.model && toModel(d.model),
    thinkingLevel: d.thinkingLevel ?? "off",
    thinkingLevels: lv.data?.levels ?? [],
    contextUsage: d.contextUsage && {
      tokens: d.contextUsage.tokens ?? null,
      contextWindow: d.contextUsage.contextWindow ?? 0,
      percent: d.contextUsage.percent ?? null,
    },
    streaming: s.streaming,
    sessionName: d.sessionName,
  };
  emit(s, { type: "state", state: s.state });
}

function onFrame(s: Sess, f: Frame) {
  s.last = Date.now();
  if (f.type === "response") {
    const done = f.id ? s.pending.get(f.id) : undefined;
    if (done && f.id) {
      s.pending.delete(f.id);
      done(f);
    } else if (!f.success) {
      emit(s, { type: "result", status: "error", error: typeof f.error === "string" ? f.error : f.error?.message });
    }
    return;
  }
  switch (f.type) {
    case "agent_start":
      s.streaming = true;
      emit(s, { type: "agent_start" });
      break;
    case "agent_end": {
      const terminal = f.isTerminal !== false;
      if (terminal) s.streaming = false;
      emit(s, { type: "agent_end", terminal });
      break;
    }
    case "message_start":
      if (f.message?.role === "assistant" && f.messageId) emit(s, { type: "start", id: f.messageId });
      break;
    case "message_update": {
      const e = f.assistantMessageEvent;
      if (f.messageId === s.ended) break; // omp can deliver a message's last update after its end
      if (f.messageId && e?.delta && (e.type === "text_delta" || e.type === "thinking_delta")) {
        emit(s, { type: "delta", id: f.messageId, kind: e.type === "text_delta" ? "text" : "thinking", text: e.delta });
      }
      break;
    }
    case "message_end": {
      const msg = f.message ? toUi(f.message, f.messageId, Date.now()) : null;
      if (msg && f.messageId) emit(s, { type: "msg", id: f.messageId, msg });
      s.ended = f.messageId;
      break;
    }
    case "tool_execution_start":
      if (f.toolCallId) {
        emit(s, {
          type: "tool_start",
          id: f.toolCallId,
          name: f.toolName ?? "",
          intent: f.intent,
          args: limitJson(f.args, 4000),
        });
      }
      break;
    case "tool_execution_end":
      if (f.toolCallId) emit(s, { type: "tool_end", id: f.toolCallId, isError: !!f.isError });
      break;
    // A slash command typed in the browser: omp executes it and prints here; no agent turn runs.
    case "command_output":
      if (f.text) emit(s, { type: "msg", id: `cmd${++s.seq}`, msg: { role: "note", text: f.text } });
      break;
    case "available_commands_update":
      s.commands = (f.commands ?? []).map(c => ({ name: c.name, description: c.description }));
      emit(s, { type: "commands", items: s.commands });
      break;
    case "turn_end":
    case "model_changed":
    case "thinking_level_changed":
    case "auto_compaction_end":
      void refreshState(s);
      break;
    case "prompt_result":
      emit(s, {
        type: "result",
        status: f.status,
        error: typeof f.error === "string" ? f.error : f.error?.message,
      });
      break;
  }
}

async function pump(s: Sess, proc: Subprocess<"pipe", "pipe", "ignore">) {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of proc.stdout) {
    buf += dec.decode(chunk, { stream: true });
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        if (line) onFrame(s, JSON.parse(line));
      } catch {}
    }
  }
  if (s.proc !== proc) return; // handed to a terminal omp, which already settled the pending calls
  failPending(s, "omp exited");
  sessions.delete(s.key);
  emit(s, { type: "exited" });
}

// Our own omp for a chat no terminal has open. --allow-home: without it omp silently relocates a session started in
// ~ to a temp dir. False if omp can't be started (e.g. not on this process's PATH).
function runChild(s: Sess) {
  const args = ["omp", "--mode", "rpc", "--no-ui", "--allow-home", ...(s.file ? ["--resume", s.file] : [])];
  try {
    s.proc = Bun.spawn(args, { cwd: s.cwd, env: process.env, stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  } catch {
    return false;
  }
  void pump(s, s.proc);
  return true;
}

async function openSession(cwd: string, file?: string, key?: string): Promise<Sess> {
  const known = key ? sessions.get(key) : file ? [...sessions.values()].find(s => s.file === file) : undefined;
  if (known) return known;
  if (file && !isSessionFile(file)) throw new Error("bad session file");
  if (!(await stat(cwd)).isDirectory()) throw new Error("cwd is not a directory");
  const s: Sess = {
    key: crypto.randomUUID(),
    cwd,
    file,
    owner: file ? claims.get(file) : undefined,
    pending: new Map(),
    subs: new Set(),
    streaming: false,
    last: Date.now(),
    seq: 0,
  };
  sessions.set(s.key, s);
  if (!s.owner && !runChild(s)) {
    sessions.delete(s.key);
    throw new Error("could not start omp; is it on PATH?");
  }
  await refreshState(s);
  return s;
}

// A terminal omp now has `file` open: serve that chat from it and stop our own omp for it.
// ponytail: a turn our omp is still running is cut off, and the terminal may have loaded the file just before that
// turn's last entries; abort-and-wait before the terminal resumes would close that gap.
function claim(h: Holder, file: string) {
  release(h);
  h.data.file = file;
  claims.set(file, h);
  const s = [...sessions.values()].find(x => x.file === file);
  if (!s) return;
  const child = s.proc;
  s.proc = undefined;
  s.owner = h;
  child?.kill();
  failPending(s, "chat moved to a terminal");
  void refreshState(s);
}

// The terminal left its chat (switched chats or exited). Browsers still on it continue on our own omp.
function release(h: Holder) {
  const file = h.data.file;
  if (!file || claims.get(file) !== h) return;
  claims.delete(file);
  h.data.file = undefined;
  for (const s of sessions.values()) {
    if (s.owner !== h) continue;
    s.owner = undefined;
    failPending(s, "chat left the terminal");
    if (!s.subs.size) sessions.delete(s.key);
    else if (runChild(s)) void refreshState(s);
    else {
      sessions.delete(s.key);
      emit(s, { type: "exited" });
    }
  }
}

setInterval(() => {
  for (const s of sessions.values()) {
    if (s.proc && s.subs.size === 0 && !s.streaming && Date.now() - s.last > IDLE_MS) s.proc.kill();
  }
}, 60_000);

function shutdown() {
  for (const s of sessions.values()) s.proc?.kill(); // don't leave omp children behind
  rmSync(PID_FILE, { force: true });
  if (LIFELINE) rmSync(LIFELINE, { force: true });
  process.exit(0);
}
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, shutdown);

// ---- http / websocket ------------------------------------------------------------------------

const secure = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin", // no-referrer makes browsers send `Origin: null` on form posts
  "content-security-policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'",
};
const text = (body: string, status: number) => new Response(body, { status, headers: secure });
const asset = (path: string, type: string) =>
  new Response(Bun.file(join(import.meta.dir, path)), { headers: { ...secure, "content-type": type } });

// The 1.2 MB bundle is re-fetched on every phone load, so gzip it (once per build) and let the browser revalidate
// with an ETag instead of `no-store`: unchanged loads cost a 304, changed ones a compressed download.
const gzCache = new Map<string, { mtime: number; body: Uint8Array<ArrayBuffer>; etag: string }>();
async function bundle(req: Request, path: string, type: string) {
  const file = Bun.file(join(import.meta.dir, path));
  let hit = gzCache.get(path);
  if (hit?.mtime !== file.lastModified) {
    const body = new Uint8Array(await file.arrayBuffer());
    hit = {
      mtime: file.lastModified,
      body: Bun.gzipSync(body),
      // Content hash, not mtime+size: a rebuild while a response is in flight must never serve an old
      // body under the new build's validator (the browser would then 304 the stale copy forever).
      etag: `W/"${Bun.hash(body).toString(16)}-${file.size}"`,
    };
    gzCache.set(path, hit);
  }
  const headers = {
    ...secure,
    "cache-control": "no-cache",
    etag: hit.etag,
    vary: "accept-encoding",
    "content-type": type,
  };
  if (req.headers.get("if-none-match") === hit.etag) return new Response(null, { status: 304, headers });
  if (req.headers.get("accept-encoding")?.includes("gzip")) {
    return new Response(hit.body, { headers: { ...headers, "content-encoding": "gzip" } });
  }
  return new Response(file, { headers });
}

Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req, server) {
    // Browsers always send Origin on WebSocket upgrades and form POSTs, and a cross-site page can't forge it.
    // X-Forwarded-Host covers proxies that rewrite Host; a browser can't set it on those requests either.
    const origin = req.headers.get("origin");
    if (origin && URL.parse(origin)?.host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
      return text("bad origin", 403);
    }
    if (req.method === "POST" && !origin) return text("origin required", 403);
    // Secure only over HTTPS: on plain HTTP (LAN or VPN address) browsers would drop a Secure cookie.
    const cookieFlags = `HttpOnly; SameSite=Strict; Path=/${origin?.startsWith("https:") ? "; Secure" : ""}`;
    const url = new URL(req.url);
    const page = (body: string, status = 200) =>
      new Response(body, { status, headers: { ...secure, "content-type": "text/html; charset=utf-8" } });
    const redirect = (to: string, cookie?: string) =>
      new Response(null, {
        status: 303,
        headers: { ...secure, location: to, ...(cookie ? { "set-cookie": cookie } : {}) },
      });

    if (url.pathname === "/login") {
      if (req.method !== "POST") return (await authed(req)) ? redirect("/") : page(loginPage());
      if (verifying || Date.now() < lockedUntil) {
        return page(loginPage("Too many attempts, wait a moment"), 429);
      }
      verifying = true; // set before any await: the check and the flag must be atomic
      let ok = false;
      try {
        const password = String((await req.formData()).get("password") ?? "");
        const hash = (await Bun.file(PW_FILE).text()).trim();
        ok = await Bun.password.verify(password, hash);
      } catch {
        ok = false;
      } finally {
        verifying = false;
      }
      if (!ok) {
        failures++;
        lockedUntil = Date.now() + Math.min(2 ** failures * 250, 30_000);
        return page(loginPage("Wrong password"), 401);
      }
      failures = 0;
      const exp = String(Date.now() + SESSION_MS);
      return redirect("/", `${COOKIE}=${exp}.${await sign(exp)}; ${cookieFlags}; Max-Age=${SESSION_MS / 1000}`);
    }
    if (!(await authed(req))) return url.pathname === "/" ? redirect("/login") : text("unauthorized", 401);
    if (url.pathname === "/logout" && req.method === "POST") {
      return redirect("/login", `${COOKIE}=; ${cookieFlags}; Max-Age=0`);
    }

    if (url.pathname === "/ws") {
      if (!origin) return text("origin required", 403);
      return server.upgrade(req) ? undefined : text("upgrade failed", 400);
    }
    // Non-image attachments from the composer's + button: stored on disk, delivered to the chat as a path the
    // agent reads with its own tools (omp only carries images as message content).
    if (url.pathname === "/upload" && req.method === "POST") {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File) || file.size === 0) return text("bad upload", 400);
      if (file.size > 64 * 1024 * 1024) return text("too big (max 64 MB)", 413);
      const safe = file.name.replaceAll(/[/\0]/g, "_").slice(-120) || "upload";
      const dir = join(homedir(), ".cache", "oomph", "uploads");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${crypto.randomUUID().slice(0, 8)}-${safe}`);
      await Bun.write(path, file, { mode: 0o600 });
      return new Response(JSON.stringify({ path }), {
        headers: { ...secure, "content-type": "application/json" },
      });
    }
    if (url.pathname === "/") return asset("client/index.html", "text/html; charset=utf-8");
    if (url.pathname === "/app.js") return bundle(req, "dist/app.js", "text/javascript");
    if (url.pathname === "/app.css") return bundle(req, "dist/app.css", "text/css");
    if (url.pathname.startsWith("/assets/")) {
      const root = join(import.meta.dir, "client/assets");
      const path = join(root, url.pathname.slice("/assets/".length));
      const file = Bun.file(path);
      return path.startsWith(`${root}/`) && (await file.exists())
        ? new Response(file, { headers: secure })
        : text("not found", 404);
    }
    return text("not found", 404);
  },
  websocket: {
    async message(ws, raw) {
      let m: ClientMsg;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      const reply = (o: object) => ws.send(JSON.stringify(o));
      try {
        if (m.t === "list") {
          await probeDefaultModel(); // once per server start: lets the composer show a model before any chat
          const items = await listSessions();
          reply({
            t: "sessions",
            items,
            cwds: [...new Set([homedir(), ...items.map(i => i.cwd).filter(Boolean)])],
            defaultModel,
          });
        } else if (m.t === "open") {
          const s = await openSession(m.cwd ?? homedir(), m.file, m.key);
          s.subs.add(ws);
          reply({
            t: "opened",
            key: s.key,
            file: s.file,
            cwd: s.cwd,
            streaming: s.streaming,
            history: s.file ? await history(s.file).catch(() => []) : [],
            state: s.state,
            commands: s.commands ?? [],
          });
        } else if (m.t === "prompt") {
          const s = m.key ? sessions.get(m.key) : undefined;
          // Untrusted attachment payload: keep it small enough for one rpc line (and the lifeline socket's 64 MB
          // read buffer) and shape it, or a crafted frame could smuggle arbitrary fields into omp's command.
          const images = m.images
            ?.filter(i => i?.type === "image" && typeof i.data === "string" && /^image\/[\w.+-]+$/.test(i.mimeType))
            .slice(0, 8)
            .filter(i => i.data.length <= 8 * 1024 * 1024)
            .map(i => ({ type: "image" as const, data: i.data, mimeType: i.mimeType }));
          if (s && m.text?.trim()) {
            write(s, {
              type: "prompt",
              message: m.text,
              ...(images?.length ? { images } : {}),
              ...(s.streaming ? { streamingBehavior: "followUp" } : {}),
            });
          }
        } else if (m.t === "abort") {
          const s = m.key ? sessions.get(m.key) : undefined;
          if (s) write(s, { type: "abort" });
        } else if (m.t === "models") {
          const s = sessions.get(m.key);
          if (s) {
            if (!modelCache || Date.now() - modelCache.at > 5 * 60_000) {
              const r = await rpc(s, { type: "get_available_models" });
              const raw = Array.isArray(r.data) ? r.data : (r.data?.models ?? []);
              modelCache = { at: Date.now(), items: (raw as RawModel[]).map(toModel) };
            }
            reply({ t: "models", items: modelCache.items });
          }
        } else if (m.t === "setModel") {
          const s = sessions.get(m.key);
          if (s) {
            const r = await rpc(s, { type: "set_model", provider: m.provider, modelId: m.modelId });
            if (!r.success)
              throw new Error(typeof r.error === "string" ? r.error : (r.error?.message ?? "set_model failed"));
            await refreshState(s);
          }
        } else if (m.t === "setThinking") {
          const s = sessions.get(m.key);
          if (s) {
            const r = await rpc(s, { type: "set_thinking_level", level: m.level });
            if (!r.success)
              throw new Error(
                typeof r.error === "string" ? r.error : (r.error?.message ?? "set_thinking_level failed"),
              );
            await refreshState(s);
          }
        }
      } catch (e) {
        reply({ t: "error", error: String(e instanceof Error ? e.message : e) });
      }
    },
    close(ws) {
      for (const s of sessions.values()) s.subs.delete(ws);
    },
  },
});
// Started by the plugin: live exactly as long as some interactive omp holds a connection to this socket. Each omp
// keeps one open and the OS closes it when that omp exits, even on a crash, so the last omp to go stops oomph.
// The same connection carries the terminal bridge, as newline-delimited JSON:
//   omp -> us: {t:"claim", file} (this omp has that chat open now), {t:"frame", frame} (an `omp --mode rpc` frame)
//   us -> omp: `omp --mode rpc` commands for its chat (prompt, abort, get_state, set_model, ...)
if (LIFELINE) {
  let holders = 0;
  rmSync(LIFELINE, { force: true }); // left behind by a crash
  // Whoever can connect can read browser prompts and drive chats: only this user may. Lock the directory before the
  // socket exists (it's created with the umask), then the socket itself (connecting needs write permission on it).
  chmodSync(CONF_DIR, 0o700);
  Bun.listen<Holder["data"]>({
    unix: LIFELINE,
    socket: {
      open(h) {
        h.data = { buf: "", dec: new TextDecoder(), out: [] };
        holders++;
      },
      drain: flushTo,
      data(h, chunk) {
        h.data.buf += h.data.dec.decode(chunk, { stream: true });
        if (h.data.buf.length > 64 * 1024 * 1024) return void h.end(); // a peer that never sends a newline
        for (let i = h.data.buf.indexOf("\n"); i >= 0; i = h.data.buf.indexOf("\n")) {
          const line = h.data.buf.slice(0, i);
          h.data.buf = h.data.buf.slice(i + 1);
          let m: { t?: string; file?: unknown; frame?: Frame };
          try {
            m = JSON.parse(line);
          } catch {
            continue;
          }
          if (m.t === "claim" && typeof m.file === "string" && isSessionFile(m.file)) claim(h, m.file);
          else if (m.t === "frame" && m.frame) {
            for (const s of sessions.values()) if (s.owner === h) onFrame(s, m.frame);
          }
        }
      },
      close(h) {
        release(h);
        if (--holders === 0) shutdown();
      },
    },
  });
  chmodSync(LIFELINE, 0o600);
  setTimeout(() => holders === 0 && shutdown(), 30_000); // the omp that started us never connected
}
await Bun.write(PID_FILE, String(process.pid));
console.log(`oomph listening on ${HOST}:${PORT}`);
