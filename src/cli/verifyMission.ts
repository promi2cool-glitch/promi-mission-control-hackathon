#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateMission } from "../mission/validate.js";
import { verifyStoredMission } from "../verifier/verifyStoredMission.js";
import { renderTextReport } from "../verifier/report.js";
import { parseMissionResult } from "../mission/result.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const missionId = process.argv[2];
  if (!missionId) fail("usage: npm run verify:mission -- <mission-id>");

  const missionPath = path.join(REPO_ROOT, "demo", "sample-mission.json");
  const rawMission = JSON.parse(readFileSync(missionPath, "utf8"));
  const missionOutcome = validateMission(rawMission);
  if (!missionOutcome.ok) {
    fail(`mission definition is invalid: ${JSON.stringify(missionOutcome.errors, null, 2)}`);
  }
  const mission = missionOutcome.mission;
  if (mission.mission_id !== missionId) {
    fail(`no known mission definition for "${missionId}" (demo/sample-mission.json defines "${mission.mission_id}")`);
  }

  console.log("== gathering independent evidence: canonical demo_project (live re-measurement) ==");
  let outcome;
  try {
    outcome = verifyStoredMission({ repoRoot: REPO_ROOT, mission });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const resultPath = path.join(outcome.missionRunDir, "result.json");
  const resultOutcome = parseMissionResult(JSON.parse(readFileSync(resultPath, "utf8")));
  if (!resultOutcome.ok) fail("MissionResult became unreadable between verification and reporting — this is a bug");

  console.log(`\n${renderTextReport(mission, resultOutcome.value, outcome.verification)}`);
  console.log(`\nverification.json and verification.html written to ${outcome.missionRunDir}`);

  process.exitCode = outcome.verification.verdict === "PASS" ? 0 : 1;
}

main().catch((err) => {
  console.error("verify:mission failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
