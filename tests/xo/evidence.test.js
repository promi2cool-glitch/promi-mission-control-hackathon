import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { diffSnapshots, snapshotDirectory } from "../../dist/xo/evidence.js";

test("diffSnapshots detects created, modified, and deleted files", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
  try {
    writeFileSync(path.join(dir, "a.txt"), "hello");
    writeFileSync(path.join(dir, "b.txt"), "world");
    const before = snapshotDirectory(dir);

    writeFileSync(path.join(dir, "a.txt"), "hello modified");
    unlinkSync(path.join(dir, "b.txt"));
    writeFileSync(path.join(dir, "c.txt"), "new file");
    const after = snapshotDirectory(dir);

    const changes = diffSnapshots(before, after);
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]));

    assert.equal(changes.length, 3);
    assert.equal(byPath["a.txt"].change_type, "modified");
    assert.equal(byPath["b.txt"].change_type, "deleted");
    assert.equal(byPath["c.txt"].change_type, "created");
    assert.equal(byPath["c.txt"].before_hash, null);
    assert.equal(byPath["b.txt"].after_hash, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("diffSnapshots reports no changes for identical snapshots", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
  try {
    writeFileSync(path.join(dir, "a.txt"), "same");
    const before = snapshotDirectory(dir);
    const after = snapshotDirectory(dir);
    assert.deepEqual(diffSnapshots(before, after), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
