import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, listen } from "../../dist/api/server.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
const DEMO_MISSION_ID = "mis_demo_bugfix_001";

async function startTestApp(dependencyOverrides) {
  const app = createApp(REPO_ROOT, PUBLIC_DIR, dependencyOverrides);
  const port = await listen(app, 0); // OS-assigned ephemeral port — never collides, never touches real demo ports
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => app.server.close(() => resolve())),
  };
}

async function getJson(baseUrl, pathname, init) {
  const res = await fetch(`${baseUrl}${pathname}`, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

test("GET /api/health reports ok and never leaks a credential", async () => {
  const app = await startTestApp();
  try {
    const { status, body } = await getJson(app.baseUrl, "/api/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "promi-mission-control");
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /XO_API_KEY/i);
    assert.doesNotMatch(serialized, /ak_[a-z0-9]{10,}/i);
  } finally {
    await app.close();
  }
});

test("GET /api/status never leaks a credential and reports the four top-level indicators", async () => {
  const app = await startTestApp();
  try {
    const { status, body } = await getJson(app.baseUrl, "/api/status");
    assert.equal(status, 200);
    assert.ok("promi" in body);
    assert.ok("xo" in body);
    assert.ok("worker" in body);
    assert.ok("verifier" in body);
    assert.doesNotMatch(JSON.stringify(body), /XO_API_KEY|Authorization|Bearer /i);
  } finally {
    await app.close();
  }
});

test("GET /api/missions lists the bundled demo mission", async () => {
  const app = await startTestApp();
  try {
    const { status, body } = await getJson(app.baseUrl, "/api/missions");
    assert.equal(status, 200);
    assert.ok(body.missions.some((m) => m.mission_id === DEMO_MISSION_ID));
  } finally {
    await app.close();
  }
});

test("GET /api/missions/:id returns the combined mission/worker/verification view", async () => {
  const app = await startTestApp();
  try {
    const { status, body } = await getJson(app.baseUrl, `/api/missions/${DEMO_MISSION_ID}`);
    assert.equal(status, 200);
    assert.equal(body.mission_id, DEMO_MISSION_ID);
    assert.ok(body.worker);
    assert.ok(body.verification);
    assert.equal(typeof body.verification.checks_total, "number");
  } finally {
    await app.close();
  }
});

test("GET /api/missions/:id/result returns the real captured MissionResult", async () => {
  const app = await startTestApp();
  try {
    const { status, body } = await getJson(app.baseUrl, `/api/missions/${DEMO_MISSION_ID}/result`);
    assert.equal(status, 200);
    assert.equal(body.mission_id, DEMO_MISSION_ID);
    assert.ok(body.tests.before);
    assert.ok(body.tests.after);
  } finally {
    await app.close();
  }
});

test("GET /api/missions/:id/verification returns the real persisted VerificationResult", async () => {
  const app = await startTestApp();
  try {
    const { status, body } = await getJson(app.baseUrl, `/api/missions/${DEMO_MISSION_ID}/verification`);
    assert.equal(status, 200);
    assert.equal(body.mission_id, DEMO_MISSION_ID);
    assert.ok(Array.isArray(body.checks));
    assert.ok(["PASS", "FAIL", "PARTIAL", "BLOCKED"].includes(body.verdict));
  } finally {
    await app.close();
  }
});

test("GET unknown mission returns 404 on every sub-resource", async () => {
  const app = await startTestApp();
  try {
    for (const suffix of ["", "/result", "/verification", "/observability"]) {
      const { status } = await getJson(app.baseUrl, `/api/missions/does-not-exist${suffix}`);
      assert.equal(status, 404, `expected 404 for ${suffix || "(base)"}`);
    }
  } finally {
    await app.close();
  }
});

test("POST /api/missions rejects a malformed mission (400) without registering it", async () => {
  const app = await startTestApp();
  try {
    const { status, body } = await getJson(app.baseUrl, "/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not: "a mission" }),
    });
    assert.equal(status, 400);
    assert.ok(Array.isArray(body.details));
  } finally {
    await app.close();
  }
});

test("POST /api/missions never silently expands a missing permission to true (deny-by-default is preserved end-to-end)", async () => {
  const app = await startTestApp();
  try {
    const partial = {
      schema_version: "1.0",
      mission_id: "mis_api_test_001",
      project: { id: "demo_project", name: "n", root: "demo_project", description: "d" },
      goal: "test deny-by-default over the wire",
      permissions: { read_files: true, deploy: false }, // everything else omitted
      constraints: { allowed_paths: ["demo_project/**"], forbidden_paths: [], allowed_commands: [], forbidden_commands: [], max_runtime_seconds: 60 },
      definition_of_done: ["done"],
    };
    const { status, body } = await getJson(app.baseUrl, "/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    assert.equal(status, 201);
    for (const key of ["modify_files", "run_commands", "run_tests", "create_branch", "commit", "open_pull_request", "merge", "external_send", "financial_action"]) {
      assert.equal(body.mission.permissions[key], false, `${key} must default to false`);
    }
    assert.equal(body.mission.permissions.read_files, true);
  } finally {
    await app.close();
  }
});

test("POST /api/missions/:id/run refuses any mission other than the sanitized demo mission", async () => {
  const app = await startTestApp();
  try {
    const created = await getJson(app.baseUrl, "/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema_version: "1.0",
        mission_id: "mis_not_the_demo",
        project: { id: "x", name: "x", root: "x", description: "x" },
        goal: "irrelevant",
        permissions: {},
        constraints: { allowed_paths: [], forbidden_paths: [], allowed_commands: [], forbidden_commands: [], max_runtime_seconds: 60 },
        definition_of_done: ["done"],
      }),
    });
    assert.equal(created.status, 201);
    const { status, body } = await getJson(app.baseUrl, "/api/missions/mis_not_the_demo/run", { method: "POST" });
    assert.equal(status, 400);
    assert.match(body.error, /sanitized demo mission/);
  } finally {
    await app.close();
  }
});

