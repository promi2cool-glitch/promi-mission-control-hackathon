# PLAN.md

> The current plan. Agent-maintained. Updated when the plan changes — not at session boundaries. If this file is stale, the agent has failed at its job.

## Horizon

*Days, not weeks.* Long-horizon goals belong in `OBJECTIVES.md`. Live in-flight todos are recorded through the todo API and surfaced in `.xo/todos.json` — see AGENTS.md §5; a native todo tool does not reach it. This file is the **bridge**: how the next ~1–5 days will move objectives forward.

---

## Current plan

**As of:** 2026-09-20 (phases 1–7 complete)
**Driving objective:** Phase 8 (Promi bridge + demo UI) — O1/O2/O3 are achieved

### Strategy

Build the minimum reliable vertical slice before anything else: bootstrap the project correctly, define the mission/result contracts, stand up a sanitized demo project a worker can actually operate on, then wire dispatch → execution → evidence → verification end-to-end. TypeScript/Node throughout since it's already installed and fits the HTTP/SSE integration surface; no Docker, no database, no frontend framework until the slice proves out. Node's built-in test runner avoids installing test tooling before it's needed.

### Steps

1. **Bootstrap** — ✅ done. Canonical XO project scaffold, git repo, public GitHub repo, clean initial commit.
2. **Mission schema** — ✅ done. `src/mission/{types,schema,validate,result}.ts`: typed `Mission`, deny-by-default `MissionPermissions`, `MissionState` transition table, structured validation returning `ValidationError[]` (never throwing), `MissionResult` and `VerificationResult` with structural parsers. 20/20 mission-layer tests pass (`npm run test:mission`).
3. **Sanitized demo project** — ✅ done. `demo_project/`: an order discount engine with one intentional defect (GOLD-tier discount rounded per-line instead of once on the subtotal). 16 tests, 15 pass / 1 expected fail, verified by actually running `node --test` (not asserted). `demo_project/BUG.md` describes only observable behavior, not the root cause. `npm run verify` builds, runs core tests, and checks the demo baseline is exactly 1 failure (fails loudly if the defect is accidentally fixed early, or if it's broken beyond the intended failure).
4. **XO adapter** (`src/xo/`) — ✅ done. `types.ts`/`sse.ts`/`client.ts`/`dispatch.ts`/`workspace.ts`/`evidence.ts`/`session.ts`/`prompt.ts`. Discovered the real, running contract by reading `/opt/xo-space` source directly rather than guessing: `POST /api/chat/prompt` → `{stream_id, session_id}`, `GET /api/chat/stream/{id}` SSE (`session-created`/`text-delta`/`heartbeat`/`model-loading`/`agent-error`/`done`/`error`), `POST /api/chat/abort`. Confirmed empirically that loopback requests need no auth header — the client never reads or sends `XO_API_KEY`. 24/24 XO unit tests pass against mocked HTTP/SSE (`npm run test:xo`); no live agent involved.
5. **Worker execution** — ✅ done, real dispatch (not a mock). `npm run mission:demo` ran `demo/sample-mission.json` against a live Claude Code worker in XO. **Architectural finding baked into `workspace.ts`:** a worker's subprocess `cwd`/`--add-dir` can only ever be a direct top-level child of the discovered xo-projects root (confirmed by reading `adapter.py`/`project_layout.py` — `agent_id` resolves to exactly one path segment, never nested). So the disposable execution sandbox is a fresh sibling directory `~/xo-projects/mission-<id>/demo_project/` (materialized via `git archive HEAD -- demo_project`, safety-guarded to only ever delete a `mission-`-prefixed path), never nested inside this repo. This repo's gitignored `.mission-runs/<mission-id>/` holds bookkeeping only (baseline/after counts, hashes, the raw SSE log, `result.json`) — never the executable code copy. Two real bugs were found and fixed via one diagnosed, justified retry (not a blind retry): (a) a mission_id with underscores produced a sandbox dirname the `claude` CLI's own transcript-path encoding doesn't round-trip (it also collapses `_` to `-`, not just `/`), which silently zeroed out message hydration — fixed by keeping sandbox names hyphen-only; (b) the real `/api/messages` shape differs from a reasonable first guess (`message.data.role` not `message.role`; tool calls are `part.data.{tool,call_id,state.{status,input,output}}` not `{name,input,result_text,is_error}`) — fixed by reading one real captured response and correcting `session.ts` accordingly, with a fixture-based regression test added.
6. **Structured result** — ✅ done. `src/cli/missionDemo.ts` builds a real `MissionResult` end-to-end from an actual run: independently-measured file hashes/diff (adapter-side, not worker prose), independently-run before/after test counts, normalized `actions`/`commands_run` from the real transcript, and the worker's own final-text summary kept separate as `summary` (worker_claim is derived from the SSE transport outcome — done/agent-error/timeout — not by sniffing prose for a self-reported verdict). Persisted to `.mission-runs/<mission-id>/result.json` (gitignored).
7. **Verifier** (`src/verifier/`) — ✅ done. A deterministic rules/evidence engine, no LLM in the verdict path: 12 named checks (`mission_identity`, `worker_completed`, `baseline_verified`, `regression_tests_pass`, `changed_files_allowed`, `forbidden_paths_untouched`, `permissions_respected`, `forbidden_commands_absent`, `workspace_confined`, `canonical_demo_unchanged`, `definition_of_done`, `evidence_complete`) feeding a priority-ordered verdict ladder (documented in `verify.ts`): a demonstrated contradiction always outranks missing evidence, so FAIL and BLOCKED mean genuinely different things. `npm run verify:mission -- <id>` ran the real completed mission and returned **PASS**, not hardcoded — it fell out of the checks. Then proved the verifier has teeth with 6 deterministic bad-case fixtures derived from the real result (no second live dispatch, per instruction): failing tests despite `worker_claim=COMPLETED` → FAIL; `../private.txt` path escape → FAIL; a synthetic `vercel deploy --prod` command against the guardrail mission's `permissions.deploy=false` → FAIL (confirmed separately that the goal text alone mentioning "deploy" does *not* trigger this — only an observed action/command does); missing critical evidence → BLOCKED; mission ID mismatch → FAIL; glowing worker prose contradicted by real test failure → FAIL. 30/30 verifier unit tests pass (`npm run test:verifier`); `verification.json`/`verification.html` persisted to `.mission-runs/<mission-id>/` (gitignored).
8. **Promi bridge** (`src/api/`) — the boundary Promi calls to dispatch a mission and receive the verified result. *(next)*
9. **Observability** — surface XO timeline/activity data usable in a live demo.
10. **Demo/submission** — end-to-end walkthrough script and Devpost-safe materials.

`demo/sample-mission.json` and `demo/sample-forbidden-mission.json` (a guardrail mission whose goal text asks for a deploy step while `permissions.deploy` stays `false`) are both schema-validated by `tests/sample-missions.test.js` — real validation, not just hand-written JSON assumed correct. The forbidden-action mission has intentionally not been dispatched to a live worker — the verifier's guardrail proof used a synthetic observed-command fixture against it instead, saving agent usage as instructed.

### Open questions

- The worker's OS-level tool sandbox (`--add-dir`) actually scopes to the whole `mission-<id>/` sandbox root, not `demo_project/` specifically. The verifier does not trust that boundary: `workspace_confined` and `changed_files_allowed` check independently-measured file paths/hashes, never sandbox placement alone.
- Usage/cost telemetry (`GET /api/usage/sessions/{id}`) returned unavailable for this session — `evidence_complete` doesn't require it (marked optional), but a real cost story for the demo still needs it from somewhere.
- `permissions.ts`'s deploy/external_send/financial_action/commit/PR/merge pattern lists are deliberately modest (documented as "not a giant speculative shell-security engine"). Phase 8 or a security-hardening pass should revisit them if the mission surface grows beyond this demo.

### Risks / unknowns

- The verifier's `definition_of_done` evaluation uses keyword-matching rules against free-text DoD items — reasonable for this demo's specific wording, but a differently-worded mission could hit the `unknown` fallback (which doesn't count against the verdict). Worth a more structured DoD schema if missions diversify.
- `canonical_demo_unchanged` re-measures canonical *now* (live) rather than reconstructing history at the time of the original run — honest for this architecture (canonical is supposed to be permanently static) but wouldn't generalize to a mission where the canonical project legitimately changes between runs.

---

## Recently superseded plans

*When you replace a plan, move the old one here as a one-liner with a date — don't delete. Helps future agents see what was tried.*

- *(none yet)*
