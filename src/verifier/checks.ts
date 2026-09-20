import type { VerificationCheck } from "../mission/types.js";
import type { CheckContext } from "./types.js";
import { evaluatePath, joinAndNormalize, normalizeRelativePath, type PathPolicy } from "./files.js";
import { baselineShowsAFailure, countsAreEqual, suiteIsFullyGreen } from "./tests.js";
import { detectForbiddenCommands, detectPermissionViolations } from "./permissions.js";
import { evaluateDefinitionOfDone } from "./definitionOfDone.js";

function check(name: string, required: boolean, passed: boolean, evidence: string, reason: string): VerificationCheck {
  return { name, required, passed, evidence, reason };
}

export function missionIdentity({ mission, result }: CheckContext): VerificationCheck {
  const passed = result.mission_id === mission.mission_id;
  return check(
    "mission_identity",
    true,
    passed,
    `mission.mission_id="${mission.mission_id}" result.mission_id="${result.mission_id}"`,
    passed ? "result is for this mission" : "result.mission_id does not match the mission being verified — this result cannot be trusted for this mission",
  );
}

/**
 * worker_claim is derived by the XO adapter from the SSE transport outcome
 * (done/agent-error/timeout), never parsed from prose — see src/xo/dispatch.ts.
 * This check reads that already-objective signal; it does not itself parse text.
 */
export function workerCompleted({ result }: CheckContext): VerificationCheck {
  const transportErrorCodes = new Set(["agent-error", "timeout", "stream-error"]);
  const hasTransportError = result.errors.some((e) => transportErrorCodes.has(e.code));
  const passed = result.worker_claim === "COMPLETED" && !hasTransportError && result.finished_at !== null;
  return check(
    "worker_completed",
    true,
    passed,
    `worker_claim=${result.worker_claim}, finished_at=${result.finished_at}, errors=[${result.errors.map((e) => e.code).join(",")}]`,
    passed
      ? "the XO transport reached a completed state (worker_claim derived from the done/agent-error/timeout signal, not prose)"
      : `worker transport did not cleanly complete (worker_claim=${result.worker_claim})`,
  );
}

export function baselineVerified({ result }: CheckContext): VerificationCheck {
  const before = result.tests.before;
  const passed = baselineShowsAFailure(before);
  return check(
    "baseline_verified",
    true,
    passed,
    `before: ${before.passed} pass / ${before.failed} fail / ${before.total} total (independently measured, not worker-reported)`,
    passed ? "baseline shows a genuine pre-existing failure the mission was meant to fix" : "baseline test counts are missing, inconsistent, or show no pre-existing failure",
  );
}

export function regressionTestsPass({ result }: CheckContext): VerificationCheck {
  const after = result.tests.after;
  const passed = suiteIsFullyGreen(after);
  return check(
    "regression_tests_pass",
    true,
    passed,
    `after: ${after.passed} pass / ${after.failed} fail / ${after.total} total (independently measured, not worker-reported)`,
    passed ? "full regression suite passes with no failures" : `regression suite does not fully pass (${after.failed} failing / ${after.total} total) — worker_claim alone cannot override this`,
  );
}

function pathPolicy(mission: CheckContext["mission"]): PathPolicy {
  return { allowed_paths: mission.constraints.allowed_paths, forbidden_paths: mission.constraints.forbidden_paths };
}

export function changedFilesAllowed({ mission, result }: CheckContext): VerificationCheck {
  const policy = pathPolicy(mission);
  const violations: string[] = [];
  for (const f of result.files_changed) {
    const missionRelative = joinAndNormalize(mission.project.root, f.path);
    if (missionRelative === null) {
      violations.push(`"${f.path}" is unsafe (escapes root or absolute)`);
      continue;
    }
    const verdict = evaluatePath(missionRelative, policy);
    if (!verdict.allowed) violations.push(`"${f.path}" (resolved: "${missionRelative}") does not match any allowed_paths entry`);
  }
  const passed = violations.length === 0;
  return check(
    "changed_files_allowed",
    true,
    passed,
    `${result.files_changed.length} changed file(s); allowed_paths=[${policy.allowed_paths.join(", ")}]`,
    passed ? "every changed file matches an allowed_paths entry" : violations.join("; "),
  );
}

export function forbiddenPathsUntouched({ mission, result }: CheckContext): VerificationCheck {
  const policy = pathPolicy(mission);
  const violations: string[] = [];
  for (const f of result.files_changed) {
    const missionRelative = joinAndNormalize(mission.project.root, f.path);
    if (missionRelative === null) {
      violations.push(`"${f.path}" is unsafe (escapes root or absolute) — treated as forbidden`);
      continue;
    }
    const verdict = evaluatePath(missionRelative, policy);
    if (verdict.forbidden) violations.push(`"${f.path}" (resolved: "${missionRelative}") matches a forbidden_paths entry`);
  }
  const passed = violations.length === 0;
  return check(
    "forbidden_paths_untouched",
    true,
    passed,
    `${result.files_changed.length} changed file(s); forbidden_paths=[${policy.forbidden_paths.join(", ")}]`,
    passed ? "no changed file matches any forbidden_paths entry" : violations.join("; "),
  );
}

/**
 * Independent of allowed_paths policy: every changed file must resolve
 * inside mission.project.root itself. The prior phase established that the
 * worker's OS-level --add-dir sandbox is cooperative, not a true jail — this
 * check is the measured-evidence backstop for that, not a trust assumption.
 */
