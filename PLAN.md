# PLAN.md

> The current plan. Agent-maintained. Updated when the plan changes — not at session boundaries. If this file is stale, the agent has failed at its job.

## Horizon

*Days, not weeks.* Long-horizon goals belong in `OBJECTIVES.md`. Live in-flight todos are recorded through the todo API and surfaced in `.xo/todos.json` — see AGENTS.md §5; a native todo tool does not reach it. This file is the **bridge**: how the next ~1–5 days will move objectives forward.

---

## Current plan

**As of:** 2026-09-20 (phases 1–3 complete)
**Driving objective:** O1 (execute one complete real autonomous mission inside XO)

### Strategy

Build the minimum reliable vertical slice before anything else: bootstrap the project correctly, define the mission/result contracts, stand up a sanitized demo project a worker can actually operate on, then wire dispatch → execution → evidence → verification end-to-end. TypeScript/Node throughout since it's already installed and fits the HTTP/SSE integration surface; no Docker, no database, no frontend framework until the slice proves out. Node's built-in test runner avoids installing test tooling before it's needed.

### Steps

1. **Bootstrap** — ✅ done. Canonical XO project scaffold, git repo, public GitHub repo, clean initial commit.
2. **Mission schema** — ✅ done. `src/mission/{types,schema,validate,result}.ts`: typed `Mission`, deny-by-default `MissionPermissions`, `MissionState` transition table, structured validation returning `ValidationError[]` (never throwing), `MissionResult` and `VerificationResult` with structural parsers. 20/20 mission-layer tests pass (`npm run test:mission`).
3. **Sanitized demo project** — ✅ done. `demo_project/`: an order discount engine with one intentional defect (GOLD-tier discount rounded per-line instead of once on the subtotal). 16 tests, 15 pass / 1 expected fail, verified by actually running `node --test` (not asserted). `demo_project/BUG.md` describes only observable behavior, not the root cause. `npm run verify` builds, runs core tests, and checks the demo baseline is exactly 1 failure (fails loudly if the defect is accidentally fixed early, or if it's broken beyond the intended failure).
4. **XO adapter** (`src/xo/`) — dispatch missions to XO Space's HTTP/SSE API, read back worker activity. *(next)*
5. **Worker execution** — trigger a real Claude Code worker run inside XO against the demo project, using `demo/sample-mission.json`.
6. **Structured result** — populate a real `MissionResult` from an actual worker run (files touched, commands run, test output, diffs).
7. **Verifier** (`src/verifier/`) — independently check the result against mission success criteria; emit PASS/FAIL/PARTIAL/BLOCKED. Worker `worker_claim` is never treated as a substitute for this.
8. **Promi bridge** (`src/api/`) — the boundary Promi calls to dispatch a mission and receive the verified result.
9. **Observability** — surface XO timeline/activity data usable in a live demo.
10. **Demo/submission** — end-to-end walkthrough script and Devpost-safe materials.

`demo/sample-mission.json` and `demo/sample-forbidden-mission.json` (a guardrail mission whose goal text asks for a deploy step while `permissions.deploy` stays `false`) are both schema-validated by `tests/sample-missions.test.js` — real validation, not just hand-written JSON assumed correct.

### Open questions

- Exact XO API surface for dispatching a *new* worker run vs. just observing an existing session — needs discovery once phase 4 starts.

### Risks / unknowns

- XO's dispatch API for triggering a *new* worker run (vs. observing the current session) hasn't been confirmed yet — may need discovery work in phase 4.
- Verifier criteria (phase 7) need to be concrete enough to actually fail a bad result, or O3 is unproven. Phases 2–3 only built the contracts and the fixture the verifier will eventually be tested against.

---

## Recently superseded plans

*When you replace a plan, move the old one here as a one-liner with a date — don't delete. Helps future agents see what was tried.*

- *(none yet)*