test("POST /api/missions/:id/run with a mocked runner: never touches the real XO pipeline, and the mission transitions RUNNING -> COMPLETED", async () => {
  let runCalls = 0;
  let verifyCalls = 0;
  const fakeRunMission = async ({ rawMission }) => {
    runCalls += 1;
    return {
      mission: rawMission,
      result: {
        schema_version: "1.0",
        mission_id: DEMO_MISSION_ID,
        status: "COMPLETED",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        summary: "fake run for API test",
        plan: [],
        actions: [],
        files_changed: [],
        commands_run: [],
        tests: { before: { total: 1, passed: 0, failed: 1, skipped: 0 }, after: { total: 1, passed: 1, failed: 0, skipped: 0 } },
        artifacts: [],
        errors: [],
        xo: { session_id: "fake-session", duration_ms: 1, usage: null },
        worker_claim: "COMPLETED",
      },
      canonicalBefore: { pass: 15, fail: 1, total: 16, skipped: 0, raw: "" },
      canonicalAfter: { pass: 15, fail: 1, total: 16, skipped: 0, raw: "" },
      canonicalIntegrityViolated: false,
      missionRunDir: "/tmp/fake",
    };
  };
  const fakeVerifyMission = () => {
    verifyCalls += 1;
    return { verification: { mission_id: DEMO_MISSION_ID, verdict: "PASS", checks: [], summary: "fake", evidence: [], violations: [] }, missionRunDir: "/tmp/fake" };
  };

  const app = await startTestApp({ runMission: fakeRunMission, verifyMission: fakeVerifyMission });
  try {
    const kicked = await getJson(app.baseUrl, `/api/missions/${DEMO_MISSION_ID}/run`, { method: "POST" });
    assert.equal(kicked.status, 202);
    assert.equal(kicked.body.state, "RUNNING");

    let finalState = null;
    for (let i = 0; i < 50 && finalState === null; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const { body } = await getJson(app.baseUrl, `/api/missions/${DEMO_MISSION_ID}`);
      if (body.state === "COMPLETED") finalState = body.state;
    }
    assert.equal(finalState, "COMPLETED");
    assert.equal(runCalls, 1);
    assert.equal(verifyCalls, 1);
  } finally {
    await app.close();
  }
});

test("POST /api/missions/:id/run refuses a concurrent second run while one is in progress", async () => {
  let resolveRun;
  const hangingRunMission = () => new Promise((resolve) => { resolveRun = resolve; });
  const app = await startTestApp({ runMission: hangingRunMission, verifyMission: () => ({ verification: null, missionRunDir: "" }) });
  try {
    const first = await getJson(app.baseUrl, `/api/missions/${DEMO_MISSION_ID}/run`, { method: "POST" });
    assert.equal(first.status, 202);
    const second = await getJson(app.baseUrl, `/api/missions/${DEMO_MISSION_ID}/run`, { method: "POST" });
    assert.equal(second.status, 409);
  } finally {
    resolveRun({
      mission: {},
      result: { worker_claim: "BLOCKED", xo: {}, tests: { before: {}, after: {} } },
      canonicalBefore: {},
      canonicalAfter: {},
      canonicalIntegrityViolated: false,
      missionRunDir: "",
    });
    await app.close();
  }
});

test("GET / serves the UI shell", async () => {
  const app = await startTestApp();
  try {
    const res = await fetch(`${app.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const text = await res.text();
    assert.match(text, /PROMI MISSION CONTROL/);
  } finally {
    await app.close();
  }
});
