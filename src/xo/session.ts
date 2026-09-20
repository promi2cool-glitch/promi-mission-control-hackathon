import type { XoClient } from "./client.js";
import type { XoMessage, XoSession, XoUsage } from "./types.js";
import type { CommandRun, MissionAction } from "../mission/types.js";

export interface SessionHydration {
  session: XoSession | null;
  messages: XoMessage[];
  usage: XoUsage;
}

/** Pulls the session record, its full message history, and usage telemetry (best-effort) for one session_id. */
export async function hydrateSession(client: XoClient, sessionId: string): Promise<SessionHydration> {
  const [session, messagesResponse, usage] = await Promise.all([
    client.getSession(sessionId),
    client.getMessages(sessionId),
    client.getUsage(sessionId),
  ]);
  return { session, messages: messagesResponse.messages, usage };
}

/**
 * Normalizes observed tool calls from the session transcript into
 * MissionAction[] (every tool call) and CommandRun[] (Bash-tool calls
 * specifically). Field names below (`part.data.tool`, `.call_id`,
 * `.state.{status,input,output}`) were confirmed against a real completed
 * session's /api/messages response, not assumed — a message has no
 * top-level `role` (it's `message.data.role`) and a tool part has no
 * `name`/`input`/`result_text` (it's `data.tool`/`data.state.input`/
 * `data.state.output`).
 *
 * `exit_code` on a CommandRun is DERIVED from `state.status !== "completed"`
 * (0 = completed, 1 = anything else) because the transcript does not expose
 * a literal process exit code — documented here so it's never mistaken for
 * a captured OS exit status.
 */
export function normalizeMessagesToEvidence(messages: XoMessage[]): {
  actions: MissionAction[];
  commands_run: CommandRun[];
} {
  const actions: MissionAction[] = [];
  const commands_run: CommandRun[] = [];

  for (const message of messages) {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    for (const part of parts) {
      const data = part.data;
      if (!data || data.type !== "tool") continue;

      const toolName = data.tool ?? "unknown_tool";
      const state = data.state ?? {};
      const success = state.status === "completed";
      const input = state.input ?? {};
      const timestamp = part.time_created ?? message.time_created ?? new Date(0).toISOString();
      const output = typeof state.output === "string" ? state.output : "";

      const target =
        (typeof input.file_path === "string" && input.file_path) ||
        (typeof input.command === "string" && input.command) ||
        "";

      actions.push({
        timestamp,
        action_type: toolName,
        description:
          (typeof input.description === "string" && input.description) ||
          state.title ||
          `${toolName} tool call`,
        target,
        success,
        evidence_reference: data.call_id ?? null,
      });

      if (toolName === "Bash" && typeof input.command === "string") {
        commands_run.push({
          command: input.command,
          cwd: typeof input.cwd === "string" ? input.cwd : ".",
          exit_code: success ? 0 : 1,
          stdout_summary: success ? output.slice(0, 500) : "",
          stderr_summary: success ? "" : output.slice(0, 500),
        });
      }
    }
  }

  return { actions, commands_run };
}

/** Concatenates the text of the final assistant message, for a human-readable summary. */
export function extractFinalAssistantText(messages: XoMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.data?.role !== "assistant") continue;
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts
      .map((p) => (p.data?.type === "text" ? p.data.text ?? "" : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}
