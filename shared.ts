// Wire contract between server.ts and the client. Types only: the server produces these, the client renders them.

export type UiPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "toolCall"; id: string; name: string; intent?: string; args: unknown };

export type UiUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
};

// Timestamps are epoch milliseconds: `timestamp` is when the message was created, `completedAt` when it was persisted
// or finished streaming. Large strings are truncated server-side (text ~20-50k chars, tool args 4k, details 20k);
// oversized args/details arrive as `{ _truncated: string }`.
export type UiMessage =
  | { id?: string; role: "user"; text: string; timestamp?: number; completedAt?: number }
  | {
      id?: string;
      role: "assistant";
      parts: UiPart[];
      timestamp?: number;
      completedAt?: number;
      provider?: string;
      model?: string;
      usage?: UiUsage;
      stopReason?: string;
      errorMessage?: string;
    }
  | {
      id?: string;
      role: "tool";
      toolCallId: string;
      name: string;
      isError: boolean;
      text: string;
      details?: unknown;
      timestamp?: number;
      completedAt?: number;
    }
  | { id?: string; role: "note"; text: string; timestamp?: number; completedAt?: number };

export type UiModel = { provider: string; id: string; name: string; contextWindow: number; reasoning: boolean };
// An image attached to a prompt: base64 (no data: prefix), delivered to the model as real image content.
export type UiImage = { type: "image"; data: string; mimeType: string };

export type UiState = {
  model?: UiModel;
  thinkingLevel: string; // "off" | "low" | "medium" | "high" | "xhigh" | "max"
  thinkingLevels: string[]; // levels valid for the current model, "off" first
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
  streaming: boolean;
  sessionName?: string;
};

export type UiCommand = { name: string; description?: string };

export type UiEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; terminal: boolean }
  | { type: "start"; id: string } // an assistant message began streaming
  | { type: "delta"; id: string; kind: "text" | "thinking"; text: string }
  | { type: "msg"; id: string; msg: UiMessage } // a message finished; replaces any streamed message with the same id
  | { type: "tool_start"; id: string; name: string; intent?: string; args: unknown } // id = toolCallId
  | { type: "tool_end"; id: string; isError: boolean }
  | { type: "state"; state: UiState }
  | { type: "result"; status?: string; error?: string }
  | { type: "commands"; items: UiCommand[] } // slash commands the session's omp offers (child-owned chats only)
  | { type: "exited" };

export type UiSession = {
  file: string;
  mtime: number;
  title?: string;
  cwd: string;
  messages: number;
  running: boolean;
};

export type ServerMsg =
  | { t: "sessions"; items: UiSession[]; cwds: string[]; defaultModel?: UiModel }
  | {
      t: "opened";
      key: string;
      file?: string;
      cwd: string;
      streaming: boolean;
      history: UiMessage[];
      state?: UiState;
      commands: UiCommand[];
    }
  | { t: "ev"; key: string; ev: UiEvent }
  | { t: "models"; items: UiModel[] }
  | { t: "error"; error: string };

export type ClientMsg =
  | { t: "list" }
  | { t: "open"; cwd?: string; file?: string; key?: string }
  | { t: "prompt"; key: string; text: string; images?: UiImage[] }
  | { t: "abort"; key: string }
  | { t: "models"; key: string }
  | { t: "setModel"; key: string; provider: string; modelId: string }
  | { t: "setThinking"; key: string; level: string };
