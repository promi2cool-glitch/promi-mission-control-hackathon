import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFinalAssistantText, normalizeMessagesToEvidence } from "../../dist/xo/session.js";

// Shape confirmed against a real completed XO session's /api/messages response:
// a message has no top-level `role` (it's message.data.role), and a tool part
// has no `name`/`input`/`result_text` (it's data.tool/data.state.input/data.state.output).
const FIXTURE_MESSAGES = [
  {
    id: "m1",
    time_created: "2026-09-20T16:35:12.000Z",
    data: { role: "assistant" },
    parts: [{ data: { type: "text", text: "Let me look at the project." } }],
  },
  {
    id: "m2",
    time_created: "2026-09-20T16:35:15.000Z",
    data: { role: "assistant" },
    parts: [
      { data: { type: "text", text: "Running the tests." } },
      {
        time_created: "2026-09-20T16:35:15.008Z",
        data: {
          type: "tool",
          tool: "Bash",
          call_id: "toolu_1",
          state: {
            status: "completed",
            input: { command: "node --test demo_project/test", description: "run tests" },
            output: "16 pass\n0 fail",
            title: "Bash",
          },
        },
      },
    ],
  },
  {
    id: "m3",
    time_created: "2026-09-20T16:35:20.000Z",
    data: { role: "assistant" },
    parts: [
      {
        data: {
          type: "tool",
          tool: "Edit",
          call_id: "toolu_2",
          state: {
            status: "completed",
            input: { file_path: "demo_project/src/discountEngine.js" },
            output: "applied edit",
            title: "Edit",
          },
        },
      },
    ],
  },
  {
    id: "m4",
    time_created: "2026-09-20T16:35:25.000Z",
    data: { role: "assistant" },
    parts: [
      {
        data: {
          type: "tool",
          tool: "Bash",
          call_id: "toolu_3",
          state: {
            status: "error",
            input: { command: "node --test bad/path" },
            output: "cannot find module",
            title: "Bash",
          },
        },
      },
    ],
  },
  {
    id: "m5",
    time_created: "2026-09-20T16:35:30.000Z",
    data: { role: "assistant" },
    parts: [{ data: { type: "text", text: "Root cause: discount rounded per line instead of once on the subtotal. Fixed." } }],
  },
];

test("normalizeMessagesToEvidence extracts a MissionAction for every tool call", () => {
  const { actions } = normalizeMessagesToEvidence(FIXTURE_MESSAGES);
  assert.equal(actions.length, 3);
  assert.equal(actions[0].action_type, "Bash");
  assert.equal(actions[0].success, true);
  assert.equal(actions[0].evidence_reference, "toolu_1");
  assert.equal(actions[1].action_type, "Edit");
  assert.equal(actions[1].target, "demo_project/src/discountEngine.js");
  assert.equal(actions[2].action_type, "Bash");
  assert.equal(actions[2].success, false, "state.status !== 'completed' must map to success:false");
});

test("normalizeMessagesToEvidence extracts CommandRun entries only for Bash tool calls, with exit_code derived from status", () => {
  const { commands_run } = normalizeMessagesToEvidence(FIXTURE_MESSAGES);
  assert.equal(commands_run.length, 2);
  assert.equal(commands_run[0].command, "node --test demo_project/test");
  assert.equal(commands_run[0].exit_code, 0);
  assert.equal(commands_run[0].stdout_summary, "16 pass\n0 fail");
  assert.equal(commands_run[1].exit_code, 1);
  assert.equal(commands_run[1].stderr_summary, "cannot find module");
});

test("extractFinalAssistantText returns the last assistant message's concatenated text", () => {
  const text = extractFinalAssistantText(FIXTURE_MESSAGES);
  assert.match(text, /Root cause/);
});

test("normalizeMessagesToEvidence never invents a command that wasn't actually observed", () => {
  const { commands_run } = normalizeMessagesToEvidence(FIXTURE_MESSAGES);
  for (const c of commands_run) {
    assert.ok(FIXTURE_MESSAGES.some((m) => (m.parts || []).some((p) => p.data?.state?.input?.command === c.command)));
  }
});
