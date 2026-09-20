import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { XoClient } from "./client.js";

const SANDBOX_PREFIX = "mission-";

export interface BaselineCheck {
  pass: number;
  fail: number;
  total: number;
  skipped: number;
  raw: string;
}

/**
 * Replaces every character that isn't [a-zA-Z0-9-] — underscores included.
 * Confirmed by direct observation: the `claude` CLI's own project-directory
 * encoding (under ~/.claude/projects/<encoded-dir>/) collapses underscores
 * to hyphens in addition to slashes, but the XO adapter's transcript lookup
 * only reverses the slash step. A sandbox name containing an underscore
 * therefore makes the CLI write its transcript under a different encoded
 * path than the one XO looks up — get_messages() then silently returns
 * empty. Keeping this segment hyphen-only (no underscores) avoids the
 * mismatch entirely.
 */
function sanitizeMissionIdSegment(missionId: string): string {
  const cleaned = missionId.replace(/[^a-zA-Z0-9-]/g, "-");
  if (!cleaned) throw new Error(`mission_id "${missionId}" has no usable characters for a directory name`);
  return cleaned;
}

/** Discovers the xo-projects root from the running Space rather than hardcoding ~/xo-projects. */
export async function discoverXoProjectsRoot(client: XoClient): Promise<string> {
  const workspace = await client.discoverWorkspace();
  const root = workspace.roots[workspace.default];
  if (!root) {
    throw new Error(`discoverXoProjectsRoot: no root for default key "${workspace.default}" in ${JSON.stringify(workspace.roots)}`);
  }
  return root;
}

export function sandboxDirName(missionId: string): string {
  return `${SANDBOX_PREFIX}${sanitizeMissionIdSegment(missionId)}`;
}

/**
 * Deletes and recreates a mission's disposable execution sandbox as a
 * fresh top-level directory under the discovered xo-projects root, then
 * materializes `demo_project/` into it from the repo's committed HEAD via
 * `git archive` — a clean, deterministic extraction of exactly what's
 * committed, never whatever happens to be dirty in the working tree.
 *
 * The sandbox lives OUTSIDE this repo. This is a deliberate adaptation to a
 * hard constraint of the running XO Space: a worker's subprocess cwd can
 * only ever be a direct top-level child of xo-projects root (confirmed by
 * reading services/cowork_agent/adapters/claude_code/adapter.py and
 * project_layout.py — agent_id resolves to exactly one path segment, never
 * a nested path). Putting the sandbox inside this repo was therefore not
 * technically possible; this repo's `.mission-runs/<mission-id>/` instead
 * holds bookkeeping (baseline/after counts, hashes, result.json) — never
 * the executable code copy itself.
 *
 * Safety: only ever deletes a path whose basename starts with "mission-"
 * and whose parent is exactly the discovered xo-projects root.
 */
export function materializeDemoProjectSandbox(options: {
  xoProjectsRoot: string;
  missionId: string;
  repoRoot: string;
}): { sandboxRoot: string; demoProjectPath: string } {
  const dirName = sandboxDirName(options.missionId);
  const sandboxRoot = path.join(options.xoProjectsRoot, dirName);

  if (!dirName.startsWith(SANDBOX_PREFIX) || path.dirname(sandboxRoot) !== options.xoProjectsRoot) {
    throw new Error(`refusing to materialize sandbox at unsafe path: ${sandboxRoot}`);
  }

  rmSync(sandboxRoot, { recursive: true, force: true });
  mkdirSync(sandboxRoot, { recursive: true });

  // `git archive HEAD -- demo_project | tar -x` extracts the committed
  // demo_project/ tree (with its own path prefix intact) directly into the
  // sandbox root, ignoring any dirty/uncommitted working-tree state.
  const archive = execFileSync("git", ["archive", "HEAD", "--", "demo_project"], {
    cwd: options.repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  execFileSync("tar", ["-x"], { cwd: sandboxRoot, input: archive });

  return { sandboxRoot, demoProjectPath: path.join(sandboxRoot, "demo_project") };
}

function parseTapCounts(output: string): { pass: number; fail: number; total: number; skipped: number } {
  function match(name: string): number {
    const m = new RegExp(`^ℹ ${name} (\\d+)`, "m").exec(output) ?? new RegExp(`^# ${name} (\\d+)`, "m").exec(output);
    return m ? Number(m[1]) : 0;
  }
  return { pass: match("pass"), fail: match("fail"), total: match("tests"), skipped: match("skipped") };
}

/**
 * Env for a spawned `node --test` child, stripped of NODE_TEST_CONTEXT /
 * NODE_TEST_WORKER_ID. When runDemoTests itself runs inside a `node --test`
 * process (our own unit tests do exactly this), those vars are inherited by
 * the child and make it detect a recursive test run and skip everything —
 * silently producing 0 pass / 0 fail instead of the real counts.
 */
function childTestEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  return env;
}

/** Runs the demo test suite inside a sandbox (or the canonical repo) and reports pass/fail counts. */
export function runDemoTests(cwd: string): BaselineCheck {
  let output: string;
  try {
    output = execFileSync("node", ["--test", "demo_project/test/**/*.test.js"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: childTestEnv(),
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  const counts = parseTapCounts(output);
  return { ...counts, raw: output };
}

/** Throws a descriptive error if the baseline doesn't match the required (pass, fail) counts exactly. */
export function requireBaseline(baseline: BaselineCheck, expectedPass: number, expectedFail: number): void {
  if (baseline.pass !== expectedPass || baseline.fail !== expectedFail) {
    throw new Error(
      `baseline mismatch: expected ${expectedPass} pass / ${expectedFail} fail, got ${baseline.pass} pass / ${baseline.fail} fail. Refusing to dispatch a worker against a sandbox that isn't in the expected starting state.`,
    );
  }
}
