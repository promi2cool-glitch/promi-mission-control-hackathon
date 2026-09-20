// Shared fixtures for verifier tests. Deliberately shaped like the real
// completed mission (mis_demo_bugfix_001 / session 7d8303e2-...) so a
// "valid successful result" test exercises the same shape production code
// actually produces, not a convenient toy shape.

export function baseMission(overrides = {}) {
  return {
    schema_version: "1.0",
    mission_id: "mis_demo_bugfix_001",
    created_at: "2026-09-20T16:00:00.000Z",
    project: {
      id: "demo_project",
      name: "Order Discount Engine Demo",
      root: "demo_project",
      description: "Sanitized demo project with one intentional, reproducible functional defect.",
    },
    goal: "Inspect the demo project, reproduce the failing behavior, identify the root cause, implement the smallest safe repair, run the relevant tests and regression suite, and return sufficient evidence for independent verification.",
    context: { summary: "demo", relevant_files: [], notes: [] },
    permissions: {
      read_files: true,
      modify_files: true,
      run_commands: true,
      run_tests: true,
      create_branch: true,
      commit: false,
      open_pull_request: false,
      merge: false,
      deploy: false,
      external_send: false,
      financial_action: false,
    },
    constraints: {
      allowed_paths: ["demo_project/**"],
      forbidden_paths: ["../**", ".xo/**", ".env", ".git/**"],
      allowed_commands: ["node --test demo_project/test/**/*.test.js"],
      forbidden_commands: [],
      max_runtime_seconds: 900,
    },
    definition_of_done: [
      "failing behavior reproduced",
      "root cause identified",
      "minimal repair implemented",
      "targeted failing test passes",
      "complete test suite passes",
      "no files outside demo_project changed",
      "no forbidden action attempted",
      "structured evidence returned",
    ],
    metadata: { requested_by: "promi", tags: ["demo"] },
    ...overrides,
  };
}

export function baseResult(overrides = {}) {
  return {
    schema_version: "1.0",
    mission_id: "mis_demo_bugfix_001",
    status: "COMPLETED",
    started_at: "2026-09-20T16:35:11.088Z",
    finished_at: "2026-09-20T16:35:38.672Z",
    summary: "Root cause: GOLD-tier discount was rounded per line item instead of once on the subtotal. Fixed by removing the per-line branch.",
    plan: [],
    actions: [
      { timestamp: "2026-09-20T16:35:20.811Z", action_type: "Bash", description: "run tests", target: "node --test test/discountEngine.test.js", success: true, evidence_reference: "toolu_1" },
      { timestamp: "2026-09-20T16:35:24.709Z", action_type: "Edit", description: "Edit", target: "src/discountEngine.js", success: true, evidence_reference: "toolu_2" },
      { timestamp: "2026-09-20T16:35:26.293Z", action_type: "Bash", description: "run tests after fix", target: "node --test test/discountEngine.test.js", success: true, evidence_reference: "toolu_3" },
    ],
    files_changed: [{ path: "src/discountEngine.js", change_type: "modified", before_hash: "5c765ca1", after_hash: "a7a173e3" }],
    commands_run: [
      { command: "node --test test/discountEngine.test.js", cwd: ".", exit_code: 0, stdout_summary: "15 pass 1 fail", stderr_summary: "" },
      { command: "node --test test/discountEngine.test.js", cwd: ".", exit_code: 0, stdout_summary: "16 pass 0 fail", stderr_summary: "" },
    ],
    tests: {
      before: { total: 16, passed: 15, failed: 1, skipped: 0 },
      after: { total: 16, passed: 16, failed: 0, skipped: 0 },
    },
    artifacts: [],
    errors: [],
    xo: { session_id: "7d8303e2-b890-4ce7-ac77-f6c7a8066f15", duration_ms: 27584, usage: null },
    worker_claim: "COMPLETED",
    ...overrides,
  };
}

export function canonicalStillBroken() {
  const counts = { total: 16, passed: 15, failed: 1, skipped: 0 };
  return { canonicalDemoTests: { before: counts, after: counts } };
}
