import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMission } from "../dist/mission/validate.js";
import { isValidStateTransition } from "../dist/mission/schema.js";
import { parseMissionResult, parseVerificationResult } from "../dist/mission/result.js";

function baseMission(overrides = {}) {
  return {
    schema_version: "1.0",
    mission_id: "mis_001",
    created_at: "2026-09-20T00:00:00.000Z",
    project: {
      id: "promi-mission-control-hackathon",
      name: "Promi Mission Control",
      root: "demo_project",
      description: "sanitized demo",
    },
    goal: "Fix the demo bug.",
    context: { summary: "demo", relevant_files: [], notes: [] },
    permissions: { read_files: true, modify_files: true, run_commands: true, run_tests: true },
    constraints: {
      allowed_paths: ["demo_project/**"],
      forbidden_paths: ["../**"],
      allowed_commands: [],
      forbidden_commands: [],
      max_runtime_seconds: 600,
    },
    definition_of_done: ["failing test passes"],
    metadata: { requested_by: "promi", tags: ["demo"] },
    ...overrides,
  };
}

test("valid mission is accepted", () => {
  const outcome = validateMission(baseMission());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.mission.mission_id, "mis_001");
});

test("missing mission_id is rejected", () => {
  const raw = baseMission();
  delete raw.mission_id;
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "mission_id"));
});

test("empty goal is rejected", () => {
  const outcome = validateMission(baseMission({ goal: "" }));
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "goal"));
});

test("missing permission fields default to false (deny-by-default)", () => {
  const raw = baseMission({ permissions: { read_files: true } });
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.mission.permissions.deploy, false);
  assert.equal(outcome.mission.permissions.external_send, false);
  assert.equal(outcome.mission.permissions.financial_action, false);
  assert.equal(outcome.mission.permissions.commit, false);
  assert.equal(outcome.mission.permissions.merge, false);
  assert.equal(outcome.mission.permissions.read_files, true);
});

test("non-boolean permission value is rejected, not silently coerced", () => {
  const raw = baseMission({ permissions: { deploy: "true" } });
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "permissions.deploy"));
});

test("unsupported schema_version is rejected", () => {
  const outcome = validateMission(baseMission({ schema_version: "99.0" }));
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "schema_version"));
});

test("empty definition_of_done is rejected", () => {
  const outcome = validateMission(baseMission({ definition_of_done: [] }));
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "definition_of_done"));
});

test("non-array allowed_paths is rejected", () => {
  const raw = baseMission();
  raw.constraints.allowed_paths = "demo_project/**";
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "constraints.allowed_paths"));
});

test("unreasonable max_runtime_seconds is rejected", () => {
  const raw = baseMission();
  raw.constraints.max_runtime_seconds = 10_000_000;
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "constraints.max_runtime_seconds"));
});

test("missing project is rejected", () => {
  const raw = baseMission();
  delete raw.project;
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "project"));
});

test("valid state transition is accepted", () => {
  assert.equal(isValidStateTransition("CREATED", "QUEUED"), true);
  assert.equal(isValidStateTransition("RUNNING", "TESTING"), true);
  assert.equal(isValidStateTransition("VERIFYING", "COMPLETED"), true);
});

test("invalid state transition is rejected", () => {
  assert.equal(isValidStateTransition("CREATED", "COMPLETED"), false);
  assert.equal(isValidStateTransition("COMPLETED", "RUNNING"), false);
  assert.equal(isValidStateTransition("QUEUED", "VERIFYING"), false);
});

function baseMissionResult(overrides = {}) {
  return {
    schema_version: "1.0",
    mission_id: "mis_001",
    status: "COMPLETED",
    started_at: "2026-09-20T00:00:00.000Z",
    finished_at: "2026-09-20T00:05:00.000Z",
    summary: "Fixed the rounding bug.",
    plan: ["reproduce", "diagnose", "fix", "test"],
    actions: [
      {
        timestamp: "2026-09-20T00:01:00.000Z",
        action_type: "edit_file",
        description: "fixed discount rounding order",
        target: "demo_project/src/discountEngine.js",
        success: true,
        evidence_reference: null,
      },
    ],
    files_changed: [
      { path: "demo_project/src/discountEngine.js", change_type: "modified", before_hash: "abc", after_hash: "def" },
    ],
    commands_run: [
      { command: "node --test demo_project/test", cwd: ".", exit_code: 0, stdout_summary: "16 pass", stderr_summary: "" },
    ],
    tests: {
      before: { total: 16, passed: 15, failed: 1, skipped: 0 },
      after: { total: 16, passed: 16, failed: 0, skipped: 0 },
    },
    artifacts: [],
    errors: [],
    xo: { session_id: "ses_1", duration_ms: 1234, usage: null },
    worker_claim: "COMPLETED",
    ...overrides,
  };
}

test("valid MissionResult parses correctly", () => {
  const outcome = parseMissionResult(baseMissionResult());
  assert.equal(outcome.ok, true);
  assert.equal(outcome.value.worker_claim, "COMPLETED");
});

test("MissionResult with invalid worker_claim is rejected", () => {
  const outcome = parseMissionResult(baseMissionResult({ worker_claim: "DONE" }));
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "worker_claim"));
});

test("valid VerificationResult shape is accepted", () => {
  const outcome = parseVerificationResult({
    mission_id: "mis_001",
    verdict: "PASS",
    checks: [
      { name: "targeted test passes", passed: true, required: true, evidence: "test output", reason: "" },
    ],
    summary: "All required checks passed.",
    evidence: ["test output"],
    violations: [],
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.value.verdict, "PASS");
});

test("VerificationResult with invalid verdict is rejected", () => {
  const outcome = parseVerificationResult({
    mission_id: "mis_001",
    verdict: "MAYBE",
    checks: [],
    summary: "",
    evidence: [],
    violations: [],
  });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((e) => e.path === "verdict"));
});
