import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { validateMission } from "../mission/validate.js";
import type { Mission, MissionResult, WorkerClaim } from "../mission/types.js";
import { XoClient } from "./client.js";
import { discoverXoProjectsRoot, materializeDemoProjectSandbox, requireBaseline, runDemoTests, sandboxDirName, type BaselineCheck } from "./workspace.js";
import { runPrompt } from "./dispatch.js";
import type { StreamOutcome } from "./types.js";
import { extractFinalAssistantText, hydrateSession, normalizeMessagesToEvidence } from "./session.js";
import { diffSnapshots, snapshotDirectory } from "./evidence.js";
import { buildWorkerPrompt } from "./prompt.js";

export interface RunMissionOptions {
  /** Absolute path to the repo root (where demo_project/, .mission-runs/, etc. live). */
  repoRoot: string;
  /** The raw, untrusted mission JSON to validate and run. */
  rawMission: unknown;
  /** Optional progress logger — called with one line per step. Defaults to a no-op. */
  log?: (message: string) => void;
}

export interface RunMissionOutcome {
  mission: Mission;
  result: MissionResult;
  canonicalBefore: BaselineCheck;
  canonicalAfter: BaselineCheck;
  canonicalIntegrityViolated: boolean;
  missionRunDir: string;
}

function deriveWorkerClaim(outcome: StreamOutcome): WorkerClaim {
  switch (outcome.kind) {
    case "done":
      return "COMPLETED";
    case "agent-error":
      return "FAILED";
    case "timeout":
    case "stream-error":
      return "BLOCKED";
  }
}

/**
 * The single, real implementation of the mission pipeline:
 * validate -> canonical baseline check -> XO health -> materialize disposable
 * sandbox -> sandbox baseline check -> snapshot -> dispatch -> stream ->
 * hydrate session -> snapshot again -> post-run tests -> canonical integrity
 * re-check -> structured MissionResult, persisted to
 * `.mission-runs/<mission-id>/`.
 *
 * Used by both `src/cli/missionDemo.ts` and the Promi bridge's
 * `POST /api/missions/:id/run` — there is exactly one worker pipeline
 * implementation, not two.
 */
