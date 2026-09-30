// oomph as an omp plugin. The web server runs as a separate process (so Ctrl+C in omp's terminal can't take it down),
// but it lives only while an interactive omp holds a connection to its lifeline socket: the last omp to close stops
// it. With autostart on (the default), every interactive omp starts it or joins the running one.
// The same connection bridges this omp's open chat to browsers, so a chat open in the terminal is served by the
// terminal's own omp instead of a second omp process (two writers would fork the session file).
// Host/port: `omp plugin config set @dzhi/oomph <host|port> <value>`, then `/oomph restart`.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, ExtensionAPI, ExtensionContext, Model } from "@oh-my-pi/pi-coding-agent";
import { getPluginSettings, PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins";
import pkg from "./package.json";

const CONF_DIR = process.env.OOMPH_CONFIG ?? join(homedir(), ".config", "oomph"); // same default as server.ts
const PW_FILE = join(CONF_DIR, "password");
const PID_FILE = join(CONF_DIR, "pid"); // written by server.ts once it listens, removed when it stops
const LOG_FILE = join(CONF_DIR, "server.log");
const LIFELINE = join(CONF_DIR, "lifeline.sock");

let omp: ExtensionAPI | undefined;
let live: ExtensionContext | undefined; // this omp's main interactive session, as of the latest event
let held: Bun.Socket | undefined; // this omp's connection to the server; the OS drops it when omp exits
let claimed: string | undefined; // chat file last announced to the server
let ended: string | undefined; // last message that ended; omp can deliver its final update after the end

// Extension events carry no message id; a message's own timestamp stays the same across its start, updates and end.
const idOf = (e: AgentEvent) => `t${e.message?.timestamp}`;

// Socket writes can be partial when the kernel buffer is full (a big message or tool result); keep the unsent tail
// and finish it on `drain`, or the server would get a cut-off JSON line.
const out: Buffer[] = [];
function send(o: object) {
  if (!held) return;
  const b = Buffer.from(`${JSON.stringify(o)}\n`);
  if (out.length) return void out.push(b);
  const n = held.write(b);
  if (n < b.length) out.push(b.subarray(Math.max(n, 0)));
}
function flush(s: Bun.Socket) {
  while (out[0]) {
    const n = s.write(out[0]);
    if (n < out[0].length) {
      out[0] = out[0].subarray(Math.max(n, 0));
      return;
    }
    out.shift();
  }
}
const frame = (f: object) => send({ t: "frame", frame: f });

// Tell the server which chat this omp has open: on connect, and whenever it changes (/new, /resume, fork, ...).
function claim() {
  const file = live?.sessionManager.getSessionFile();
  if (!held || !file || file === claimed) return;
  claimed = file;
  send({ t: "claim", file });
}

// Join the server started by the plugin. One without a lifeline socket (`bun server.ts`) can't be joined; its
// lifetime is its own business and its chats run on its own omp processes.
async function hold() {
  if (held) return true;
  const dec = new TextDecoder();
  let buf = "";
  held = await Bun.connect({
    unix: LIFELINE,
    socket: {
      data(_s, chunk) {
        buf += dec.decode(chunk, { stream: true });
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          try {
            void command(JSON.parse(line));
          } catch {}
        }
      },
      drain: flush,
      close() {
        held = undefined;
        claimed = undefined;
        out.length = 0;
      },
    },
  }).catch(() => undefined);
  claim();
  return held !== undefined;
}

const info = (m: Model) => ({
  id: m.id,
  name: m.name,
  provider: m.provider,
  contextWindow: m.contextWindow,
  reasoning: m.reasoning,
});

