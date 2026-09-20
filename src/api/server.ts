import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { validateMission } from "../mission/validate.js";
import { normalizeRelativePath } from "../verifier/files.js";
import { readMissionResult } from "./data.js";
import { defaultRouteDependencies, handleApiRequest, readPackageVersion, type RouteContext } from "./routes.js";
import { MissionStore } from "./store.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(res: import("node:http").ServerResponse, publicDir: string, pathname: string): void {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const safe = normalizeRelativePath(relative);
  if (safe === null) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("bad path");
    return;
  }

  let filePath = path.join(publicDir, safe);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(publicDir, "index.html"); // single-page app: unknown paths fall back to index.html
  }
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

export interface App {
  server: Server;
  ctx: RouteContext;
}

/** Builds the HTTP server (API + static UI) without starting it — used by both the demo entrypoint and tests. */
export function createApp(
  repoRoot: string,
  publicDir: string,
  dependencyOverrides?: Partial<Pick<RouteContext, "runMission" | "verifyMission">>,
): App {
  const store = new MissionStore();
  const demoMissionPath = path.join(repoRoot, "demo", "sample-mission.json");
  const rawMission = JSON.parse(readFileSync(demoMissionPath, "utf8"));
  const missionOutcome = validateMission(rawMission);
  if (!missionOutcome.ok) {
    throw new Error(`bundled demo mission is invalid: ${JSON.stringify(missionOutcome.errors)}`);
  }
  const demoMissionId = missionOutcome.mission.mission_id;
  store.registerMission(missionOutcome.mission);

  // Seed run state from whatever is already on disk (e.g. the real captured run from phases 5-7) —
  // the bridge never fabricates a COMPLETED state, it reflects what actually happened.
  const existingResult = readMissionResult(repoRoot, demoMissionId);
  if (existingResult) {
    store.setStatus(demoMissionId, {
      state: existingResult.worker_claim === "COMPLETED" ? "COMPLETED" : existingResult.worker_claim,
      startedAt: existingResult.started_at,
      finishedAt: existingResult.finished_at,
      error: null,
    });
  }

  const ctx: RouteContext = {
    repoRoot,
    store,
    demoMissionId,
    version: readPackageVersion(repoRoot),
    ...defaultRouteDependencies(),
    ...dependencyOverrides,
  };

  const server = createHttpServer((req, res) => {
    handleApiRequest(req, res, ctx)
      .then((handled) => {
        if (!handled) serveStatic(res, publicDir, new URL(req.url ?? "/", "http://localhost").pathname);
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      });
  });

  return { server, ctx };
}

/** Probes whether a port is free by briefly listening on it. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

/** Tries each preferred port in order, then falls back to an OS-assigned ephemeral port. */
export async function findAvailablePort(preferred: number[]): Promise<number> {
  for (const port of preferred) {
    if (await isPortFree(port)) return port;
  }
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export function listen(app: App, port: number): Promise<number> {
  return new Promise((resolve) => {
    // 127.0.0.1 only: the platform's own port-forward/proxy (not a public 0.0.0.0 bind)
    // is how this becomes browser-reachable — see docs/PROMI_INTEGRATION.md.
    app.server.listen(port, "127.0.0.1", () => {
      const address = app.server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}
