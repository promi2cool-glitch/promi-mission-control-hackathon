import { test } from "node:test";
import assert from "node:assert/strict";
import { XoClient } from "../../dist/xo/client.js";

function fakeFetch(handlers) {
  return async (url, init) => {
    const u = new URL(url);
    const handler = handlers[u.pathname];
    if (!handler) throw new Error(`no fake handler for ${u.pathname}`);
    return handler(url, init);
  };
}

test("health() reports ok on a 200 JSON response", async () => {
  const client = new XoClient({
    fetchImpl: fakeFetch({
      "/health": async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    }),
  });
  const health = await client.health();
  assert.equal(health.ok, true);
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: "ok" });
});

test("prompt() posts the request body and returns {stream_id, session_id}", async () => {
  let capturedBody = null;
  const client = new XoClient({
    fetchImpl: fakeFetch({
      "/api/chat/prompt": async (_url, init) => {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ stream_id: "st_1", session_id: "se_1" }), { status: 200 });
      },
    }),
  });
  const result = await client.prompt({ text: "hello", agent_name: "claude_code", agent_id: "mission-x" });
  assert.deepEqual(result, { stream_id: "st_1", session_id: "se_1" });
  assert.equal(capturedBody.text, "hello");
  assert.equal(capturedBody.agent_name, "claude_code");
  assert.equal(capturedBody.agent_id, "mission-x");
});

test("client never sends an Authorization or X-API-Key header", async () => {
  let seenHeaders = null;
  const client = new XoClient({
    fetchImpl: fakeFetch({
      "/health": async (_url, init) => {
        seenHeaders = init?.headers ?? {};
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      },
    }),
  });
  await client.health();
  assert.equal(seenHeaders.Authorization, undefined);
  assert.equal(seenHeaders["X-API-Key"], undefined);
});
