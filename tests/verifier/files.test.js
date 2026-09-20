import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePath, joinAndNormalize, normalizeRelativePath, pathMatchesGlob } from "../../dist/verifier/files.js";

test("normalizeRelativePath rejects a simple traversal", () => {
  assert.equal(normalizeRelativePath("../private.txt"), null);
});

test("normalizeRelativePath rejects traversal that escapes after several segments", () => {
  assert.equal(normalizeRelativePath("a/b/../../../etc/passwd"), null);
});

test("normalizeRelativePath resolves internal dot-segments and duplicate slashes safely", () => {
  assert.equal(normalizeRelativePath("a/./b//c"), "a/b/c");
  assert.equal(normalizeRelativePath("a/b/../c"), "a/c");
});

test("normalizeRelativePath rejects a POSIX absolute path", () => {
  assert.equal(normalizeRelativePath("/etc/passwd"), null);
});

test("normalizeRelativePath rejects a Windows drive-absolute path", () => {
  assert.equal(normalizeRelativePath("C:/Windows/System32"), null);
});

test("normalizeRelativePath rejects a URL-shaped path", () => {
  assert.equal(normalizeRelativePath("file:///etc/passwd"), null);
});

test("normalizeRelativePath normalizes mixed separators", () => {
  assert.equal(normalizeRelativePath("a\\b\\c"), "a/b/c");
});

test("pathMatchesGlob matches ** against nested paths", () => {
  assert.equal(pathMatchesGlob("demo_project/src/nested/dir/file.js", "demo_project/**"), true);
});

test("pathMatchesGlob does not match a sibling directory with a similar prefix", () => {
  assert.equal(pathMatchesGlob("demo_project_evil/file.js", "demo_project/**"), false);
});

test("pathMatchesGlob matches a bare filename pattern anywhere by basename", () => {
  assert.equal(pathMatchesGlob("demo_project/.env", ".env"), true);
  assert.equal(pathMatchesGlob(".env", ".env"), true);
});

test("evaluatePath treats an unsafe path as forbidden regardless of allowed_paths", () => {
  const verdict = evaluatePath("../escape.txt", { allowed_paths: ["**"], forbidden_paths: [] });
  assert.equal(verdict.safe, false);
  assert.equal(verdict.forbidden, true);
  assert.equal(verdict.allowed, false);
});

test("evaluatePath accepts a safe nested path under an allowed glob", () => {
  const verdict = evaluatePath("demo_project/src/nested/dir/file.js", { allowed_paths: ["demo_project/**"], forbidden_paths: [] });
  assert.equal(verdict.safe, true);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.forbidden, false);
});

test("evaluatePath flags a path matching forbidden_paths even if it would otherwise be allowed", () => {
  const verdict = evaluatePath(".xo/project.json", { allowed_paths: ["**"], forbidden_paths: [".xo/**"] });
  assert.equal(verdict.forbidden, true);
});

test("joinAndNormalize resolves a traversal relative to a project root back into a sibling path", () => {
  // A files_changed entry of "../private.txt" reported relative to demo_project
  // means "one level above demo_project" — resolves to "private.txt" at the
  // sandbox root, which then correctly fails an allowed_paths=["demo_project/**"] check.
  assert.equal(joinAndNormalize("demo_project", "../private.txt"), "private.txt");
  assert.equal(joinAndNormalize("demo_project", "../.xo/project.json"), ".xo/project.json");
});
