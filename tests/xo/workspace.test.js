import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materializeDemoProjectSandbox, requireBaseline, runDemoTests, sandboxDirName } from "../../dist/xo/workspace.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("sandboxDirName sanitizes unsafe characters into a single safe path segment", () => {
  const name = sandboxDirName("../escape/me");
  assert.ok(!name.includes("/"));
  assert.ok(name.startsWith("mission-"));
});

test("sandboxDirName never contains an underscore (the claude CLI's own directory encoding collapses them, breaking transcript lookup)", () => {
  const name = sandboxDirName("mis_demo_bugfix_001");
  assert.ok(!name.includes("_"));
  assert.equal(name, "mission-mis-demo-bugfix-001");
});

test("materializes a clean sandbox from committed HEAD and its baseline is exactly 15 pass / 1 fail", () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "xo-projects-test-"));
  try {
    const { sandboxRoot, demoProjectPath } = materializeDemoProjectSandbox({
      xoProjectsRoot: tmpRoot,
      missionId: "unit_test_mission",
      repoRoot: REPO_ROOT,
    });
    assert.ok(demoProjectPath.endsWith(path.join("demo_project")));

    const baseline = runDemoTests(sandboxRoot);
    assert.equal(baseline.pass, 15);
    assert.equal(baseline.fail, 1);
    assert.doesNotThrow(() => requireBaseline(baseline, 15, 1));
    assert.throws(() => requireBaseline(baseline, 16, 0));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("the materialized sandbox does not include unrelated repo files (only demo_project/)", () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "xo-projects-test-"));
  try {
    const { sandboxRoot } = materializeDemoProjectSandbox({
      xoProjectsRoot: tmpRoot,
      missionId: "unit_test_mission_2",
      repoRoot: REPO_ROOT,
    });
    const entries = readdirSync(sandboxRoot);
    assert.deepEqual(entries, ["demo_project"]);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});
