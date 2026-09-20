import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MissionResult, VerificationResult } from "../mission/types.js";
import { parseMissionResult, parseVerificationResult } from "../mission/result.js";

export function missionRunDir(repoRoot: string, missionId: string): string {
  return path.join(repoRoot, ".mission-runs", missionId);
}

/** Reads a persisted MissionResult if present and well-formed; never throws. */
export function readMissionResult(repoRoot: string, missionId: string): MissionResult | null {
  const p = path.join(missionRunDir(repoRoot, missionId), "result.json");
  if (!existsSync(p)) return null;
  try {
    const outcome = parseMissionResult(JSON.parse(readFileSync(p, "utf8")));
    return outcome.ok ? outcome.value : null;
  } catch {
    return null;
  }
}

/** Reads a persisted VerificationResult (plus verified_at) if present and well-formed; never throws. */
export function readVerificationResult(repoRoot: string, missionId: string): (VerificationResult & { verified_at?: string }) | null {
  const p = path.join(missionRunDir(repoRoot, missionId), "verification.json");
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const outcome = parseVerificationResult(raw);
    return outcome.ok ? { ...outcome.value, verified_at: typeof raw.verified_at === "string" ? raw.verified_at : undefined } : null;
  } catch {
    return null;
  }
}

export interface ObservabilitySummary {
  session_id: string | null;
  runtime: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  actions_observed: number;
  commands_observed: number;
  files_changed: number;
  usage_available: boolean;
  usage: Record<string, unknown> | null;
}

export function buildObservability(result: MissionResult): ObservabilitySummary {
  return {
    session_id: result.xo.session_id,
    runtime: "claude_code",
    started_at: result.started_at,
    finished_at: result.finished_at,
    duration_ms: result.xo.duration_ms,
    actions_observed: result.actions.length,
    commands_observed: result.commands_run.length,
    files_changed: result.files_changed.length,
    usage_available: result.xo.usage !== null,
    usage: result.xo.usage,
  };
}
