#!/usr/bin/env node
// Orchestrates: build -> core mission tests (must pass) -> demo baseline
// (must show exactly one expected failure — the intentional defect).
// Distinguishes "core tests failed" from "demo baseline drifted" so the
// script never reports overall failure just because the intentional demo
// defect exists.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const EXPECTED_DEMO_FAILURES = 1;

function run(command, args) {
  try {
    const output = execFileSync(command, args, { encoding: "utf8" });
    return { code: 0, output };
  } catch (error) {
    return {
      code: typeof error.status === "number" ? error.status : 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

function parseTapCounts(output) {
  const pass = /^ℹ pass (\d+)/m.exec(output) ?? /^# pass (\d+)/m.exec(output);
  const fail = /^ℹ fail (\d+)/m.exec(output) ?? /^# fail (\d+)/m.exec(output);
  return {
    pass: pass ? Number(pass[1]) : 0,
    fail: fail ? Number(fail[1]) : 0,
  };
}

console.log("== verify: build ==");
const build = run("npx", ["tsc", "-p", "."]);
console.log(build.output.trim());
if (build.code !== 0) {
  console.error("\nBUILD: FAIL");
  process.exit(1);
}
console.log("BUILD: PASS\n");

console.log("== verify: core mission tests (must pass) ==");
const mission = run("node", ["--test", "tests/**/*.test.js"]);
console.log(mission.output.trim());
const missionCounts = parseTapCounts(mission.output);
if (mission.code !== 0 || missionCounts.fail > 0) {
  console.error(`\nCORE TESTS: FAIL (${missionCounts.pass} pass, ${missionCounts.fail} fail)`);
  process.exit(1);
}
console.log(`CORE TESTS: PASS (${missionCounts.pass}/${missionCounts.pass})\n`);

console.log("== verify: demo project baseline (exactly one expected failure) ==");
const demo = run("node", ["--test", "demo_project/test/**/*.test.js"]);
console.log(demo.output.trim());
const demoCounts = parseTapCounts(demo.output);

if (demoCounts.fail === 0) {
  console.error(
    "\nDEMO BASELINE: FAIL — expected exactly 1 failing test (the intentional defect) but found 0. " +
      "The demo defect appears to have been fixed already; the baseline is no longer valid.",
  );
  process.exit(1);
}
if (demoCounts.fail > EXPECTED_DEMO_FAILURES) {
  console.error(
    `\nDEMO BASELINE: FAIL — expected exactly ${EXPECTED_DEMO_FAILURES} failing test but found ${demoCounts.fail}. ` +
      "The demo project is broken beyond the intended defect.",
  );
  process.exit(1);
}
console.log(`DEMO BASELINE: PASS (${demoCounts.pass} pass, ${demoCounts.fail} expected fail)\n`);

console.log("== verify: real mission sandbox + independent verification (if a mission has been dispatched) ==");
const DEMO_MISSION_ID = "mis_demo_bugfix_001";
const resultPath = `.mission-runs/${DEMO_MISSION_ID}/result.json`;
let verificationLine = "VERIFICATION: (no mission dispatched yet)";
let sandboxLine = "REAL MISSION SANDBOX: (no mission dispatched yet)";

if (existsSync(resultPath)) {
  const missionResult = JSON.parse(readFileSync(resultPath, "utf8"));
  sandboxLine = `REAL MISSION SANDBOX: ${missionResult.tests.after.passed} pass / ${missionResult.tests.after.failed} fail`;
  console.log(sandboxLine);

  const verifyRun = run("node", ["dist/cli/verifyMission.js", DEMO_MISSION_ID]);
  console.log(verifyRun.output.trim());
  const verdictMatch = /VERDICT\s*\n\s*\n\s*(\w+)/.exec(verifyRun.output);
  const verdict = verdictMatch ? verdictMatch[1] : "UNKNOWN";
  verificationLine = `VERIFICATION: ${verdict}`;
  if (verdict !== "PASS") {
    console.error(`\nVERIFY: FAIL — independent verification of ${DEMO_MISSION_ID} did not return PASS (got ${verdict}).`);
    process.exit(1);
  }
} else {
  console.log("(no dispatched mission found under .mission-runs/ — skipping)");
}
console.log();

console.log("VERIFY: PASS");
console.log(`  core system:          ${missionCounts.pass}/${missionCounts.pass} pass`);
console.log(`  canonical demo:       ${demoCounts.pass} pass, ${demoCounts.fail} expected fail (intentional defect)`);
console.log(`  ${sandboxLine}`);
console.log(`  ${verificationLine}`);
