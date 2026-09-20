import type {
  Artifact,
  CommandRun,
  FileChange,
  MissionAction,
  MissionError,
  MissionResult,
  TestCounts,
  TestsSummary,
  VerificationCheck,
  VerificationResult,
  VerificationVerdict,
  WorkerClaim,
  XoMeta,
} from "./types.js";
import { MISSION_STATES } from "./types.js";
import { isSupportedSchemaVersion } from "./schema.js";
import type { ValidationError } from "./validate.js";

export interface ParseSuccess<T> {
  ok: true;
  value: T;
}

export interface ParseFailure {
  ok: false;
  errors: ValidationError[];
}

export type ParseOutcome<T> = ParseSuccess<T> | ParseFailure;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function err(errors: ValidationError[], path: string, code: string, message: string): void {
  errors.push({ path, code, message });
}

const WORKER_CLAIMS: readonly WorkerClaim[] = ["COMPLETED", "FAILED", "BLOCKED"];
const VERIFICATION_VERDICTS: readonly VerificationVerdict[] = ["PASS", "FAIL", "PARTIAL", "BLOCKED"];

function isTestCounts(value: unknown): value is TestCounts {
  return (
    isPlainObject(value) &&
    typeof value.total === "number" &&
    typeof value.passed === "number" &&
    typeof value.failed === "number" &&
    typeof value.skipped === "number"
  );
}

function isTestsSummary(value: unknown): value is TestsSummary {
  return isPlainObject(value) && isTestCounts(value.before) && isTestCounts(value.after);
}

function isMissionAction(value: unknown): value is MissionAction {
  return (
    isPlainObject(value) &&
    typeof value.timestamp === "string" &&
    typeof value.action_type === "string" &&
    typeof value.description === "string" &&
    typeof value.target === "string" &&
    typeof value.success === "boolean"
  );
}

function isFileChange(value: unknown): value is FileChange {
  return (
    isPlainObject(value) &&
    typeof value.path === "string" &&
    (value.change_type === "created" || value.change_type === "modified" || value.change_type === "deleted")
  );
}

function isCommandRun(value: unknown): value is CommandRun {
  return (
    isPlainObject(value) &&
    typeof value.command === "string" &&
    typeof value.cwd === "string" &&
    typeof value.exit_code === "number"
  );
}

function isArtifact(value: unknown): value is Artifact {
  return isPlainObject(value) && typeof value.type === "string" && typeof value.path === "string";
}

function isMissionError(value: unknown): value is MissionError {
  return isPlainObject(value) && typeof value.code === "string" && typeof value.message === "string";
}

function isXoMeta(value: unknown): value is XoMeta {
  return isPlainObject(value) && "session_id" in value && "duration_ms" in value && "usage" in value;
}

/**
 * Structural validation for a MissionResult produced by a worker/XO. This is
 * NOT a verification pass — see parseVerificationResult / VerificationResult.
 * `worker_claim` is a self-report field on this type and must never be
 * treated as equivalent to an independent verdict.
 */
export function parseMissionResult(raw: unknown): ParseOutcome<MissionResult> {
  const errors: ValidationError[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: "$", code: "invalid_type", message: "mission result must be an object" }] };
  }

  if (!isSupportedSchemaVersion(raw.schema_version)) {
    err(errors, "schema_version", "unsupported_schema_version", "schema_version is missing or unsupported");
  }
  if (typeof raw.mission_id !== "string" || raw.mission_id.length === 0) {
    err(errors, "mission_id", "missing", "mission_id is required");
  }
  if (typeof raw.status !== "string" || !(MISSION_STATES as readonly string[]).includes(raw.status)) {
    err(errors, "status", "invalid_value", "status must be a valid MissionState");
  }
  if (typeof raw.started_at !== "string") {
    err(errors, "started_at", "missing", "started_at is required");
  }
  if (raw.finished_at !== null && typeof raw.finished_at !== "string") {
    err(errors, "finished_at", "invalid_type", "finished_at must be a string or null");
  }
  if (typeof raw.summary !== "string") {
    err(errors, "summary", "missing", "summary is required");
  }
  if (!Array.isArray(raw.plan) || !raw.plan.every((p) => typeof p === "string")) {
    err(errors, "plan", "invalid_type", "plan must be an array of strings");
  }
  if (!Array.isArray(raw.actions) || !raw.actions.every(isMissionAction)) {
    err(errors, "actions", "invalid_type", "actions must be an array of MissionAction");
  }
  if (!Array.isArray(raw.files_changed) || !raw.files_changed.every(isFileChange)) {
    err(errors, "files_changed", "invalid_type", "files_changed must be an array of FileChange");
  }
  if (!Array.isArray(raw.commands_run) || !raw.commands_run.every(isCommandRun)) {
    err(errors, "commands_run", "invalid_type", "commands_run must be an array of CommandRun");
  }
  if (!isTestsSummary(raw.tests)) {
    err(errors, "tests", "invalid_type", "tests must be a TestsSummary with before/after counts");
  }
  if (!Array.isArray(raw.artifacts) || !raw.artifacts.every(isArtifact)) {
    err(errors, "artifacts", "invalid_type", "artifacts must be an array of Artifact");
  }
  if (!Array.isArray(raw.errors) || !raw.errors.every(isMissionError)) {
    err(errors, "errors", "invalid_type", "errors must be an array of MissionError");
  }
  if (!isXoMeta(raw.xo)) {
    err(errors, "xo", "invalid_type", "xo must contain session_id, duration_ms, usage");
  }
  if (typeof raw.worker_claim !== "string" || !WORKER_CLAIMS.includes(raw.worker_claim as WorkerClaim)) {
    err(errors, "worker_claim", "invalid_value", "worker_claim must be COMPLETED, FAILED, or BLOCKED");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: raw as unknown as MissionResult };
}

function isVerificationCheck(value: unknown): value is VerificationCheck {
  return (
    isPlainObject(value) &&
    typeof value.name === "string" &&
    typeof value.passed === "boolean" &&
    typeof value.required === "boolean" &&
    typeof value.evidence === "string" &&
    typeof value.reason === "string"
  );
}

/**
 * Structural validation for a VerificationResult — the independent verdict
 * produced by the verifier, distinct from and authoritative over any
 * worker_claim in a MissionResult.
 */
export function parseVerificationResult(raw: unknown): ParseOutcome<VerificationResult> {
  const errors: ValidationError[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: "$", code: "invalid_type", message: "verification result must be an object" }] };
  }

  if (typeof raw.mission_id !== "string" || raw.mission_id.length === 0) {
    err(errors, "mission_id", "missing", "mission_id is required");
  }
  if (typeof raw.verdict !== "string" || !VERIFICATION_VERDICTS.includes(raw.verdict as VerificationVerdict)) {
    err(errors, "verdict", "invalid_value", "verdict must be PASS, FAIL, PARTIAL, or BLOCKED");
  }
  if (!Array.isArray(raw.checks) || !raw.checks.every(isVerificationCheck)) {
    err(errors, "checks", "invalid_type", "checks must be an array of VerificationCheck");
  }
  if (typeof raw.summary !== "string") {
    err(errors, "summary", "missing", "summary is required");
  }
  if (!Array.isArray(raw.evidence) || !raw.evidence.every((e) => typeof e === "string")) {
    err(errors, "evidence", "invalid_type", "evidence must be an array of strings");
  }
  if (!Array.isArray(raw.violations) || !raw.violations.every((v) => typeof v === "string")) {
    err(errors, "violations", "invalid_type", "violations must be an array of strings");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: raw as unknown as VerificationResult };
}
