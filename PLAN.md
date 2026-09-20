# PLAN.md

> The current plan. Agent-maintained. Updated when the plan changes — not at session boundaries. If this file is stale, the agent has failed at its job.

## Horizon

*Days, not weeks.* Long-horizon goals belong in `OBJECTIVES.md`. Live in-flight todos are recorded through the todo API and surfaced in `.xo/todos.json` — see AGENTS.md §5; a native todo tool does not reach it. This file is the **bridge**: how the next ~1–5 days will move objectives forward.

---

## Current plan

**As of:** 2026-09-20
**Driving objective:** O1 (execute one complete real autonomous mission inside XO)

### Strategy

Build the minimum reliable vertical slice before anything else: bootstrap the project correctly, define the mission/result contracts, stand up a sanitized demo project a worker can actually operate on, then wire dispatch → execution → evidence → verification end-to-end. TypeScript/Node throughout since it's already installed and fits the HTTP/SSE integration surface; no Docker, no database, no frontend framework until the slice proves out. Node's built-in test runner avoids installing test tooling before it's needed.

### Steps

1. **Bootstrap** — canonical XO project scaffold, git repo, public GitHub repo, clean initial commit. *(this session)*
2. **Mission schema** — define the structured mission contract Promi sends to the XO adapter.
3. **Sanitized demo project** — a small, self-contained project (in `demo_project/`) the worker can be safely dispatched against.
4. **XO adapter** (`src/xo/`) — dispatch missions to XO Space's HTTP/SSE API, read back worker activity.
5. **Worker execution** — trigger a real Claude Code worker run inside XO against the demo project.
6. **Structured result** (`src/mission/`) — define and populate the result contract (files touched, commands run, test output, diffs).
7. **Verifier** (`src/verifier/`) — independently check the result against mission success criteria; emit PASS/FAIL/PARTIAL/BLOCKED.
8. **Promi bridge** (`src/api/`) — the boundary Promi calls to dispatch a mission and receive the verified result.
9. **Observability** — surface XO timeline/activity data usable in a live demo.
10. **Demo/submission** — end-to-end walkthrough script and Devpost-safe materials.

### Open questions

- Exact shape of the mission schema (what fields Promi needs vs. what XO needs) — to resolve in phase 2.
- Exact XO API surface for dispatching a worker run vs. just observing an existing session — needs discovery once phase 4 starts.

### Risks / unknowns

- XO's dispatch API for triggering a *new* worker run (vs. observing the current session) hasn't been confirmed yet — may need discovery work in phase 4.
- Verifier criteria need to be concrete enough to actually fail a bad result, or O3 is unproven.

---

## Recently superseded plans

*When you replace a plan, move the old one here as a one-liner with a date — don't delete. Helps future agents see what was tried.*

- *(none yet)*
