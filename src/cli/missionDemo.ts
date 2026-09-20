#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runDemoMission } from "../xo/runMission.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main(): Promise<void> {
  const missionPath = path.join(REPO_ROOT, "demo", "sample-mission.json");
  const rawMission = JSON.parse(readFileSync(missionPath, "utf8"));

  const outcome = await runDemoMission({
    repoRoot: REPO_ROOT,
    rawMission,
    log: (message) => console.log(message),
  });

  const { mission, result, canonicalBefore, canonicalAfter, canonicalIntegrityViolated, missionRunDir } = outcome;

  console.log("\n================ MISSION SUMMARY ================");
  console.log(`mission_id:        ${mission.mission_id}`);
  console.log(`session_id:        ${result.xo.session_id ?? "(none)"}`);
  console.log(`worker_claim:      ${result.worker_claim}`);
  console.log(`sandbox before:    ${result.tests.before.passed} pass / ${result.tests.before.failed} fail`);
  console.log(`sandbox after:     ${result.tests.after.passed} pass / ${result.tests.after.failed} fail`);
  console.log(`canonical before:  ${canonicalBefore.pass} pass / ${canonicalBefore.fail} fail`);
  console.log(`canonical after:   ${canonicalAfter.pass} pass / ${canonicalAfter.fail} fail${canonicalIntegrityViolated ? "  *** VIOLATION ***" : ""}`);
  console.log(`files changed:     ${result.files_changed.length}`);
  console.log(`result written to: ${path.join(missionRunDir, "result.json")}`);
  console.log("VERIFICATION: run `npm run verify:mission -- " + mission.mission_id + "` next");
  console.log("===================================================");

  if (canonicalIntegrityViolated) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("mission:demo failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
