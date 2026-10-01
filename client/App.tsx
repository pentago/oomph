import { useEffect, useRef, useState } from "preact/hooks";
import type { ServerMsg, UiCommand, UiEvent, UiMessage, UiModel, UiSession, UiState } from "../shared";
import { Composer } from "./components/Composer";
import { Header } from "./components/Header";
import { Logo } from "./components/Logo";
import { MessageList } from "./components/messages/MessageList";
import type { LiveTool } from "./components/props";
import { Sidebar } from "./components/Sidebar";
import { TerminalPanel } from "./components/TerminalPanel";

type Active = { key: string; file?: string; cwd: string };

// Fold a live event into the message list. Streaming assistant messages are keyed by id and replaced when `msg` arrives.
function applyEvent(prev: UiMessage[], ev: UiEvent): UiMessage[] {
  switch (ev.type) {
    case "start":
      return [...prev, { id: ev.id, role: "assistant", parts: [] }];
    case "delta":
      return prev.map(m => {
        if (m.role !== "assistant" || m.id !== ev.id) return m;
        const parts = [...m.parts];
        const last = parts[parts.length - 1];
        if (last && last.type === ev.kind) parts[parts.length - 1] = { type: last.type, text: last.text + ev.text };
        else parts.push({ type: ev.kind, text: ev.text });
        return { ...m, parts };
      });
    case "msg":
      return prev.some(m => m.id === ev.id) ? prev.map(m => (m.id === ev.id ? ev.msg : m)) : [...prev, ev.msg];
    case "result":
      if (ev.status === "error") return [...prev, { role: "note", text: `error: ${ev.error ?? "unknown"}` }];
      return ev.status === "aborted" ? [...prev, { role: "note", text: "aborted" }] : prev;
    case "exited":
      return [...prev, { role: "note", text: "omp process exited" }];
    default:
      return prev;
  }
}

