# PLAN.md

> The current plan. Agent-maintained. Updated when the plan changes — not at session boundaries. If this file is stale, the agent has failed at its job.

## Horizon

*Days, not weeks.* Long-horizon goals belong in `OBJECTIVES.md`. Live in-flight todos are recorded through the todo API and surfaced in `.xo/todos.json` — see AGENTS.md §5; a native todo tool does not reach it. This file is the **bridge**: how the next ~1–5 days will move objectives forward.

---

## Current plan

**As of:** 2026-09-20 (phases 1–6 complete)
**Driving objective:** O3 (independently verify the worker result) — O1 is achieved

### Strategy

Build the minimum reliable vertical slice before anything else: bootstrap the project correctly, define the mission/result contracts, stand up a sanitized demo project a worker can actually operate on, then wire dispatch → execution → evidence → verification end-to-end. TypeScript/Node throughout since it's already installed and fits the HTTP/SSE integration surface; no Docker, no database, no frontend framework until the slice proves out. Node's built-in test runner avoids installing test tooling before it's needed.

### Steps

1. **Bootstrap** — ✅ done. Canonical XO project scaffold, git repo, public GitHub repo, clean initial commit.
2. **Mission schema** — ✅ done. `src/mission/{types,schema,validate,result}.ts`: typed `Mission`, deny-by-default `MissionPermissions`, `MissionState` transition table, structured validation returning `ValidationError[]` (never throwing), `MissionResult` and `VerificationResult` with structural parsers. 20/20 mission-layer tests pass (`npm run test:mission`).
3. **Sanitized demo project** — ✅ done. `demo_project/`: an order discount engine with one intentional defect (GOLD-tier discount rounded per-line instead of once on the subtotal). 16 tests, 15 pass / 1 expected fail, verified by actually running `node --test` (not asserted). `demo_project/BUG.md` describes only observable behavior, not the root cause. `npm run verify` builds, runs core tests, and checks the demo baseline is exactly 1 failure (fails loudly if the defect is accidentally fixed early, or if it's broken beyond the intended failure).
4. **XO adapter** (`src/xo/`) — ✅ done. `types.ts`/`sse.ts`/`client.ts`/`dispatch.ts`/`workspace.ts`/`evidence.ts`/`session.ts`/`prompt.ts`. Discovered the real, running contract by reading `/opt/xo-space` source directly rather than guessing: `POST /api/chat/prompt` → `{stream_id, session_id}`, `GET /api/chat/stream/{id}` SSE (`session-created`/`text-delta`/`heartbeat`/`model-loading`/`agent-error`/`done`/`error`), `POST /api/chat/abort`. Confirmed empirically that loopback requests need no auth header — the client never reads or sends `XO_API_KEY`. 24/24 XO unit tests pass against mocked HTTP/SSE (`npm run test:xo`); no live agent involved.
5. **Worker execution** — ✅ done, real dispatch (not a mock). `npm run mission:demo` ran `demo/sample-mission.json` against a live Claude Code worker in XO. **Architectural finding baked into `workspace.ts`:** a worker's subprocess `cwd`/`--add-dir` can only ever be a direct top-level child of the discovered xo-projects root (confirmed by reading `adapter.py`/`project_layout.py` — `agent_id` resolves to exactly one path segment, never nested). So the disposable execution sandbox is a fresh sibling directory `~/xo-projects/mission-<id>/demo_project/` (materialized via `git archive HEAD -- demo_project`, safety-guarded to only ever delete a `mission-`-prefixed path), never nested inside this repo. This repo's gitignored `.mission-runs/<mission-id>/` holds bookkeeping only (baseline/after counts, hashes, the raw SSE log, `result.json`) — never the executable code copy. Two real bugs were found and fixed via one diagnosed, justified retry (not a blind retry): (a) a mission_id with underscores produced a sandbox dirname the `claude` CLI's own transcript-path encoding doesn't round-trip (it also collapses `_` to `-`, not just `/`), which silently zeroed out message hydration — fixed by keeping sandbox names hyphen-only; (b) the real `/api/messages` shape differs from a reasonable first guess (`message.data.role` not `message.role`; tool calls are `part.data.{tool,call_id,state.{status,input,output}}` not `{name,input,result_text,is_error}`) — fixed by reading one real captured response and correcting `session.ts` accordingly, with a fixture-based regression test added.
6. **Structured result** — ✅ done. `src/cli/missionDemo.ts` builds a real `MissionResult` end-to-end from an actual run: independently-measured file hashes/diff (adapter-side, not worker prose), independently-run before/after test counts, normalized `actions`/`commands_run` from the real transcript, and the worker's own final-text summary kept separate as `summary` (worker_claim is derived from the SSE transport outcome — done/agent-error/timeout — not by sniffing prose for a self-reported verdict). Persisted to `.mission-runs/<mission-id>/result.json` (gitignored).
7. **Verifier** (`src/verifier/`) — independently check the result against mission success criteria; emit PASS/FAIL/PARTIAL/BLOCKED. Worker `worker_claim` is never treated as a substitute for this. *(next)*
8. **Promi bridge** (`src/api/`) — the boundary Promi calls to dispatch a mission and receive the verified result.
9. **Observability** — surface XO timeline/activity data usable in a live demo.
10. **Demo/submission** — end-to-end walkthrough script and Devpost-safe materials.

`demo/sample-mission.json` and `demo/sample-forbidden-mission.json` (a guardrail mission whose goal text asks for a deploy step while `permissions.deploy` stays `false`) are both schema-validated by `tests/sample-missions.test.js` — real validation, not just hand-written JSON assumed correct. The forbidden-action mission has intentionally not been dispatched to a live worker yet — that's guardrail testing, planned alongside phase 7.

### Open questions

- The worker's OS-level tool sandbox (`--add-dir`) actually scopes to the whole `mission-<id>/` sandbox root, not `demo_project/` specifically — the prompt narrows the *intended* workspace, and the one real run respected it (verified independently via file-hash diffing and `.xo/` mtimes inside the sandbox), but this is cooperative compliance, not an OS-enforced jail. Worth keeping in mind for the verifier: it should check "nothing changed outside demo_project" explicitly rather than assume the sandbox guarantees it.
- Usage/cost telemetry (`GET /api/usage/sessions/{id}`) returned unavailable for this session — worth another look once the verifier phase needs cost data, but not blocking.

### Risks / unknowns

- Verifier criteria (phase 7) need to be concrete enough to actually fail a bad result, or O3 is unproven. Phases 2–6 only built the contracts, the fixture, and one successful real run — the verifier hasn't been tested against a *bad* result yet.

---

## Recently superseded plans

*When you replace a plan, move the old one here as a one-liner with a date — don't delete. Helps future agents see what was tried.*

- *(none yet)*
