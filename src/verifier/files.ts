/**
 * Deterministic, dependency-free path safety for the verifier. Handles the
 * traversal tricks explicitly called out for this phase: `../` escapes,
 * absolute-path bypass, mixed separators, duplicate slashes, and dot-segment
 * bypass (`a/./b`, `a/b/../../c`). This is NOT a general-purpose glob
 * library — it implements exactly the subset the mission contract needs
 * (`*`, `**`) deterministically.
 */

/**
 * Normalizes a path into a safe, root-relative POSIX path, or returns null
 * if it is absolute or escapes above its own root once `..` segments are
 * resolved. Never throws.
 */
export function normalizeRelativePath(input: string): string | null {
  if (typeof input !== "string" || input.length === 0) return null;

  const slashified = input.replace(/\\/g, "/");
  if (slashified.startsWith("/")) return null; // POSIX absolute
  if (/^[a-zA-Z]:\//.test(slashified)) return null; // Windows drive-absolute
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(slashified)) return null; // URL-shaped (file://, etc.)

  const stack: string[] = [];
  for (const segment of slashified.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return null; // escapes above root
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join("/");
}

/** Joins a root-relative base and a path relative to it, then normalizes/re-validates the result. */
export function joinAndNormalize(base: string, relative: string): string | null {
  const normalizedBase = normalizeRelativePath(base) ?? "";
  const combined = normalizedBase ? `${normalizedBase}/${relative}` : relative;
  return normalizeRelativePath(combined);
}

function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/\\/g, "/");
  let pattern = "^";
  let i = 0;
  while (i < g.length) {
    if (g[i] === "*" && g[i + 1] === "*") {
      pattern += ".*";
      i += 2;
      if (g[i] === "/") i += 1; // "dir/**" also matches "dir" itself
      continue;
    }
    if (g[i] === "*") {
      pattern += "[^/]*";
      i += 1;
      continue;
    }
    pattern += g[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }
  pattern += "$";
  return new RegExp(pattern);
}

/**
 * True if a normalized, safe relative path matches a glob pattern.
 * A pattern with no `/` also matches by basename anywhere (so a bare
 * pattern like `.env` catches `demo_project/.env`, not just a root-level
 * `.env`) — deliberately conservative for a forbidden-paths list.
 */
export function pathMatchesGlob(safePath: string, glob: string): boolean {
  if (globToRegExp(glob).test(safePath)) return true;
  if (!glob.includes("/")) {
    const basename = safePath.split("/").pop() ?? safePath;
    return globToRegExp(glob).test(basename);
  }
  return false;
}

export interface PathPolicy {
  allowed_paths: string[];
  forbidden_paths: string[];
}

export type PathVerdict =
  | { safe: true; allowed: boolean; forbidden: boolean }
  | { safe: false; allowed: false; forbidden: true; reason: string };

/**
 * Evaluates one changed-file path against a mission's path policy. An unsafe
 * (unnormalizable) path is always treated as forbidden — never silently
 * dropped — regardless of what allowed_paths says.
 */
export function evaluatePath(rawPath: string, policy: PathPolicy): PathVerdict {
  const safe = normalizeRelativePath(rawPath);
  if (safe === null) {
    return { safe: false, allowed: false, forbidden: true, reason: `path "${rawPath}" is unsafe (absolute, or escapes its root)` };
  }
  const forbidden = policy.forbidden_paths.some((g) => pathMatchesGlob(safe, g));
  const allowed = policy.allowed_paths.length === 0 ? true : policy.allowed_paths.some((g) => pathMatchesGlob(safe, g));
  return { safe: true, allowed, forbidden };
}
