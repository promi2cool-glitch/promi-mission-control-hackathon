import type { XoClient } from "./client.js";
import { consumeSseStream } from "./sse.js";
import type { PromptRequest, StreamOutcome, XoSseEvent } from "./types.js";

export interface RunPromptOptions {
  /** From mission.constraints.max_runtime_seconds — bounds the whole prompt+stream turn. */
  maxRuntimeSeconds: number;
}

export interface RunPromptResult {
  streamId: string;
  sessionId: string | null;
  events: XoSseEvent[];
  outcome: StreamOutcome;
  durationMs: number;
}

/**
 * Dispatches one prompt and consumes its SSE stream until a terminal event
 * (`done`, `agent-error`, generic `error`) or the mission's
 * max_runtime_seconds elapses. `heartbeat`, `text-delta`, and `model-loading`
 * never end the stream — only an explicit `done` counts as completion.
 *
 * On timeout, the fetch is aborted (which unblocks the pending read on our
 * side) and POST /api/chat/abort is called per the documented contract —
 * best-effort, since abort() only clears server-side bookkeeping for a
 * stream that hasn't been opened yet; it does not guarantee killing an
 * already-running worker subprocess.
 */
export async function runPrompt(
  client: XoClient,
  request: PromptRequest,
  options: RunPromptOptions,
): Promise<RunPromptResult> {
  const startedAt = Date.now();
  const { stream_id, session_id } = await client.prompt(request);

  const events: XoSseEvent[] = [];
  let resolvedSessionId: string | null = session_id ?? null;
  let outcome: StreamOutcome | null = null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("max_runtime_seconds exceeded")), options.maxRuntimeSeconds * 1000);

  try {
    const response = await client.openStream(stream_id, controller.signal);

    for await (const event of consumeSseStream(response)) {
      events.push(event);

      if (event.type === "session-created") {
        const sid = (event.data as { session_id?: string } | null)?.session_id;
        if (sid) resolvedSessionId = sid;
      } else if (event.type === "done") {
        const data = event.data as { session_id?: string; finish_reason?: string } | null;
        if (data?.session_id) resolvedSessionId = data.session_id;
        outcome = { kind: "done", sessionId: resolvedSessionId, finishReason: data?.finish_reason ?? null };
        break;
      } else if (event.type === "agent-error") {
        const data = event.data as { error_message?: string } | null;
        outcome = { kind: "agent-error", message: data?.error_message ?? "unknown agent error" };
        break;
      } else if (event.type === "error") {
        const data = event.data;
        const message =
          typeof data === "string"
            ? data
            : (data as { error_message?: string } | null)?.error_message ?? "unknown stream error";
        outcome = { kind: "stream-error", message };
        break;
      }
      // heartbeat, text-delta, model-loading, unknown: keep consuming.
    }

    if (outcome === null) {
      outcome = { kind: "stream-error", message: "stream ended without a done, agent-error, or error event" };
    }
  } catch (err) {
    if (controller.signal.aborted) {
      outcome = { kind: "timeout" };
    } else {
      outcome = { kind: "stream-error", message: err instanceof Error ? err.message : String(err) };
    }
  } finally {
    clearTimeout(timer);
    if (outcome?.kind === "timeout") {
      await client.abort(stream_id).catch(() => {
        /* best-effort: abort is documented but not guaranteed to stop an in-flight worker */
      });
    }
  }

  return {
    streamId: stream_id,
    sessionId: resolvedSessionId,
    events,
    outcome,
    durationMs: Date.now() - startedAt,
  };
}