// A browser's command for this omp's chat, in `omp --mode rpc` shape; replies go back as rpc `response` frames.
async function command(c: {
  id?: string;
  type?: string;
  message?: unknown;
  images?: unknown;
  level?: unknown;
  provider?: unknown;
  modelId?: unknown;
}) {
  const ctx = live;
  if (!ctx || !omp) return;
  const reply = (data?: unknown, error?: string) => {
    if (c.id) frame({ type: "response", id: c.id, success: !error, data, error });
  };
  try {
    switch (c.type) {
      case "prompt": {
        // Images arrive as { type: "image", data: base64, mimeType } parts; omp sends them to the model
        // as real image content alongside the text.
        const images: { type: "image"; data: string; mimeType: string }[] = [];
        if (Array.isArray(c.images))
          for (const p of c.images)
            if (p && typeof p === "object" && "data" in p && typeof p.data === "string")
              images.push({
                type: "image",
                data: p.data,
                mimeType: "mimeType" in p && typeof p.mimeType === "string" ? p.mimeType : "image/png",
              });
        const content: Parameters<typeof omp.sendUserMessage>[0] = images.length
          ? [{ type: "text", text: String(c.message) }, ...images]
          : String(c.message);
        omp.sendUserMessage(content, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
        return;
      }
      case "abort":
        ctx.abort();
        return;
      case "get_state":
        return reply({
          sessionFile: ctx.sessionManager.getSessionFile(),
          isStreaming: !ctx.isIdle(),
          model: ctx.model && info(ctx.model),
          thinkingLevel: omp.getThinkingLevel(),
          contextUsage: ctx.getContextUsage(),
          sessionName: omp.getSessionName(),
        });
      case "get_available_thinking_levels":
        return reply({ levels: ["off", ...(ctx.model?.reasoning ? (ctx.model.thinking?.efforts ?? []) : [])] });
      case "get_available_models":
        return reply({ models: ctx.models.list().map(info) });
      case "set_model": {
        const model = ctx.models.list().find(m => m.provider === c.provider && m.id === c.modelId);
        if (!model) return reply(undefined, "unknown model");
        await omp.setModel(model);
        return reply();
      }
      case "set_thinking_level":
        omp.setThinkingLevel(String(c.level));
        return reply();
      default:
        return reply(undefined, `unsupported command: ${c.type}`);
    }
  } catch (e) {
    reply(undefined, e instanceof Error ? e.message : String(e));
  }
}

// omp returns only values the user set; defaults live in the package.json manifest.
async function config(cwd: string) {
  const s = await getPluginSettings(pkg.name, cwd);
  const d = pkg.omp.settings;
  return {
    host: String(s.host ?? d.host.default),
    port: Number(s.port ?? d.port.default),
    autostart: (s.autostart ?? d.autostart.default) !== false,
  };
}

// Any HTTP answer means it's up; both host choices listen on loopback.
const up = (port: number) =>
  fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(1000) }).then(
    () => true,
    () => false,
  );

// Random, so there's no weak-password setup step. Replacing the hash also signs out every browser.
async function newPassword() {
  const password = randomBytes(18).toString("base64url");
  await mkdir(CONF_DIR, { recursive: true, mode: 0o700 });
  await Bun.write(PW_FILE, await Bun.password.hash(password), { mode: 0o600 });
  await chmod(PW_FILE, 0o600); // Bun.write only applies mode when it creates the file
  return password;
}

async function start(ctx: ExtensionContext, quiet = false) {
  live = ctx;
  const { host, port } = await config(ctx.cwd);
  if (await up(port)) {
    if (await hold()) {
      if (!quiet) ctx.ui.notify(`oomph is already running on port ${port}`, "info");
      return;
    }
    // Answers but can't be joined. With a pid file it's a server started outside omp: leave it alone. Without one
    // it's our server shutting down because the last omp just closed: wait for it to go, then start a fresh one.
    if (await Bun.file(PID_FILE).exists()) {
      if (!quiet) ctx.ui.notify(`oomph is already running on port ${port} (started outside omp)`, "info");
      return;
    }
    for (let i = 0; i < 30 && (await up(port)); i++) await Bun.sleep(100);
  }
  const password = (await Bun.file(PW_FILE).exists()) ? undefined : await newPassword();
  const log = await open(LOG_FILE, "w");
  const child = spawn(process.execPath, [join(import.meta.dir, "server.ts")], {
    cwd: homedir(),
    detached: true, // own process group: Ctrl+C in omp's terminal doesn't reach it
    stdio: ["ignore", log.fd, log.fd],
    // omp is a compiled Bun binary; BUN_BE_BUN makes it run server.ts as plain Bun (server.ts unsets it again).
    env: { ...process.env, BUN_BE_BUN: "1", OOMPH_HOST: host, OOMPH_PORT: String(port), OOMPH_LIFELINE: LIFELINE },
  });
  child.unref();
  await log.close();
  let ok = false;
  for (let i = 0; i < 30 && child.exitCode === null; i++) {
    ok = await up(port);
    if (ok) break;
    await Bun.sleep(100);
  }
  if (ok) await hold();
  const where = host === "0.0.0.0" ? `port ${port} on all interfaces` : `http://${host}:${port}`;
  const lines = [ok ? `oomph running at ${where}` : `oomph failed to start, see ${LOG_FILE}`];
  if (password) lines.push(`Password: ${password}  (shown once; /oomph passwd makes a new one)`);
  ctx.ui.notify(lines.join("\n"), ok ? "info" : "error");
}