export async function runDemoMission(options: RunMissionOptions): Promise<RunMissionOutcome> {
  const log = options.log ?? (() => {});
  const REPO_ROOT = options.repoRoot;

  const validation = validateMission(options.rawMission);
  if (!validation.ok) {
    throw new Error(`mission is invalid: ${JSON.stringify(validation.errors)}`);
  }
  const mission = validation.mission;
  log(`MISSION VALIDATION: PASS (${mission.mission_id})`);

  log("\n== canonical demo_project baseline (must remain 15 pass / 1 fail) ==");
  const canonicalBefore = runDemoTests(REPO_ROOT);
  log(`canonical: ${canonicalBefore.pass} pass / ${canonicalBefore.fail} fail`);
  requireBaseline(canonicalBefore, 15, 1); // throws with a clear message if the canonical demo isn't in the expected state

  const client = new XoClient();

  log("\n== XO health check ==");
  const health = await client.health();
  log(`health: ok=${health.ok} status=${health.status}`);
  if (!health.ok) {
    throw new Error(`XO API health check failed (status ${health.status})`);
  }

  log("\n== discovering xo-projects root ==");
  const xoProjectsRoot = await discoverXoProjectsRoot(client);
  log(`xo-projects root: ${xoProjectsRoot}`);

  const missionRunDir = path.join(REPO_ROOT, ".mission-runs", mission.mission_id);
  mkdirSync(missionRunDir, { recursive: true });

  log("\n== materializing disposable sandbox from committed HEAD ==");
  const { sandboxRoot, demoProjectPath } = materializeDemoProjectSandbox({
    xoProjectsRoot,
    missionId: mission.mission_id,
    repoRoot: REPO_ROOT,
  });
  log(`sandbox: ${sandboxRoot}`);

  log("\n== sandbox baseline (must be exactly 15 pass / 1 fail) ==");
  const sandboxBaseline = runDemoTests(sandboxRoot);
  log(`sandbox baseline: ${sandboxBaseline.pass} pass / ${sandboxBaseline.fail} fail`);
  writeFileSync(path.join(missionRunDir, "baseline.json"), JSON.stringify(sandboxBaseline, null, 2));
  requireBaseline(sandboxBaseline, 15, 1);

  log("\n== snapshotting sandbox before dispatch ==");
  const beforeSnapshot = snapshotDirectory(demoProjectPath);
  log(`snapshot: ${beforeSnapshot.size} files hashed`);

  const agentId = sandboxDirName(mission.mission_id);
  const workerPrompt = buildWorkerPrompt(mission, demoProjectPath);

  log(`\n== dispatching mission through XO (agent_name=claude_code, agent_id=${agentId}) ==`);
  const startedAt = new Date().toISOString();
  const runResult = await runPrompt(
    client,
    { text: workerPrompt, agent_name: "claude_code", agent_id: agentId },
    { maxRuntimeSeconds: mission.constraints.max_runtime_seconds },
  );
  const finishedAt = new Date().toISOString();

  log(`stream_id: ${runResult.streamId}`);
  log(`session_id: ${runResult.sessionId}`);
  log(`outcome: ${runResult.outcome.kind}`);
  log(`events observed: ${runResult.events.length}`);
  log(`duration: ${runResult.durationMs}ms`);

  writeFileSync(
    path.join(missionRunDir, "sse-events.jsonl"),
    runResult.events.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );

  let messages: Awaited<ReturnType<typeof hydrateSession>>["messages"] = [];
  let session: Awaited<ReturnType<typeof hydrateSession>>["session"] = null;
  let usage: Awaited<ReturnType<typeof hydrateSession>>["usage"] = { available: false, raw: null };

  if (runResult.sessionId) {
    log("\n== hydrating XO session/messages/usage ==");
    const hydration = await hydrateSession(client, runResult.sessionId);
    session = hydration.session;
    messages = hydration.messages;
    usage = hydration.usage;
    log(`session found: ${session !== null}`);
    log(`message count: ${messages.length}`);
    log(`usage available: ${usage.available}`);
  } else {
    log("\n(no session_id resolved — skipping session hydration)");
  }

  log("\n== snapshotting sandbox after run ==");
  const afterSnapshot = snapshotDirectory(demoProjectPath);
  const filesChanged = diffSnapshots(beforeSnapshot, afterSnapshot);
  log(`files changed: ${filesChanged.length}`);
  for (const f of filesChanged) log(`  ${f.change_type} ${f.path}`);

  log("\n== running sandbox tests after worker completion (target: 16 pass / 0 fail) ==");
  const afterTests = runDemoTests(sandboxRoot);
  log(`sandbox after: ${afterTests.pass} pass / ${afterTests.fail} fail`);
  writeFileSync(path.join(missionRunDir, "after.json"), JSON.stringify(afterTests, null, 2));

  log("\n== re-checking canonical demo_project (must remain 15 pass / 1 fail) ==");
  const canonicalAfter = runDemoTests(REPO_ROOT);
  log(`canonical after: ${canonicalAfter.pass} pass / ${canonicalAfter.fail} fail`);
  let canonicalIntegrityViolated = false;
  if (canonicalAfter.pass !== 15 || canonicalAfter.fail !== 1) {
    canonicalIntegrityViolated = true;
    log("\n*** CRITICAL: canonical demo_project no longer matches 15 pass / 1 fail. ***");
    log("*** Something touched the canonical project during the mission run. ***");
    const status = execFileSync("git", ["status", "--porcelain", "--", "demo_project"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    log(`git status for demo_project:\n${status || "(clean working tree — investigate immediately; the difference is not from an uncommitted edit)"}`);
  }

  const { actions, commands_run } = normalizeMessagesToEvidence(messages);
  const summary = extractFinalAssistantText(messages) || "(no assistant text captured)";
  const workerClaim = deriveWorkerClaim(runResult.outcome);

  const errors: MissionResult["errors"] =
    runResult.outcome.kind === "agent-error"
      ? [{ code: "agent-error", message: runResult.outcome.message }]
      : runResult.outcome.kind === "stream-error"
        ? [{ code: "stream-error", message: runResult.outcome.message }]
        : runResult.outcome.kind === "timeout"
          ? [{ code: "timeout", message: `mission exceeded max_runtime_seconds=${mission.constraints.max_runtime_seconds}` }]
          : [];

  if (canonicalIntegrityViolated) {
    errors.push({ code: "canonical-integrity-violation", message: "canonical demo_project no longer matches 15 pass / 1 fail after the mission run" });
  }

  const result: MissionResult = {
    schema_version: mission.schema_version,
    mission_id: mission.mission_id,
    status: workerClaim === "COMPLETED" ? "COMPLETED" : workerClaim === "FAILED" ? "FAILED" : "BLOCKED",
    started_at: startedAt,
    finished_at: finishedAt,
    summary,
    plan: [],
    actions,
    files_changed: filesChanged,
    commands_run,
    tests: {
      before: { total: sandboxBaseline.total, passed: sandboxBaseline.pass, failed: sandboxBaseline.fail, skipped: sandboxBaseline.skipped },
      after: { total: afterTests.total, passed: afterTests.pass, failed: afterTests.fail, skipped: afterTests.skipped },
    },
    artifacts: [{ type: "sse-log", path: path.join(missionRunDir, "sse-events.jsonl"), description: "raw normalized SSE event log for this run" }],
    errors,
    xo: {
      session_id: runResult.sessionId,
      duration_ms: runResult.durationMs,
      usage: usage.available ? (usage.raw as Record<string, unknown>) : null,
    },
    worker_claim: workerClaim,
  };

  writeFileSync(path.join(missionRunDir, "result.json"), JSON.stringify(result, null, 2));

  return { mission, result, canonicalBefore, canonicalAfter, canonicalIntegrityViolated, missionRunDir };
}
