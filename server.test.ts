// Smoke test: boots the real server against a temp config and checks what a browser relies on — login, the
// cross-site Origin guard, the auth gate on the app files, the WebSocket and the login lockout — plus the plugin's
// lifeline (oomph stops when the last omp holding it closes). Needs `bun run build` first (dist/).
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";

// The DOM lib (loaded for client/) hides Bun's WebSocket constructor, which also accepts request headers.
const BunWebSocket = WebSocket as unknown as new (url: string, options: Bun.WebSocketOptions) => WebSocket;

const PASSWORD = "smoke-test-password";
let dir: string;
let server: Subprocess<"ignore", "pipe", "inherit">;
let base: string;

// Start server.ts on a free port and resolve once it logs that it's listening.
async function boot(env: Record<string, string> = {}) {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  probe.stop(true);
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "server.ts")], {
    env: {
      ...process.env,
      OOMPH_CONFIG: join(dir, "cfg"),
      OMP_AGENT_DIR: join(dir, "agent"),
      OOMPH_PORT: String(port),
      ...env,
    },
    stdout: "pipe",
  });
  const reader = proc.stdout.getReader();
  let out = "";
  while (!out.includes("oomph listening")) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`server exited before listening: ${out}`);
    out += new TextDecoder().decode(value);
  }
  reader.releaseLock();
  return { proc, base: `http://127.0.0.1:${port}` };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oomph-test-"));
  await Bun.write(join(dir, "cfg", "password"), await Bun.password.hash(PASSWORD));
  ({ proc: server, base } = await boot());
});

afterAll(async () => {
  server.kill();
  await server.exited;
  await rm(dir, { recursive: true, force: true });
});

