#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { XoClient } from "../xo/client.js";
import { createApp, findAvailablePort, listen } from "../api/server.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

async function main(): Promise<void> {
  const port = await findAvailablePort([4173, 8787]);
  const app = createApp(REPO_ROOT, PUBLIC_DIR);
  const boundPort = await listen(app, port);

  const client = new XoClient();
  const health = await client.health().catch(() => ({ ok: false }));

  const proxyTemplate = process.env.VSCODE_PROXY_URI;
  const proxyUrl = proxyTemplate ? proxyTemplate.replace("{{port}}", String(boundPort)) : null;

  console.log("");
  console.log("PROMI MISSION CONTROL");
  console.log("");
  console.log(`Local:`);
  console.log(`  http://127.0.0.1:${boundPort}`);
  if (proxyUrl) {
    console.log("");
    console.log(`Workspace (browser-reachable via platform proxy):`);
    console.log(`  ${proxyUrl}`);
  }
  console.log("");
  console.log(`XO:`);
  console.log(`  ${health.ok ? "CONNECTED" : "UNREACHABLE"}`);
  console.log("");
  console.log(`Verifier:`);
  console.log(`  READY`);
  console.log("");
  console.log("Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("demo server failed to start:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
