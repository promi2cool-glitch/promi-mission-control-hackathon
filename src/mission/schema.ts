import type { MissionState } from "./types.js";
import { MISSION_STATES } from "./types.js";

/**
 * Every schema_version this codebase knows how to validate. A mission
 * carrying any other value is rejected outright rather than guessed at.
 */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0"] as const;
export type SupportedSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

export function isSupportedSchemaVersion(value: unknown): value is SupportedSchemaVersion {
  return (
    typeof value === "string" &&
    (SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(value)
  );
}

/** Upper bound on max_runtime_seconds considered "reasonable" for a bounded mission: 24h. */
export const MAX_RUNTIME_SECONDS_CAP = 86_400;

/**
 * Valid mission-state transition table. A transition not listed here is
 * impossible and must be rejected by callers (see validate.ts).
 * Terminal states (COMPLETED, FAILED, CANCELLED) have no outgoing edges.
 */
export const VALID_STATE_TRANSITIONS: Readonly<Record<MissionState, readonly MissionState[]>> = {
  CREATED: ["QUEUED", "CANCELLED"],
  QUEUED: ["PLANNING", "BLOCKED", "CANCELLED"],
  PLANNING: ["RUNNING", "BLOCKED", "FAILED", "CANCELLED"],
  RUNNING: ["TESTING", "BLOCKED", "FAILED", "CANCELLED"],
  TESTING: ["VERIFYING", "RUNNING", "BLOCKED", "FAILED", "CANCELLED"],
  VERIFYING: ["COMPLETED", "FAILED", "BLOCKED"],
  COMPLETED: [],
  FAILED: [],
  BLOCKED: ["PLANNING", "RUNNING", "FAILED", "CANCELLED"],
  CANCELLED: [],
};

export function isValidMissionState(value: unknown): value is MissionState {
  return typeof value === "string" && (MISSION_STATES as readonly string[]).includes(value);
}

export function isValidStateTransition(from: MissionState, to: MissionState): boolean {
  return VALID_STATE_TRANSITIONS[from].includes(to);
}
