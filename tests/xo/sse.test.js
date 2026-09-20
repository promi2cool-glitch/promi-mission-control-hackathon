import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSseEventBlock, SseBuffer, consumeSseStream } from "../../dist/xo/sse.js";

test("parses a session-created event", () => {
  const event = parseSseEventBlock('id: 1\nevent: session-created\ndata: {"session_id":"abc"}');
  assert.equal(event.type, "session-created");
  assert.deepEqual(event.data, { session_id: "abc" });
  assert.equal(event.parse_error, null);
});

test("parses multiple text-delta events via SseBuffer, in order", () => {
  const buffer = new SseBuffer();
  const chunk =
    'id: 1\nevent: text-delta\ndata: {"text":"Hello"}\n\n' +
    'id: 2\nevent: text-delta\ndata: {"text":" world"}\n\n';
  const events = buffer.push(chunk);
  assert.equal(events.length, 2);
  assert.equal(events[0].data.text, "Hello");
  assert.equal(events[1].data.text, " world");
  assert.ok(events.every((e) => e.type === "text-delta"));
});

test("heartbeat is classified distinctly from text-delta (never assistant output)", () => {
  const event = parseSseEventBlock("event: heartbeat\ndata: {}");
  assert.equal(event.type, "heartbeat");
  assert.notEqual(event.type, "text-delta");
});

test("parses a done event with finish_reason and session_id", () => {
  const event = parseSseEventBlock('id: 9\nevent: done\ndata: {"finish_reason":"stop","session_id":"s1"}');
  assert.equal(event.type, "done");
  assert.equal(event.data.finish_reason, "stop");
  assert.equal(event.data.session_id, "s1");
});

test("parses an agent-error event", () => {
  const event = parseSseEventBlock('id: 3\nevent: agent-error\ndata: {"error_message":"boom"}');
  assert.equal(event.type, "agent-error");
  assert.equal(event.data.error_message, "boom");
});

test("a malformed (non-JSON) data payload does not throw and is preserved with parse_error set", () => {
  const event = parseSseEventBlock('id: 4\nevent: text-delta\ndata: {not valid json');
  assert.equal(event.type, "text-delta");
  assert.equal(event.data, "{not valid json");
  assert.ok(event.parse_error);
});

test("an unrecognized event name is tolerated and preserved as type 'unknown'", () => {
  const event = parseSseEventBlock('id: 5\nevent: some-future-event\ndata: {"whatever":true}');
  assert.equal(event.type, "unknown");
  assert.equal(event.raw_type, "some-future-event");
  assert.deepEqual(event.data, { whatever: true });
});

test("consumeSseStream yields normalized events from a real Response body", async () => {
  const text =
    'id: 1\nevent: session-created\ndata: {"session_id":"s1"}\n\n' +
    'id: 2\nevent: text-delta\ndata: {"text":"hi"}\n\n' +
    'id: 3\nevent: done\ndata: {"session_id":"s1","finish_reason":"stop"}\n\n';
  const response = new Response(text, { status: 200 });
  const events = [];
  for await (const event of consumeSseStream(response)) {
    events.push(event);
  }
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((e) => e.type),
    ["session-created", "text-delta", "done"],
  );
});
