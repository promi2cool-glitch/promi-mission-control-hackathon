#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateMission } from "../mission/validate.js";
import { parseMissionResult } from "../mission/result.js";
import { verifyMission } from "../verifier/verify.js";
import { renderHtmlReport, renderTextReport, toPersistedJson } from "../verifier/report.js";
import { runDemoTests } from "../xo/workspace.js";

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

  const missionRunDir = path.join(REPO_ROOT, ".mission-runs", missionId);
  const resultPath = path.join(missionRunDir, "result.json");
  if (!existsSync(resultPath)) {
    fail(`no MissionResult found at ${resultPath} — has this mission been dispatched via "npm run mission:demo"?`);
  }
  const rawResult = JSON.parse(readFileSync(resultPath, "utf8"));
  const resultOutcome = parseMissionResult(rawResult);
  if (!resultOutcome.ok) {
    fail(`MissionResult at ${resultPath} is malformed: ${JSON.stringify(resultOutcome.errors, null, 2)}`);
  }
  const result = resultOutcome.value;

  console.log("== gathering independent evidence: canonical demo_project (live re-measurement) ==");
  // Canonical is expected to be static (deliberately broken at all times) —
  // missionDemo.ts already guards against drift synchronously during a run
  // (it aborts if canonical changes). This is a fresh, current-state
  // measurement, not a reconstructed historical one; using it for both
  // "before" and "after" is honest here specifically because canonical is
  // supposed to never move, so a single live reading is what "unchanged"
  // evidence looks like at verify time.
  const canonicalNow = runDemoTests(REPO_ROOT);
  console.log(`canonical: ${canonicalNow.pass} pass / ${canonicalNow.fail} fail`);

  const canonicalCounts = { total: canonicalNow.total, passed: canonicalNow.pass, failed: canonicalNow.fail, skipped: canonicalNow.skipped };
  const verification = verifyMission({
    mission,
    result,
    evidence: { canonicalDemoTests: { before: canonicalCounts, after: canonicalCounts } },
  });

  console.log(`\n${renderTextReport(mission, result, verification)}`);

  mkdirSync(missionRunDir, { recursive: true });
  writeFileSync(path.join(missionRunDir, "verification.json"), JSON.stringify(toPersistedJson(verification), null, 2));
  writeFileSync(path.join(missionRunDir, "verification.html"), renderHtmlReport(mission, result, verification));
  console.log(`\nverification.json and verification.html written to ${missionRunDir}`);

  process.exitCode = verification.verdict === "PASS" ? 0 : 1;
}

main().catch((err) => {
  console.error("verify:mission failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
