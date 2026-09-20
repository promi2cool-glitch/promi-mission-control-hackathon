import { test } from "node:test";
import assert from "node:assert/strict";
import { XoClient } from "../../dist/xo/client.js";
import { runPrompt } from "../../dist/xo/dispatch.js";

function fakeFetch(handlers) {
  return async (url, init) => {
    const u = new URL(url);
    const handler = handlers[u.pathname];
    if (!handler) throw new Error(`no fake handler for ${u.pathname}`);
    return handler(url, init);
  };
}

function sseText(events) {
  return events.map(({ id, event, data }) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

test("runPrompt resolves session_id, keeps multiple text-deltas and a heartbeat as non-terminal, then reaches done", async () => {
  let abortCalled = false;
  const text = sseText([
    { id: 1, event: "session-created", data: { session_id: "se_1" } },
    { id: 2, event: "text-delta", data: { text: "hello" } },
    { id: 3, event: "text-delta", data: { text: " world" } },
    { id: 4, event: "heartbeat", data: {} },
    { id: 5, event: "done", data: { session_id: "se_1", finish_reason: "stop" } },
  ]);
  const client = new XoClient({
    fetchImpl: fakeFetch({
      "/api/chat/prompt": async () => new Response(JSON.stringify({ stream_id: "st_1", session_id: "se_1" }), { status: 200 }),
      "/api/chat/stream/st_1": async () => new Response(text, { status: 200 }),
      "/api/chat/abort": async () => {
        abortCalled = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    }),
  });

  const result = await runPrompt(client, { text: "hi", agent_name: "claude_code" }, { maxRuntimeSeconds: 30 });

  assert.equal(result.sessionId, "se_1");
  assert.equal(result.outcome.kind, "done");
  assert.equal(result.outcome.finishReason, "stop");
  assert.equal(result.events.filter((e) => e.type === "text-delta").length, 2);
  assert.equal(result.events.filter((e) => e.type === "heartbeat").length, 1);
  assert.equal(abortCalled, false, "abort must not be called on a clean done");
});

test("runPrompt surfaces an agent-error outcome", async () => {
  const text = sseText([{ id: 1, event: "agent-error", data: { error_message: "tool crashed" } }]);
  const client = new XoClient({
    fetchImpl: fakeFetch({
      "/api/chat/prompt": async () => new Response(JSON.stringify({ stream_id: "st_2", session_id: "se_2" }), { status: 200 }),
      "/api/chat/stream/st_2": async () => new Response(text, { status: 200 }),
      "/api/chat/abort": async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    }),
  });

  const result = await runPrompt(client, { text: "hi", agent_name: "claude_code" }, { maxRuntimeSeconds: 30 });

  assert.equal(result.outcome.kind, "agent-error");
  assert.equal(result.outcome.message, "tool crashed");
});

test("runPrompt times out and calls abort when max_runtime_seconds elapses without a done event", async () => {
  let abortCalled = false;
  function hangingStream(signal) {
    return new ReadableStream({
      start(controller) {
        signal?.addEventListener("abort", () => {
          controller.error(new DOMException("aborted", "AbortError"));
        });
      },
    });
  }
  const client = new XoClient({
    fetchImpl: fakeFetch({
      "/api/chat/prompt": async () => new Response(JSON.stringify({ stream_id: "st_3", session_id: "se_3" }), { status: 200 }),
      "/api/chat/stream/st_3": async (_url, init) => new Response(hangingStream(init?.signal), { status: 200 }),
      "/api/chat/abort": async () => {
        abortCalled = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    }),
  });

  const result = await runPrompt(client, { text: "hi", agent_name: "claude_code" }, { maxRuntimeSeconds: 0.05 });

  assert.equal(result.outcome.kind, "timeout");
  assert.equal(abortCalled, true, "abort must be called on timeout");
});
