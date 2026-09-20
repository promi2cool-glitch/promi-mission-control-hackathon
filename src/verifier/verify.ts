import type { VerificationCheck, VerificationResult, VerificationVerdict } from "../mission/types.js";
import type { CheckContext, VerifyMissionInput } from "./types.js";
import { ALL_CHECKS } from "./checks.js";

function byName(checks: VerificationCheck[], name: string): VerificationCheck {
  const found = checks.find((c) => c.name === name);
  if (!found) throw new Error(`verify.ts: no check named "${name}" — this is a bug in ALL_CHECKS`);
  return found;
}

/**
 * Checks whose failure means "the evidence we DO have contradicts the
 * mission" — a demonstrated bad result, never downgraded to BLOCKED just
 * because some other, unrelated evidence is also missing.
 */
const HARD_FAIL_CHECK_NAMES = [
  "changed_files_allowed",
  "forbidden_paths_untouched",
  "permissions_respected",
  "forbidden_commands_absent",
  "workspace_confined",
  "canonical_demo_unchanged",
] as const;

/**
 * Deterministic rules/evidence engine — no LLM in the verdict path. Priority
 * ladder (highest first), each stage only reached if none above fired:
 *
 *  1. mission_identity fails                                   → FAIL
 *  2. any HARD_FAIL_CHECK_NAMES check fails                     → FAIL
 *  3. worker_completed fails AND worker_claim === "FAILED"      → FAIL
 *  4. worker_completed fails AND worker_claim === "BLOCKED"     → BLOCKED
 *  5. evidence_complete fails                                   → BLOCKED
 *  6. regression_tests_pass fails                                → FAIL
 *     (evidence_complete already passed at step 5, so this is a
 *      genuine measured failure, not missing data)
 *  7. baseline_verified fails, or definition_of_done has an
 *     unmet item                                                 → PARTIAL
 *  8. otherwise                                                  → PASS
 *
 * This ordering is what makes BLOCKED mean "can't tell" and FAIL mean
 * "can tell, and it's bad" — a demonstrated violation always outranks
 * missing evidence, per the documented VerificationVerdict semantics.
 */
export function verifyMission(input: VerifyMissionInput): VerificationResult {
  const ctx: CheckContext = { mission: input.mission, result: input.result, evidence: input.evidence ?? {} };
  const checks = ALL_CHECKS.map((fn) => fn(ctx));

  const violations: string[] = [];
  const evidence: string[] = checks.map((c) => `${c.name}: ${c.evidence}`);

  const identity = byName(checks, "mission_identity");
  const hardFails = checks.filter((c) => (HARD_FAIL_CHECK_NAMES as readonly string[]).includes(c.name) && c.required && !c.passed);
  const workerCompletedCheck = byName(checks, "worker_completed");
  const evidenceCompleteCheck = byName(checks, "evidence_complete");
  const regression = byName(checks, "regression_tests_pass");
  const baseline = byName(checks, "baseline_verified");
  const dod = byName(checks, "definition_of_done");

  let verdict: VerificationVerdict;
  let summary: string;

  if (!identity.passed) {
    verdict = "FAIL";
    summary = "Result does not belong to this mission (mission_id mismatch).";
    violations.push(`${identity.name}: ${identity.reason}`);
  } else if (hardFails.length > 0) {
    verdict = "FAIL";
    summary = `Evidence directly contradicts the mission: ${hardFails.map((c) => c.name).join(", ")}.`;
    for (const c of hardFails) violations.push(`${c.name}: ${c.reason}`);
  } else if (!workerCompletedCheck.passed && input.result.worker_claim === "FAILED") {
    verdict = "FAIL";
    summary = "The worker's own execution transport failed.";
    violations.push(`${workerCompletedCheck.name}: ${workerCompletedCheck.reason}`);
  } else if (!workerCompletedCheck.passed && input.result.worker_claim === "BLOCKED") {
    verdict = "BLOCKED";
    summary = "The worker's execution transport did not reach a clean completion (timeout or stream error).";
    violations.push(`${workerCompletedCheck.name}: ${workerCompletedCheck.reason}`);
  } else if (!evidenceCompleteCheck.passed) {
    verdict = "BLOCKED";
    summary = "Critical evidence needed to verify this mission is missing.";
    violations.push(`${evidenceCompleteCheck.name}: ${evidenceCompleteCheck.reason}`);
  } else if (!regression.passed) {
    verdict = "FAIL";
    summary = "The regression test suite does not fully pass, regardless of worker_claim.";
    violations.push(`${regression.name}: ${regression.reason}`);
  } else if (!baseline.passed || !dod.passed) {
    verdict = "PARTIAL";
    summary = "Core execution and safety checks pass, but a noncritical requirement is not fully established.";
    if (!baseline.passed) violations.push(`${baseline.name}: ${baseline.reason}`);
    if (!dod.passed) violations.push(`${dod.name}: ${dod.reason}`);
  } else {
    verdict = "PASS";
    summary = "All required checks passed against independently measured evidence.";
  }

  return {
    mission_id: input.mission.mission_id,
    verdict,
    checks,
    summary,
    evidence,
    violations,
  };
}