const login = (password: string, origin = base) =>
  fetch(`${base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { origin },
    body: new URLSearchParams({ password }),
  });

test("refuses cross-site and origin-less posts", async () => {
  expect((await login(PASSWORD, "http://evil.example")).status).toBe(403);
  expect(
    (await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ password: PASSWORD }) })).status,
  ).toBe(403);
});

test("app files need a login", async () => {
  expect((await fetch(`${base}/app.js`)).status).toBe(401);
  expect((await fetch(base, { redirect: "manual" })).headers.get("location")).toBe("/login");
});

test("login, then the app, its files and the WebSocket work", async () => {
  const res = await login(PASSWORD);
  expect(res.status).toBe(303);
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).not.toContain("Secure"); // plain-HTTP (LAN/VPN) logins must keep their cookie
  const cookie = setCookie.split(";")[0];

  for (const path of ["/", "/app.js", "/app.css", "/assets/theme-init.js"]) {
    expect((await fetch(`${base}${path}`, { headers: { cookie } })).status).toBe(200);
  }

  const ws = new BunWebSocket(`${base.replace("http", "ws")}/ws`, { headers: { cookie, origin: base } });
  const reply = new Promise<unknown>((resolve, reject) => {
    ws.onmessage = e => resolve(JSON.parse(String(e.data)));
    ws.onerror = () => reject(new Error("websocket failed"));
  });
  ws.onopen = () => ws.send(JSON.stringify({ t: "list" }));
  const m = (await reply) as { t: string; defaultModel?: { name: string } };
  expect(m).toMatchObject({ t: "sessions", items: [] });
  // With omp on PATH (a real machine) the composer gets the default model before any chat; CI has no omp, so
  // the probe gives up and the field is absent.
  if (Bun.which("omp")) expect(m.defaultModel?.name).toBeTruthy();
  ws.close();
});

test("lifeline: oomph stays up while any omp holds it and stops when the last one lets go", async () => {
  const socket = join(dir, "lifeline.sock");
  await Bun.write(join(dir, "cfg2", "password"), "unused"); // the server refuses to start without one
  const other = await boot({ OOMPH_LIFELINE: socket, OOMPH_CONFIG: join(dir, "cfg2") });
  const connect = () => Bun.connect({ unix: socket, socket: { data: () => {} } });
  const [first, second] = [await connect(), await connect()];

  first.end();
  // Still accepting holders after one left, so it didn't shut down early.
  const third = await connect();
  expect((await fetch(`${other.base}/login`)).status).toBe(200);

  second.end();
  third.end();
  expect(await other.proc.exited).toBe(0);
  expect(existsSync(socket)).toBe(false);
  expect(existsSync(join(dir, "cfg2", "pid"))).toBe(false);
});

test("a chat open in a terminal omp is served by that omp, not by a second one", async () => {
  // A fake terminal omp: holds the lifeline, claims a chat, answers commands like `omp --mode rpc`. CI has no omp, so
  // the server spawning its own omp for this chat would fail the test.
  const cfg = join(dir, "cfg3");
  const file = join(dir, "agent3", "sessions", "-p", "chat.jsonl");
  await Bun.write(join(cfg, "password"), await Bun.password.hash(PASSWORD));
  await Bun.write(file, `${JSON.stringify({ type: "session", id: "s1", cwd: dir })}\n`);
  const socket = join(dir, "bridge.sock");
  const srv = await boot({ OOMPH_LIFELINE: socket, OOMPH_CONFIG: cfg, OMP_AGENT_DIR: join(dir, "agent3") });

  const commands: { id?: string; type: string; message?: string }[] = [];
  const { promise: prompted, resolve: gotPrompt } = Promise.withResolvers<unknown>();
  // A real sender must survive partial writes (see extension.ts), or a big frame arrives cut off.
  const queue: Buffer[] = [];
  const flush = (s: Bun.Socket) => {
    while (queue[0]) {
      const n = s.write(queue[0]);
      if (n < queue[0].length) {
        queue[0] = queue[0].subarray(Math.max(n, 0));
        return;
      }
      queue.shift();
    }
  };
  const terminal = await Bun.connect({
    unix: socket,
    socket: {
      drain: flush,
      data(_s, chunk) {
        for (const line of String(chunk).split("\n").filter(Boolean)) {
          const c = JSON.parse(line);
          commands.push(c);
          const data =
            c.type === "get_state"
              ? { sessionFile: file, isStreaming: false, model: { id: "terminal-model", provider: "t" } }
              : { levels: ["off"] };
          if (c.id) send({ t: "frame", frame: { type: "response", id: c.id, success: true, data } });
          if (c.type === "prompt") gotPrompt(c);
        }
      },
    },
  });
  const send = (o: object) => {
    queue.push(Buffer.from(`${JSON.stringify(o)}\n`));
    if (queue.length === 1) flush(terminal);
  };
  expect(statSync(socket).mode & 0o777).toBe(0o600); // only this user can connect as a terminal
  send({ t: "claim", file });

  const res = await fetch(`${srv.base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: srv.base },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const ws = new BunWebSocket(`${srv.base.replace("http", "ws")}/ws`, { headers: { cookie, origin: srv.base } });
  const inbox: { t: string; key?: string; state?: unknown; ev?: { type: string; text?: string } }[] = [];
  const waiters: [(m: (typeof inbox)[number]) => boolean, (m: (typeof inbox)[number]) => void][] = [];
  ws.onmessage = e => {
    const m = JSON.parse(String(e.data));
    inbox.push(m);
    for (const [match, done] of waiters) if (match(m)) done(m);
  };
  const next = (match: (m: (typeof inbox)[number]) => boolean) => {
    const { promise, resolve } = Promise.withResolvers<(typeof inbox)[number]>();
    const hit = inbox.find(match);
    if (hit) resolve(hit);
    else waiters.push([match, resolve]);
    return promise;
  };
  const { promise: open, resolve: onOpen } = Promise.withResolvers();
  ws.onopen = onOpen;
  await open;

  ws.send(JSON.stringify({ t: "open", cwd: dir, file }));
  const opened = await next(m => m.t === "opened");
  expect(opened.state).toMatchObject({ model: { id: "terminal-model" } }); // state came from the terminal

  ws.send(JSON.stringify({ t: "prompt", key: opened.key, text: "hello from the browser" }));
  expect(await prompted).toMatchObject({ type: "prompt", message: "hello from the browser" });

  const out = (f: object) => send({ t: "frame", frame: f });
  out({ type: "message_start", messageId: "m1", message: { role: "assistant", content: [] } });
  out({ type: "message_update", messageId: "m1", assistantMessageEvent: { type: "text_delta", delta: "Hi" } });
  expect((await next(m => m.ev?.type === "delta")).ev).toMatchObject({ type: "delta", text: "Hi" });
  expect(commands.some(c => c.type === "get_state")).toBe(true);

  // A >1 MB final message arrives in many chunks and must come out whole (then truncated for the browser).
  const big = "x".repeat(1_500_000);
  out({ type: "message_end", messageId: "m1", message: { role: "assistant", content: [{ type: "text", text: big }] } });
  // omp can deliver a message's last update after its end; the end already has all the text.
  out({ type: "message_update", messageId: "m1", assistantMessageEvent: { type: "text_delta", delta: "LATE" } });
  out({ type: "agent_end" });
  const msg = await next(m => m.ev?.type === "msg");
  expect(JSON.stringify(msg.ev)).toContain("x".repeat(50_000));
  await next(m => m.ev?.type === "agent_end");
  expect(inbox.some(m => m.ev?.type === "delta" && m.ev.text === "LATE")).toBe(false);

  // Leave in the real order (browser first), so the server doesn't restart the chat on its own omp for a viewer.
  const { promise: closed, resolve: onClose } = Promise.withResolvers();
  ws.onclose = onClose;
  ws.close();
  await closed;
  terminal.end();
  expect(await srv.proc.exited).toBe(0);
});

// Last: a wrong password locks the login, so no test after this one can sign in.
test("a wrong password locks the login, even for the right one", async () => {
  expect((await login("wrong-password")).status).toBe(401);
  expect((await login(PASSWORD)).status).toBe(429);
});
