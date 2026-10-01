// Prop contracts between App.tsx (state owner) and the three UI areas. Change these only via the integrator.
import type { UiCommand, UiImage, UiMessage, UiModel, UiSession, UiState } from "../../shared";

export type LiveTool = {
  id: string; // toolCallId, matches a `toolCall` part on an assistant message and the `tool` message that follows
  name: string;
  intent?: string;
  args: unknown;
  status: "running" | "done" | "error";
};

export type SidebarProps = {
  items: UiSession[];
  cwds: string[];
  newCwd: string; // cwd a "New chat" would use
  activeFile?: string;
  state: UiState | null; // active chat's state, for the footer menu's context usage
  cost: number; // total spend of the open chat, in USD
  online: boolean; // WebSocket connection state
  open: boolean; // mobile drawer is open
  collapsed: boolean; // desktop sidebar is collapsed
  onOpen: (item: UiSession) => void;
  onDelete: (item: UiSession) => void;
  onNew: () => void;
  onSelectCwd: (cwd: string) => void;
  onToggleCollapse: () => void;
  onClose: () => void; // mobile: close the drawer
};

export type HeaderProps = {
  title: string;
  online: boolean;
  onOpenDrawer: () => void; // mobile: show the sidebar drawer
};

export type MessageListProps = {
  msgs: UiMessage[];
  liveTools: Record<string, LiveTool>; // tools currently running or just finished in this chat, by toolCallId
  busy: boolean; // the agent is working
};

export type ComposerProps = {
  state: UiState | null;
  models: UiModel[];
  commands: UiCommand[]; // slash commands; empty in chats owned by a terminal
  defaultModel?: UiModel; // what the composer shows before any chat (and its state) exists
  busy: boolean;
  disabled: boolean; // no chat open; focusing the composer starts a new one
  onActivate: () => void;
  onSend: (text: string, images?: UiImage[]) => void;
  onAbort: () => void;
  onSetThinking: (level: string) => void;
  onRequestModels: () => void; // call when the model dropdown opens
  onSetModel: (provider: string, modelId: string) => void;
};