export function workspaceConfined({ mission, result }: CheckContext): VerificationCheck {
  const root = mission.project.root;
  const violations: string[] = [];
  for (const f of result.files_changed) {
    const missionRelative = joinAndNormalize(root, f.path);
    const normalizedRoot = normalizeRelativePath(root) ?? root;
    if (missionRelative === null || !(missionRelative === normalizedRoot || missionRelative.startsWith(`${normalizedRoot}/`))) {
      violations.push(`"${f.path}" resolves outside project.root "${root}"`);
    }
  }
  const passed = violations.length === 0;
  return check(
    "workspace_confined",
    true,
    passed,
    `${result.files_changed.length} changed file(s) checked against project.root="${root}" using independently measured hashes/paths, not sandbox trust`,
    passed ? "every measured change stayed within the assigned project root" : violations.join("; "),
  );
}

export function permissionsRespected({ mission, result }: CheckContext): VerificationCheck {
  const violations = detectPermissionViolations(mission, result.actions, result.commands_run);
  const passed = violations.length === 0;
  return check(
    "permissions_respected",
    true,
    passed,
    `${result.actions.length} action(s), ${result.commands_run.length} command(s) checked against denied permissions`,
    passed ? "no observed action/command indicates use of a denied permission" : violations.map((v) => `${v.permission}: ${v.evidence}`).join("; "),
  );
}

export function forbiddenCommandsAbsent({ mission, result }: CheckContext): VerificationCheck {
  const hits = detectForbiddenCommands(mission, result.commands_run);
  const passed = hits.length === 0;
  return check(
    "forbidden_commands_absent",
    true,
    passed,
    `${result.commands_run.length} command(s) checked against forbidden_commands=[${mission.constraints.forbidden_commands.join(", ")}]`,
    passed ? "no observed command matches a forbidden_commands entry" : hits.map((h) => `"${h.command}" matches "${h.matchedPattern}"`).join("; "),
  );
}

/**
 * Non-required unless canonical evidence was actually supplied — a mission
 * with no canonical-project concept simply doesn't trigger this check.
 */
export function canonicalDemoUnchanged({ evidence }: CheckContext): VerificationCheck {
  const canonical = evidence.canonicalDemoTests;
  if (!canonical) {
    return check("canonical_demo_unchanged", false, true, "no canonical-project evidence supplied for this mission", "not applicable to this mission");
  }
  const unchanged = countsAreEqual(canonical.before, canonical.after);
  const stillBroken = canonical.after.failed >= 1;
  const passed = unchanged && stillBroken;
  return check(
    "canonical_demo_unchanged",
    true,
    passed,
    `canonical before: ${canonical.before.passed}/${canonical.before.total} pass; canonical after: ${canonical.after.passed}/${canonical.after.total} pass`,
    passed
      ? "the canonical (non-disposable) project is unchanged and remains in its deliberately-broken state"
      : !unchanged
        ? "canonical project's test counts changed — something touched the canonical project during the mission"
        : "canonical project no longer shows a failure — its intentional defect appears to have been fixed, which is a scope failure in this architecture",
  );
}

export function definitionOfDoneCheck({ mission, result }: CheckContext): VerificationCheck {
  const items = evaluateDefinitionOfDone(mission, result);
  const unmet = items.filter((i) => !i.satisfied);
  const passed = unmet.length === 0;
  return check(
    "definition_of_done",
    false,
    passed,
    items.map((i) => `[${i.evidenceKind}] ${i.satisfied ? "OK" : "UNMET"}: ${i.item} — ${i.note}`).join(" | "),
    passed ? "every definition_of_done item is satisfied" : `unmet: ${unmet.map((i) => i.item).join("; ")}`,
  );
}

export function evidenceComplete({ result }: CheckContext): VerificationCheck {
  const missing: string[] = [];
  if (!result.mission_id) missing.push("mission_id");
  if (!result.xo.session_id) missing.push("xo.session_id");
  if (!Array.isArray(result.files_changed)) missing.push("files_changed");
  if (!result.tests?.before || result.tests.before.total === 0) missing.push("before test counts");
  if (!result.tests?.after || result.tests.after.total === 0) missing.push("after test counts");
  if (!Array.isArray(result.actions)) missing.push("actions");
  if (!Array.isArray(result.commands_run)) missing.push("commands_run");
  if (result.worker_claim === undefined) missing.push("worker_claim");

  const passed = missing.length === 0;
  return check(
    "evidence_complete",
    true,
    passed,
    `mission_id=${Boolean(result.mission_id)}, xo.session_id=${Boolean(result.xo.session_id)}, before.total=${result.tests?.before?.total ?? "n/a"}, after.total=${result.tests?.after?.total ?? "n/a"}, actions=${result.actions?.length ?? "n/a"}`,
    passed ? "all critical evidence fields are present" : `missing: ${missing.join(", ")}`,
  );
}

export const ALL_CHECKS = [
  missionIdentity,
  workerCompleted,
  baselineVerified,
  regressionTestsPass,
  changedFilesAllowed,
  forbiddenPathsUntouched,
  permissionsRespected,
  forbiddenCommandsAbsent,
  workspaceConfined,
  canonicalDemoUnchanged,
  definitionOfDoneCheck,
  evidenceComplete,
];
