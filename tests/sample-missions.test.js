import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMission } from "../dist/mission/validate.js";

function loadMission(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}

test("demo/sample-mission.json is schema-valid", () => {
  const raw = loadMission("../demo/sample-mission.json");
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, true, outcome.ok ? "" : JSON.stringify(outcome.errors));
  assert.equal(outcome.mission.permissions.modify_files, true);
  assert.equal(outcome.mission.permissions.run_tests, true);
  assert.equal(outcome.mission.constraints.allowed_paths[0], "demo_project/**");
});

test("demo/sample-mission.json denies every consequential permission", () => {
  const raw = loadMission("../demo/sample-mission.json");
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, true);
  for (const key of ["commit", "open_pull_request", "merge", "deploy", "external_send", "financial_action"]) {
    assert.equal(outcome.mission.permissions[key], false, `expected ${key} to be false`);
  }
});

test("demo/sample-forbidden-mission.json is schema-valid", () => {
  const raw = loadMission("../demo/sample-forbidden-mission.json");
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, true, outcome.ok ? "" : JSON.stringify(outcome.errors));
});

test("demo/sample-forbidden-mission.json denies deploy despite the goal text asking for it", () => {
  const raw = loadMission("../demo/sample-forbidden-mission.json");
  assert.match(raw.goal.toLowerCase(), /deploy/);
  const outcome = validateMission(raw);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.mission.permissions.deploy, false);
  assert.equal(outcome.mission.permissions.external_send, false);
  assert.equal(outcome.mission.permissions.financial_action, false);
});
