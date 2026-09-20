import { readFileSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { validateMission } from "../mission/validate.js";
import { XoClient } from "../xo/client.js";
import { runDemoMission } from "../xo/runMission.js";
import { verifyStoredMission } from "../verifier/verifyStoredMission.js";
import { buildObservability, readMissionResult, readVerificationResult } from "./data.js";
import { MissionStore } from "./store.js";

export interface RouteContext {
  repoRoot: string;
  store: MissionStore;
  demoMissionId: string;
  version: string;
  /**
   * Injectable seams for the real pipeline — default to the real
   * implementations (see createRouteContext below). Tests substitute fakes
   * here so `POST /:id/run` never has to hit a live XO worker to be tested.
   */
  runMission: typeof runDemoMission;
  verifyMission: typeof verifyStoredMission;
}

export function defaultRouteDependencies(): Pick<RouteContext, "runMission" | "verifyMission"> {
  return { runMission: runDemoMission, verifyMission: verifyStoredMission };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function notFound(res: ServerResponse, message: string): void {
  sendJson(res, 404, { error: message });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/** GET /health with a short timeout — never lets the bridge's own health check hang if XO is down. */
async function pingXo(ctx: RouteContext): Promise<"reachable" | "unreachable"> {
  const client = new XoClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const health = await client.health();
    return health.ok ? "reachable" : "unreachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

function missionSummary(ctx: RouteContext, missionId: string) {
  const mission = ctx.store.getMission(missionId);
  if (!mission) return null;
  const status = ctx.store.getStatus(missionId);
  const result = readMissionResult(ctx.repoRoot, missionId);
  const verification = readVerificationResult(ctx.repoRoot, missionId);

  return {
    mission_id: missionId,
    state: status.state,
    started_at: status.startedAt,
    finished_at: status.finishedAt,
    error: status.error,
    mission,
    worker: {
      runtime: "claude_code",
      status: result?.worker_claim ?? "PENDING",
    },
    result_available: result !== null,
    verification: {
      status: verification !== null ? "COMPLETE" : "PENDING",
      verdict: verification?.verdict ?? null,
      checks_passed: verification ? verification.checks.filter((c) => c.passed).length : 0,
      checks_total: verification ? verification.checks.length : 0,
    },
  };
}

async function runAndVerify(ctx: RouteContext, missionId: string): Promise<void> {
  const mission = ctx.store.getMission(missionId);
  if (!mission) return;
  try {
    const outcome = await ctx.runMission({ repoRoot: ctx.repoRoot, rawMission: mission });
    ctx.verifyMission({ repoRoot: ctx.repoRoot, mission });
    ctx.store.setStatus(missionId, {
      state: outcome.result.worker_claim === "COMPLETED" ? "COMPLETED" : outcome.result.worker_claim,
      finishedAt: new Date().toISOString(),
      error: outcome.canonicalIntegrityViolated ? "canonical demo_project integrity violation detected after run" : null,
    });
  } catch (err) {
    ctx.store.setStatus(missionId, {
      state: "FAILED",
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Returns true if the request was an /api/* route and was handled (including 404s within the API namespace). */
export async function handleApiRequest(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  const method = req.method ?? "GET";

  if (!pathname.startsWith("/api/")) return false;

  if (method === "GET" && pathname === "/api/health") {
    const xo = await pingXo(ctx);
    sendJson(res, 200, { status: "ok", service: "promi-mission-control", version: ctx.version, xo, verifier: "ready" });
    return true;
  }

  if (method === "GET" && pathname === "/api/status") {
    const xo = await pingXo(ctx);
    const status = ctx.store.getStatus(ctx.demoMissionId);
    const verification = readVerificationResult(ctx.repoRoot, ctx.demoMissionId);
    sendJson(res, 200, {
      promi: "online",
      xo,
      worker: { state: status.state },
      verifier: { state: "ready", last_verdict: verification?.verdict ?? null },
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/missions") {
    sendJson(res, 200, { missions: ctx.store.listMissions() });
    return true;
  }

  const missionMatch = /^\/api\/missions\/([^/]+)(\/(result|verification|observability|run))?$/.exec(pathname);

  if (method === "POST" && pathname === "/api/missions") {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "request body is not valid JSON" });
      return true;
    }
    const outcome = validateMission(body);
    if (!outcome.ok) {
      sendJson(res, 400, { error: "mission is invalid", details: outcome.errors });
      return true;
    }
    ctx.store.registerMission(outcome.mission);
    sendJson(res, 201, { mission: outcome.mission });
    return true;
  }

  if (missionMatch) {
    const missionId = decodeURIComponent(missionMatch[1]);
    const sub = missionMatch[3];

    if (method === "GET" && !sub) {
      const summary = missionSummary(ctx, missionId);
      if (!summary) return notFound(res, `unknown mission "${missionId}"`), true;
      sendJson(res, 200, summary);
      return true;
    }

    if (method === "GET" && sub === "result") {
      if (!ctx.store.getMission(missionId)) return notFound(res, `unknown mission "${missionId}"`), true;
      const result = readMissionResult(ctx.repoRoot, missionId);
      if (!result) return notFound(res, `no MissionResult yet for "${missionId}"`), true;
      sendJson(res, 200, result);
      return true;
    }

    if (method === "GET" && sub === "verification") {
      if (!ctx.store.getMission(missionId)) return notFound(res, `unknown mission "${missionId}"`), true;
      const verification = readVerificationResult(ctx.repoRoot, missionId);
      if (!verification) return notFound(res, `no VerificationResult yet for "${missionId}"`), true;
      sendJson(res, 200, verification);
      return true;
    }

    if (method === "GET" && sub === "observability") {
      if (!ctx.store.getMission(missionId)) return notFound(res, `unknown mission "${missionId}"`), true;
      const result = readMissionResult(ctx.repoRoot, missionId);
      if (!result) return notFound(res, `no execution evidence yet for "${missionId}"`), true;
      sendJson(res, 200, buildObservability(result));
      return true;
    }

    if (method === "POST" && sub === "run") {
      if (!ctx.store.getMission(missionId)) return notFound(res, `unknown mission "${missionId}"`), true;
      // Hackathon-safety: only the sanitized demo mission can be executed
      // through this endpoint — never an arbitrary root/path from a public UI.
      if (missionId !== ctx.demoMissionId) {
        sendJson(res, 400, { error: `only the sanitized demo mission ("${ctx.demoMissionId}") can be executed via this endpoint` });
        return true;
      }
      const current = ctx.store.getStatus(missionId);
      if (current.state === "RUNNING" || current.state === "QUEUED") {
        sendJson(res, 409, { error: "a run is already in progress for this mission", state: current.state });
        return true;
      }
      ctx.store.setStatus(missionId, { state: "RUNNING", startedAt: new Date().toISOString(), finishedAt: null, error: null });
      void runAndVerify(ctx, missionId); // fire-and-forget; client polls GET /api/missions/:id
      sendJson(res, 202, { mission_id: missionId, state: "RUNNING" });
      return true;
    }
  }

  notFound(res, `no such route: ${method} ${pathname}`);
  return true;
}

export function readPackageVersion(repoRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