export function App() {
  const [items, setItems] = useState<UiSession[]>([]);
  const [cwds, setCwds] = useState<string[]>([]);
  const [newCwd, setNewCwd] = useState("");
  const [active, setActive] = useState<Active | null>(null);
  const [state, setState] = useState<UiState | null>(null);
  const [models, setModels] = useState<UiModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<UiModel | undefined>();
  const [commands, setCommands] = useState<UiCommand[]>([]);
  const [msgs, setMsgs] = useState<UiMessage[]>([]);
  const [liveTools, setLiveTools] = useState<Record<string, LiveTool>>({});
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;
  const starting = useRef(false);
  const termSink = useRef<((m: ServerMsg) => void) | null>(null);
  const [termLive, setTermLive] = useState(false); // a shell exists (panel mounted, maybe hidden)
  const [termOn, setTermOn] = useState(false); // panel visible
  const [conn, setConn] = useState(0); // bumps on every WebSocket open

  // A send during a reconnect window (server restart, phone waking up) must not vanish: queue and flush on open.
  // Queued opens replace older queued opens so only the latest clicked chat is ever opened.
  const outbox = useRef<object[]>([]);
  const send = (o: object) => {
    const w = ws.current;
    if (w?.readyState === WebSocket.OPEN) w.send(JSON.stringify(o));
    else {
      if ("t" in o && o.t === "open") {
        outbox.current = outbox.current.filter(m => !("t" in m && m.t === "open"));
      }
      outbox.current.push(o);
    }
  };

  useEffect(() => {
    let dead = false;
    let timer: number | undefined;
    const connect = () => {
      const w = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      ws.current = w;
      w.onopen = () => {
        setOnline(true);
        setConn(c => c + 1); // a shell dies with its socket, so the terminal restarts after a reconnect
        const out = outbox.current;
        outbox.current = [];
        const opened = out.some(m => "t" in m && m.t === "open");
        for (const m of out) w.send(JSON.stringify(m));
        w.send(JSON.stringify({ t: "list" }));
        const a = activeRef.current;
        if (a && !opened) w.send(JSON.stringify({ t: "open", ...a }));
      };
      w.onclose = () => {
        setOnline(false);
        if (!dead) timer = window.setTimeout(connect, 2000);
      };
      w.onmessage = e => {
        const m: ServerMsg = JSON.parse(e.data);
        if (m.t === "sessions") {
          setItems(m.items);
          setCwds(m.cwds);
          if (m.defaultModel) setDefaultModel(m.defaultModel);
        } else if (m.t === "opened") {
          starting.current = false;
          setActive({ key: m.key, file: m.file, cwd: m.cwd });
          setMsgs(m.history);
          setLiveTools({});
          setState(m.state ?? null);
          setBusy(m.streaming);
          setCommands(m.commands);
          w.send(JSON.stringify({ t: "list" }));
        } else if (m.t === "term" || m.t === "termExit") {
          termSink.current?.(m);
        } else if (m.t === "models") {
          setModels(m.items);
        } else if (m.t === "ev" && m.key === activeRef.current?.key) {
          const ev = m.ev;
          if (ev.type === "agent_start") setBusy(true);
          if (ev.type === "agent_end" && ev.terminal) setBusy(false);
          if (ev.type === "state") setState(ev.state);
          if (ev.type === "commands") setCommands(ev.items);
          if (ev.type === "tool_start") {
            setLiveTools(t => ({
              ...t,
              [ev.id]: { id: ev.id, name: ev.name, intent: ev.intent, args: ev.args, status: "running" },
            }));
          }
          if (ev.type === "tool_end") {
            setLiveTools(t => {
              const cur = t[ev.id];
              return cur ? { ...t, [ev.id]: { ...cur, status: ev.isError ? "error" : "done" } } : t;
            });
          }
          setMsgs(prev => applyEvent(prev, ev));
        } else if (m.t === "error") {
          starting.current = false;
          setMsgs(prev => [...prev, { role: "note", text: `error: ${m.error}` }]);
        }
      };
    };
    connect();
    // The list is only fetched on demand, so refresh it periodically and when the tab returns.
    const refresh = () => send({ t: "list" });
    const poll = setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      dead = true;
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      ws.current?.close();
    };
  }, []);

  const open = (item?: UiSession) => {
    // Another omp (e.g. your terminal) may still own a session touched in the last 2 minutes; two writers corrupt it.
    const recent = item && !item.running && Date.now() - item.mtime < 120_000;
    if (recent && !confirm("This session was active a moment ago and may be open in another omp. Open anyway?")) return;
    setMsgs([]);
    setDrawer(false);
    send({ t: "open", file: item?.file, cwd: item ? item.cwd : newCwd || cwds[0] });
  };

  // Deleting removes the chat file from omp itself, not just from this list; the row asks for confirmation first.
  const remove = (item: UiSession) => {
    send({ t: "delete", file: item.file });
    if (item.file === activeRef.current?.file) open();
  };

  // Focusing the composer with no chat open starts a new one; guard so focus + send can't double-open.
  const openNew = () => {
    if (activeRef.current || starting.current) return;
    starting.current = true;
    open();
  };

  // Model and thinking pickers need a live omp, so the new-chat view opens one as soon as the cwd list is known.
  useEffect(() => {
    if (online && cwds.length) openNew();
  }, [online, cwds.length]);

  const current = items.find(i => i.file === active?.file);
  const cost = msgs.reduce((sum, m) => sum + (m.role === "assistant" ? (m.usage?.cost ?? 0) : 0), 0);
  const welcome = !active || msgs.length === 0;
  return (
    <div class="flex h-dvh bg-bg-000 text-text-100">
      <Sidebar
        items={items}
        cwds={cwds}
        newCwd={newCwd || cwds[0] || ""}
        activeFile={active?.file}
        state={state}
        cost={cost}
        online={online}
        open={drawer}
        collapsed={collapsed}
        onOpen={open}
        onDelete={remove}
        onNew={() => open()}
        onSelectCwd={setNewCwd}
        onToggleCollapse={() => setCollapsed(c => !c)}
        onClose={() => setDrawer(false)}
      />
      <main class="flex min-w-0 flex-1 flex-col bg-bg-100">
        <Header
          title={active && !welcome ? current?.title || active.cwd : "oomph"}
          online={online}
          onOpenDrawer={() => setDrawer(true)}
        />
        {welcome ? (
          // Claude's new-chat view: heading and composer centered together, not docked.
          <>
            <div class="flex-1" />
            <div class="mb-6 flex flex-col items-center gap-4 px-4">
              <Logo size={40} />
              <h1 class="text-center font-[family-name:var(--font-chat)] text-[2.25rem] leading-tight text-text-100">
                What are we working on?
              </h1>
            </div>
          </>
        ) : (
          <MessageList msgs={msgs} liveTools={liveTools} busy={busy} />
        )}
        <Composer
          state={state}
          models={models}
          defaultModel={defaultModel}
          commands={commands}
          disabled={!active}
          busy={busy}
          onActivate={openNew}
          onSend={(text, images) => active && send({ t: "prompt", key: active.key, text, images })}
          onAbort={() => active && send({ t: "abort", key: active.key })}
          onSetThinking={level => active && send({ t: "setThinking", key: active.key, level })}
          onRequestModels={() => active && send({ t: "models", key: active.key })}
          onSetModel={(provider, modelId) => active && send({ t: "setModel", key: active.key, provider, modelId })}
          terminalOpen={termOn}
          onToggleTerminal={() => {
            setTermLive(true);
            setTermOn(on => !on);
          }}
        />
        {welcome && <div class="hidden flex-[1.4] md:block" />}
        {termLive && (
          <TerminalPanel
            key={conn}
            cwd={active?.cwd ?? cwds[0] ?? ""}
            visible={termOn}
            send={send}
            sink={termSink}
            onHide={() => setTermOn(false)}
            onExit={() => {
              setTermLive(false);
              setTermOn(false);
            }}
          />
        )}
      </main>
    </div>
  );
}
