import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { FileChange, FileChangeType } from "../mission/types.js";

const IGNORED_DIR_NAMES = new Set(["node_modules", ".git", "dist"]);

function hashFile(absolutePath: string): string {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

/** Recursively hashes every file under `rootDir`, keyed by path relative to it. Deterministic, sorted. */
export function snapshotDirectory(rootDir: string): Map<string, string> {
  const result = new Map<string, string>();

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;
        walk(abs);
      } else if (entry.isFile()) {
        result.set(path.relative(rootDir, abs), hashFile(abs));
      }
    }
  }

  if (statSync(rootDir, { throwIfNoEntry: false })) walk(rootDir);
  return result;
}

/** Diffs two snapshots (relative path -> sha256) into a sorted FileChange[]. */
export function diffSnapshots(before: Map<string, string>, after: Map<string, string>): FileChange[] {
  const paths = new Set<string>([...before.keys(), ...after.keys()]);
  const changes: FileChange[] = [];

  for (const p of paths) {
    const beforeHash = before.get(p) ?? null;
    const afterHash = after.get(p) ?? null;
    if (beforeHash === afterHash) continue;

    let change_type: FileChangeType;
    if (beforeHash === null) change_type = "created";
    else if (afterHash === null) change_type = "deleted";
    else change_type = "modified";

    changes.push({ path: p, change_type, before_hash: beforeHash, after_hash: afterHash });
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
