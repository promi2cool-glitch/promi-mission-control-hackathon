import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Mission, VerificationResult } from "../mission/types.js";
import { parseMissionResult } from "../mission/result.js";
import { runDemoTests } from "../xo/workspace.js";
import { verifyMission } from "./verify.js";
import { renderHtmlReport, toPersistedJson } from "./report.js";

export interface VerifyStoredMissionOptions {
  repoRoot: string;
  mission: Mission;
}

export interface VerifyStoredMissionOutcome {
  verification: VerificationResult;
  missionRunDir: string;
}

/**
 * Reads an already-persisted MissionResult, gathers independent canonical
 * evidence live, runs the deterministic verifier, and persists
 * verification.json/.html — the one implementation shared by
 * `src/cli/verifyMission.ts` and the Promi bridge's
 * `GET/POST /api/missions/:id/verification` handling.
 */
export function verifyStoredMission(options: VerifyStoredMissionOptions): VerifyStoredMissionOutcome {
  const { repoRoot, mission } = options;
  const missionRunDir = path.join(repoRoot, ".mission-runs", mission.mission_id);
  const resultPath = path.join(missionRunDir, "result.json");

  if (!existsSync(resultPath)) {
    throw new Error(`no MissionResult found at ${resultPath} — dispatch the mission first`);
  }
  const rawResult = JSON.parse(readFileSync(resultPath, "utf8"));
  const resultOutcome = parseMissionResult(rawResult);
  if (!resultOutcome.ok) {
    throw new Error(`MissionResult at ${resultPath} is malformed: ${JSON.stringify(resultOutcome.errors)}`);
  }
  const result = resultOutcome.value;

  const canonicalNow = runDemoTests(repoRoot);
  const canonicalCounts = { total: canonicalNow.total, passed: canonicalNow.pass, failed: canonicalNow.fail, skipped: canonicalNow.skipped };
  const verification = verifyMission({
    mission,
    result,
    evidence: { canonicalDemoTests: { before: canonicalCounts, after: canonicalCounts } },
  });

  mkdirSync(missionRunDir, { recursive: true });
  writeFileSync(path.join(missionRunDir, "verification.json"), JSON.stringify(toPersistedJson(verification), null, 2));
  writeFileSync(path.join(missionRunDir, "verification.html"), renderHtmlReport(mission, result, verification));

  return { verification, missionRunDir };
}
