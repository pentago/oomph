// The slice of the omp extension API that extension.ts uses. omp maps these imports to its own bundled modules at
// load time; the real package (with native addons) is too heavy to install just for types.
declare module "@oh-my-pi/pi-coding-agent" {
  export type Model = {
    id: string;
    name?: string;
    provider: string;
    contextWindow?: number;
    reasoning?: boolean;
    thinking?: { efforts?: string[] };
  };
  export type ExtensionContext = {
    cwd: string;
    hasUI: boolean;
    agent: { kind: "main" | "sub" };
    ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
    sessionManager: { getSessionFile(): string | undefined };
    model?: Model;
    models: { list(): Model[] };
    isIdle(): boolean;
    abort(): void;
    getContextUsage(): unknown;
  };
  // Payload fields of the agent/message/tool events oomph relays (see omp's extensions docs).
  export type AgentEvent = {
    message?: { role?: string; timestamp?: number };
    assistantMessageEvent?: { type?: string; delta?: string };
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    intent?: string;
    isError?: boolean;
  };
  export type ExtensionAPI = {
    registerCommand(
      name: string,
      command: { description: string; handler(args: string, ctx: ExtensionContext): Promise<void> },
    ): void;
    on(event: string, handler: (event: AgentEvent, ctx: ExtensionContext) => unknown): void;
    // A string or text parts plus image parts ({ type: "image", data: base64, mimeType }) — omp renders the
    // image parts as real image content for the model (verified against the omp 18.x extension API).
    sendUserMessage(
      content: string | ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[],
      options?: { deliverAs?: "steer" | "followUp" },
    ): void;
    setModel(model: Model): Promise<unknown>;
    getThinkingLevel(): string;
    setThinkingLevel(level: string): void;
    getSessionName(): string | undefined;
  };
}

declare module "@oh-my-pi/pi-coding-agent/extensibility/plugins" {
  export function getPluginSettings(name: string, cwd: string): Promise<Record<string, unknown>>;
  export class PluginManager {
    constructor(cwd?: string);
    setPluginSetting(name: string, key: string, value: unknown): Promise<void>;
  }
}
