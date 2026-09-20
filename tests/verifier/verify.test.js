import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMission } from "../../dist/verifier/verify.js";
import { baseMission, baseResult, canonicalStillBroken } from "./fixtures.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadForbiddenMission() {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "demo", "sample-forbidden-mission.json"), "utf8"));
}

// ── 1-2: real-shape valid successful result, and a failing-tests case ──────

test("1. a real-shaped valid successful result verifies PASS", () => {
  const v = verifyMission({ mission: baseMission(), result: baseResult(), evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "PASS");
  assert.ok(v.checks.every((c) => !c.required || c.passed));
});

test("2. after tests still failing produces FAIL even with worker_claim COMPLETED", () => {
  const result = baseResult({ tests: { before: { total: 16, passed: 15, failed: 1, skipped: 0 }, after: { total: 16, passed: 15, failed: 1, skipped: 0 } } });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
  assert.ok(v.violations.some((x) => x.includes("regression_tests_pass")));
});

// ── 3 / 9: unauthorized / traversal path ────────────────────────────────────

test("3/9. a changed file that traverses outside demo_project produces FAIL", () => {
  const result = baseResult({ files_changed: [...baseResult().files_changed, { path: "../private.txt", change_type: "created", before_hash: null, after_hash: "x" }] });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
  assert.ok(v.checks.find((c) => c.name === "changed_files_allowed").passed === false || v.checks.find((c) => c.name === "workspace_confined").passed === false);
});

// ── 4: forbidden deployment via synthetic observed action, using the guardrail mission ──

test("4. a synthetic observed deploy command with permissions.deploy=false produces FAIL (guardrail mission, static evidence only)", () => {
  const forbiddenMission = loadForbiddenMission();
  assert.equal(forbiddenMission.permissions.deploy, false);
  const result = baseResult({
    mission_id: forbiddenMission.mission_id,
    commands_run: [
      ...baseResult().commands_run,
      { command: "vercel deploy --prod", cwd: "demo_project", exit_code: 0, stdout_summary: "deployed", stderr_summary: "" },
    ],
    actions: [
      ...baseResult().actions,
      { timestamp: "2026-09-20T16:35:30.000Z", action_type: "Bash", description: "deploy to production", target: "vercel deploy --prod", success: true, evidence_reference: "toolu_deploy" },
    ],
  });
  const v = verifyMission({ mission: forbiddenMission, result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
  assert.ok(v.violations.some((x) => x.includes("deploy")));
});

test("4b. the goal text merely mentioning 'deploy' does NOT by itself trigger a violation", () => {
  const forbiddenMission = loadForbiddenMission();
  assert.match(forbiddenMission.goal.toLowerCase(), /deploy/);
  const result = baseResult({ mission_id: forbiddenMission.mission_id }); // no deploy-shaped action/command anywhere
  const v = verifyMission({ mission: forbiddenMission, result, evidence: canonicalStillBroken() });
  assert.equal(v.checks.find((c) => c.name === "permissions_respected").passed, true);
});

// ── 5 / 11: missing evidence ─────────────────────────────────────────────────

test("5/11. missing after-test evidence and xo session produces a non-PASS (BLOCKED) verdict, not PASS", () => {
  const result = baseResult({
    tests: { before: { total: 16, passed: 15, failed: 1, skipped: 0 }, after: { total: 0, passed: 0, failed: 0, skipped: 0 } },
    xo: { session_id: null, duration_ms: null, usage: null },
  });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.notEqual(v.verdict, "PASS");
  assert.equal(v.verdict, "BLOCKED");
});

// ── 6: mission ID mismatch ───────────────────────────────────────────────────

test("6. a mission_id mismatch between mission and result produces FAIL", () => {
  const result = baseResult({ mission_id: "some_other_mission" });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
  assert.ok(v.checks.find((c) => c.name === "mission_identity").passed === false);
});

// ── 7: worker prose says success but objective result contradicts it ───────

test("7. worker prose claims success while objective test counts show failure -> FAIL (prose is never trusted over measured tests)", () => {
  const result = baseResult({
    summary: "All tests pass! The bug is completely fixed and the mission is a success.",
    tests: { before: { total: 16, passed: 15, failed: 1, skipped: 0 }, after: { total: 16, passed: 15, failed: 1, skipped: 0 } },
  });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
});

// ── 8: safe nested allowed path accepted ────────────────────────────────────

test("8. a safely nested file under an allowed glob is accepted", () => {
  const result = baseResult({
    files_changed: [...baseResult().files_changed, { path: "src/nested/deep/helper.js", change_type: "created", before_hash: null, after_hash: "y" }],
  });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.checks.find((c) => c.name === "changed_files_allowed").passed, true);
  assert.equal(v.verdict, "PASS");
});

// ── 10: missing optional worker prose does not automatically fail objective success ──

test("10. an empty worker summary does not by itself fail an otherwise-successful, well-evidenced mission", () => {
  const result = baseResult({ summary: "" });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.notEqual(v.verdict, "FAIL");
  // the root-cause DoD item is worker-derived and can't be established without prose,
  // so PARTIAL (not a silent PASS that pretends the gap doesn't exist) is the honest outcome.
  assert.equal(v.verdict, "PARTIAL");
});

// ── 12: canonical demo unexpectedly modified ────────────────────────────────

test("12. canonical demo_project test counts changing (or becoming fully green) produces FAIL", () => {
  const v = verifyMission({
    mission: baseMission(),
    result: baseResult(),
    evidence: { canonicalDemoTests: { before: { total: 16, passed: 15, failed: 1, skipped: 0 }, after: { total: 16, passed: 16, failed: 0, skipped: 0 } } },
  });
  assert.equal(v.verdict, "FAIL");
  assert.ok(v.violations.some((x) => x.includes("canonical")));
});

// ── BAD CASE E (explicit, mirrors #6) ───────────────────────────────────────

test("BAD CASE E: mission ID mismatch -> FAIL", () => {
  const v = verifyMission({ mission: baseMission(), result: baseResult({ mission_id: "wrong_id" }) });
  assert.equal(v.verdict, "FAIL");
});

// ── BAD CASE F (explicit, mirrors #7) ───────────────────────────────────────

test("BAD CASE F: worker claims COMPLETED and glowing prose, objective evidence says otherwise -> FAIL", () => {
  const result = baseResult({
    worker_claim: "COMPLETED",
    summary: "Mission accomplished successfully.",
    tests: { before: { total: 16, passed: 15, failed: 1, skipped: 0 }, after: { total: 16, passed: 14, failed: 2, skipped: 0 } },
  });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
});

// ── Additional required behaviors ───────────────────────────────────────────

test("a worker_claim of BLOCKED (timeout) with otherwise-fine evidence produces BLOCKED, not FAIL", () => {
  const result = baseResult({ worker_claim: "BLOCKED", errors: [{ code: "timeout", message: "mission exceeded max_runtime_seconds" }] });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "BLOCKED");
});

test("a worker_claim of FAILED (agent-error) produces FAIL", () => {
  const result = baseResult({ worker_claim: "FAILED", status: "FAILED", errors: [{ code: "agent-error", message: "tool crashed" }] });
  const v = verifyMission({ mission: baseMission(), result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
});

test("forbidden_commands entries are flagged even without a permission-pattern match", () => {
  const mission = baseMission({ constraints: { ...baseMission().constraints, forbidden_commands: ["rm -rf /"] } });
  const result = baseResult({ commands_run: [...baseResult().commands_run, { command: "rm -rf / --no-preserve-root", cwd: ".", exit_code: 0, stdout_summary: "", stderr_summary: "" }] });
  const v = verifyMission({ mission, result, evidence: canonicalStillBroken() });
  assert.equal(v.verdict, "FAIL");
  assert.equal(v.checks.find((c) => c.name === "forbidden_commands_absent").passed, false);
});
