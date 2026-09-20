export interface XoWorkspaceRoots {
  roots: Record<string, string>;
  default: string;
}

export interface XoModel {
  id: string;
  name?: string;
  provider_id?: string;
  capabilities?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PromptRequest {
  text: string;
  agent_name: string;
  agent_id?: string;
  session_id?: string;
  agent_type?: string;
  model?: string;
}

export interface PromptResponse {
  stream_id: string;
  session_id: string;
}

/** Event names the running XO Space's SSE stream is known to emit. */
export const KNOWN_SSE_EVENT_TYPES = [
  "session-created",
  "text-delta",
  "heartbeat",
  "model-loading",
  "agent-error",
  "done",
  "error",
] as const;

export type KnownSseEventType = (typeof KNOWN_SSE_EVENT_TYPES)[number];
export type XoSseEventType = KnownSseEventType | "unknown";

/**
 * A normalized SSE event. `raw_type` preserves whatever the server actually
 * sent even when `type` falls back to "unknown" — so an event this adapter
 * doesn't recognize is preserved rather than dropped or crashing the parser.
 */
export interface XoSseEvent {
  type: XoSseEventType;
  raw_type: string;
  id: string | null;
  data: unknown;
  parse_error: string | null;
  received_at: string;
}

export type StreamOutcome =
  | { kind: "done"; sessionId: string | null; finishReason: string | null }
  | { kind: "agent-error"; message: string }
  | { kind: "timeout" }
  | { kind: "stream-error"; message: string };

export interface XoSession {
  id: string;
  title?: string;
  directory?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface XoToolState {
  status?: string;
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  time_start?: string;
  time_end?: string;
  [key: string]: unknown;
}

/**
 * A message part's `data` shape, confirmed against a real running session
 * (not assumed): text parts are `{type:"text", text}`; tool parts are
 * `{type:"tool", tool, call_id, state}` where `state.status`/`state.input`/
 * `state.output` carry the actual observed tool call, not `name`/`input`/
 * `result_text`/`is_error` as might be guessed from other transcript formats.
 */
export interface XoMessagePartData {
  type?: string;
  text?: string;
  tool?: string;
  call_id?: string;
  state?: XoToolState;
  [key: string]: unknown;
}

export interface XoMessagePart {
  id?: string;
  message_id?: string;
  session_id?: string;
  time_created?: string;
  data?: XoMessagePartData;
  [key: string]: unknown;
}

/** A message's own `data.role` (e.g. "assistant"/"user") — there is no top-level `role` field. */
export interface XoMessageData {
  role?: string;
  model_id?: string;
  finish?: string;
  error?: unknown;
  [key: string]: unknown;
}

export interface XoMessage {
  id?: string;
  session_id?: string;
  time_created?: string;
  data?: XoMessageData;
  parts?: XoMessagePart[];
  [key: string]: unknown;
}

export interface XoMessagesResponse {
  total: number;
  offset: number;
  messages: XoMessage[];
}

export interface XoUsage {
  available: boolean;
  raw: unknown;
}
