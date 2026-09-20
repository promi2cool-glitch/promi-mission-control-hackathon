import type { Mission, MissionResult, VerificationResult } from "../mission/types.js";

export interface PersistedVerificationResult extends VerificationResult {
  verified_at: string;
}

export function toPersistedJson(result: VerificationResult): PersistedVerificationResult {
  return { ...result, verified_at: new Date().toISOString() };
}

function checkMark(passed: boolean): string {
  return passed ? "✓" : "✗";
}

/** A concise, demo-readable plain-text report. */
export function renderTextReport(mission: Mission, missionResult: MissionResult, verification: VerificationResult): string {
  const lines: string[] = [];
  lines.push("PROMI VERIFICATION");
  lines.push("");
  lines.push(`Mission:`);
  lines.push(`  ${mission.mission_id}`);
  lines.push("");
  lines.push(`Worker:`);
  lines.push(`  ${missionResult.worker_claim}`);
  lines.push("");
  lines.push("Checks:");
  for (const c of verification.checks) {
    lines.push(`  ${checkMark(c.passed)} ${c.name}${c.required ? "" : " (advisory)"} — ${c.reason}`);
  }
  lines.push("");
  lines.push("VERDICT");
  lines.push("");
  lines.push(`  ${verification.verdict}`);
  lines.push("");
  lines.push(`Summary: ${verification.summary}`);
  if (verification.violations.length > 0) {
    lines.push("");
    lines.push("Violations:");
    for (const v of verification.violations) lines.push(`  - ${v}`);
  }
  lines.push("");
  lines.push("Evidence:");
  lines.push(`  XO session:    ${missionResult.xo.session_id ?? "(none)"}`);
  lines.push(`  Changed:       ${missionResult.files_changed.map((f) => f.path).join(", ") || "(none)"}`);
  lines.push(`  Before:        ${missionResult.tests.before.passed} PASS / ${missionResult.tests.before.failed} FAIL`);
  lines.push(`  After:         ${missionResult.tests.after.passed} PASS / ${missionResult.tests.after.failed} FAIL`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const VERDICT_COLORS: Record<string, string> = {
  PASS: "#1a7f37",
  FAIL: "#cf222e",
  PARTIAL: "#9a6700",
  BLOCKED: "#57606a",
};

/** Standalone, dependency-free HTML report — no frontend framework, just generated markup. */
export function renderHtmlReport(mission: Mission, missionResult: MissionResult, verification: VerificationResult): string {
  const color = VERDICT_COLORS[verification.verdict] ?? "#57606a";
  const checksRows = verification.checks
    .map(
      (c) => `
      <tr class="${c.passed ? "pass" : "fail"}">
        <td>${c.passed ? "✓" : "✗"}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${c.required ? "required" : "advisory"}</td>
        <td>${escapeHtml(c.reason)}</td>
      </tr>`,
    )
    .join("");

  const violationsList =
    verification.violations.length > 0
      ? `<ul>${verification.violations.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>`
      : "<p class=\"muted\">none</p>";

  const changedFilesList =
    missionResult.files_changed.length > 0
      ? `<ul>${missionResult.files_changed.map((f) => `<li><code>${escapeHtml(f.path)}</code> (${f.change_type})</li>`).join("")}</ul>`
      : "<p class=\"muted\">none</p>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Promi Verification — ${escapeHtml(mission.mission_id)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; background: #fff; color: #1f2328; }
  @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } table.checks tr.pass { background: #0f2a17 !important; } table.checks tr.fail { background: #3a0d10 !important; } code { background: #21262d !important; } }
  h1 { font-size: 1.4rem; margin-bottom: 0; }
  .subtitle { color: #656d76; margin-top: 0.2rem; }
  .verdict { display: inline-block; padding: 0.5rem 1.25rem; border-radius: 6px; font-weight: 700; font-size: 1.4rem; color: #fff; background: ${color}; margin: 1rem 0; }
  table.checks { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  table.checks th, table.checks td { border: 1px solid #d0d7de; padding: 0.5rem 0.6rem; text-align: left; font-size: 0.92rem; }
  table.checks tr.pass { background: #eefbf1; }
  table.checks tr.fail { background: #fff0f0; }
  .muted { color: #656d76; }
  code { background: #f6f8fa; padding: 0.1rem 0.3rem; border-radius: 4px; }
  section { margin: 1.5rem 0; }
</style>
</head>
<body>
  <h1>Promi Verification</h1>
  <p class="subtitle">Mission <code>${escapeHtml(mission.mission_id)}</code> — worker reported <strong>${escapeHtml(missionResult.worker_claim)}</strong></p>

  <div class="verdict">${verification.verdict}</div>
  <p>${escapeHtml(verification.summary)}</p>

  <section>
    <h2>Checks</h2>
    <table class="checks">
      <thead><tr><th></th><th>Check</th><th>Kind</th><th>Reason</th></tr></thead>
      <tbody>${checksRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Violations</h2>
    ${violationsList}
  </section>

  <section>
    <h2>Evidence</h2>
    <ul>
      <li>XO session: <code>${escapeHtml(missionResult.xo.session_id ?? "(none)")}</code></li>
      <li>Before: ${missionResult.tests.before.passed} PASS / ${missionResult.tests.before.failed} FAIL</li>
      <li>After: ${missionResult.tests.after.passed} PASS / ${missionResult.tests.after.failed} FAIL</li>
    </ul>
    <h3>Changed files</h3>
    ${changedFilesList}
  </section>

  <p class="muted">Generated by the Promi independent verifier — a deterministic rules/evidence engine, not an LLM judgment.</p>
</body>
</html>
`;
}