async function stop(ctx: ExtensionContext) {
  const { port } = await config(ctx.cwd);
  const pid = Number(
    await Bun.file(PID_FILE)
      .text()
      .catch(() => ""),
  );
  // ponytail: pidfile + port probe, so a stale pid (crash, reboot) is only signalled while something answers on our
  // port. A server started with another OOMPH_CONFIG is invisible here; stop that one yourself.
  if (!pid || !(await up(port))) return ctx.ui.notify("oomph is not running", "info");
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 30 && (await up(port)); i++) await Bun.sleep(100);
  ctx.ui.notify("oomph stopped", "info");
}

const USAGE = "/oomph [status|start|stop|restart|passwd|autostart [on|off]]";

export default function oomph(pi: ExtensionAPI) {
  omp = pi;
  pi.registerCommand("oomph", {
    description: `oomph web UI: ${USAGE}`,
    async handler(args, ctx) {
      const [cmd = "status", arg] = args.trim().split(/\s+/).filter(Boolean);
      if (cmd === "start") await start(ctx);
      else if (cmd === "stop") await stop(ctx);
      else if (cmd === "restart") {
        await stop(ctx);
        await start(ctx);
      } else if (cmd === "passwd") {
        ctx.ui.notify(`New oomph password: ${await newPassword()}  (all browsers are signed out)`, "info");
      } else if (cmd === "status") {
        const { host, port, autostart } = await config(ctx.cwd);
        const state = (await up(port)) ? `running on port ${port} (setting: ${host})` : "not running";
        ctx.ui.notify(`oomph is ${state}; autostart ${autostart ? "on" : "off"}`, "info");
      } else if (cmd === "autostart" && (arg === "on" || arg === "off")) {
        // Same store as `omp plugin config set @dzhi/oomph autostart <bool>`.
        await new PluginManager(ctx.cwd).setPluginSetting(pkg.name, "autostart", arg === "on");
        ctx.ui.notify(`oomph autostart ${arg}`, "info");
      } else if (cmd === "autostart" && !arg) {
        ctx.ui.notify(`oomph autostart ${(await config(ctx.cwd)).autostart ? "on" : "off"}`, "info");
      } else ctx.ui.notify(`Usage: ${USAGE}`, "error");
    },
  });

  // Only the user's own interactive session: not subagents, print mode, or the `--no-ui` RPC children oomph spawns.
  const main = (ctx: ExtensionContext) => ctx.hasUI && ctx.agent.kind === "main";

  // Nothing here may throw into omp: an oomph problem must never break the terminal session.
  pi.on("session_start", async (_e, ctx) => {
    if (!main(ctx)) return;
    live = ctx;
    try {
      if ((await config(ctx.cwd)).autostart) await start(ctx, true);
      else await hold(); // join a server that's already running, if any
    } catch (e) {
      ctx.ui.notify(`oomph: ${e instanceof Error ? e.message : e}`, "warning");
    }
  });

  // Relay this omp's chat as `omp --mode rpc` frames, so the server serves it like one of its own omp processes.
  // Rejoining here also picks up a server restarted from another omp.
  // ponytail: frames are sent even when no browser has this chat open; the server drops them. Add a watch/unwatch
  // message if the socket traffic ever matters.
  const relay = (event: string, toFrame: (e: AgentEvent) => object | undefined) =>
    pi.on(event, (e, ctx) => {
      if (!main(ctx)) return;
      live = ctx;
      try {
        if (!held && existsSync(LIFELINE)) hold().catch(() => {});
        claim();
        const f = toFrame(e);
        if (f) frame(f);
      } catch {} // the browser misses one event at worst; the terminal session must not see an error
    });
  relay("session_switch", () => undefined); // claim() announces the new chat
  relay("agent_start", () => ({ type: "agent_start" }));
  relay("agent_end", () => ({ type: "agent_end" }));
  relay("turn_end", () => ({ type: "turn_end" }));
  relay("message_start", e => ({ type: "message_start", messageId: idOf(e), message: e.message }));
  // A late update for a message that already ended would duplicate text: the end already carries all of it.
  relay("message_update", e =>
    idOf(e) === ended
      ? undefined
      : {
          type: "message_update",
          messageId: idOf(e),
          assistantMessageEvent: { type: e.assistantMessageEvent?.type, delta: e.assistantMessageEvent?.delta },
        },
  );
  relay("message_end", e => {
    ended = idOf(e);
    return { type: "message_end", messageId: ended, message: e.message };
  });
  relay("tool_execution_start", e => ({
    type: "tool_execution_start",
    toolCallId: e.toolCallId,
    toolName: e.toolName,
    args: e.args,
    intent: e.intent,
  }));
  relay("tool_execution_end", e => ({ type: "tool_execution_end", toolCallId: e.toolCallId, isError: e.isError }));
}
