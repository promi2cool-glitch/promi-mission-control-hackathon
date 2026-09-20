# PROGRESS.md

> Running narrative of what's actually been done. **Append-only** — never edit prior entries. One paragraph per session at close. Read by every agent at boot (last ~30 lines only).

## Format

```
## YYYY-MM-DD — [outcome] one-line headline
agent: <model id>

3–6 sentences: what was attempted, what shipped, what's blocked, what's next.
Be honest about partial work.
```

`[outcome]` ∈ `shipped | progress | blocked | pivoted | cleanup | research`.

---

## 2026-09-20 — [shipped] Bootstrapped Promi Mission Control as a canonical XO project

agent: claude-sonnet-5

Scaffolded the project via `GET /api/config/workspace` + `POST /api/files/mkdir` with `scaffold=true` (no manual mkdir), filled in `PROJECT.md`, `OBJECTIVES.md` (O1–O5), and `PLAN.md` (10-phase plan) with real content, and appended a project-specific rules section (§12) to `AGENTS.md` covering secret handling, no production/live-trading, and the verification-over-completion principle. Added the initial hackathon-safe integration-layer skeleton (`src/{mission,xo,verifier,api}`, `demo_project/`, `tests/`, `docs/architecture/`, `demo/`, README, package.json, tsconfig.json) — no implementation yet, intentionally. Verified GitHub CLI auth (`promi2cool-glitch`), confirmed no existing repo with this name, then `git init`'d, ran a pattern-based secret scan on the staged diff (clean), and created the public repo `promi-mission-control-hackathon` connected as `origin`. Initial commit `5fa4298` pushed to `main`; XO timeline/activity confirmed live for this project. Next: mission schema (PLAN.md phase 2) and the sanitized demo project (phase 3).

## 2026-09-20 — [shipped] Mission/result contracts (phase 2) and reproducible demo defect (phase 3)

agent: claude-sonnet-5

Implemented the typed mission contract under `src/mission/` (`types.ts`, `schema.ts`, `validate.ts`, `result.ts`) with strict TypeScript and no schema-library dependency: deny-by-default `MissionPermissions` (an absent or non-boolean permission always normalizes to `false`, never silently granted), structured `ValidationError[]` output instead of thrown exceptions, a `MissionState` transition table with explicit valid/invalid edges, and structural parsers for `MissionResult`/`VerificationResult` that keep `worker_claim` clearly distinct from an independent verdict. Built the sanitized demo project (`demo_project/`, order discount engine): a GOLD-tier discount is incorrectly rounded per line item instead of once on the combined subtotal, producing exactly one failing test (`0.6` vs expected `0.59` for two `0.33` line items) out of 16 — verified by actually running `node --test`, not asserted. `demo_project/BUG.md` documents only observable behavior and repro steps, no root cause. Wrote `demo/sample-mission.json` (full permissions incl. `create_branch`, all consequential permissions false) and `demo/sample-forbidden-mission.json` (goal text asks for a deploy step, `deploy` stays `false`) — both schema-validated by `tests/sample-missions.test.js`, not just hand-authored and assumed correct. Added `scripts/verify.mjs` (`npm run verify`) which builds, requires all 20 core mission-layer tests to pass, and separately asserts the demo baseline is exactly 1 failure — failing loudly if the defect is fixed early (0 failures) or if the demo breaks beyond the intended defect (>1 failures); manually confirmed both guard conditions actually fire by temporarily patching the bug out and reverting. All new code is confined to this project tree; no XO worker has been dispatched yet, so O1 remains not-started. Next: the XO adapter (phase 4) to actually dispatch `demo/sample-mission.json` to a worker.

## 2026-09-20 — [shipped] Real XO dispatch adapter + first live worker mission (phases 4–6, O1 achieved)

agent: claude-sonnet-5

Built `src/xo/` (types/sse/client/dispatch/workspace/evidence/session/prompt) by reading `/opt/xo-space`'s actual FastAPI router and adapter source first — not guessing at the API — which surfaced a hard constraint worth recording: a worker's subprocess cwd (`--add-dir`) can only ever be a direct top-level child of the discovered xo-projects root, never a path nested inside this repo. Adapted the disposable-workspace design accordingly: the worker's real execution sandbox is `~/xo-projects/mission-<id>/demo_project/` (materialized via `git archive HEAD`, deletion safety-guarded to `mission-`-prefixed paths only), while this repo's gitignored `.mission-runs/<mission-id>/` holds bookkeeping (baseline/after test counts, hashes, raw SSE log, `result.json`) rather than the code copy itself. Confirmed empirically (bare header-less GET) that loopback needs no auth, so the adapter never reads or sends `XO_API_KEY`. 24 unit tests pass against mocked HTTP/SSE covering session-created/text-delta/heartbeat/done/agent-error/timeout-abort/malformed-and-unknown-events/workspace-baseline/file-diffing (`npm run test:xo`) — no live agent involved in those.

Then ran the real integration test: `npm run mission:demo` dispatched `demo/sample-mission.json` to an actual Claude Code worker (session `7d8303e2-b890-4ce7-ac77-f6c7a8066f15`, independently observable via `GET /api/sessions`/`GET /api/messages`, distinct from this controlling session). One diagnosed, justified retry was needed (not a blind retry): the first run's sandbox dirname kept the mission_id's underscores, which the `claude` CLI's own transcript-path encoding doesn't round-trip (it collapses `_` to `-` too, not just `/`), silently zeroing message hydration; fixed by keeping sandbox names hyphen-only, verified via a locked-in unit test. A second, unrelated bug was found by inspecting one real captured `/api/messages` response: the actual shape (`message.data.role`, `part.data.{tool,call_id,state}`) differs from a reasonable first guess (`message.role`, `part.data.{name,input,result_text}`) — fixed in `session.ts` with a fixture-based regression test, then the already-completed session's evidence was re-hydrated (not re-dispatched — zero extra cost) to produce a fully correct `result.json`.

Outcome: the worker independently diagnosed the exact intentional defect (GOLD-tier per-line rounding) without ever being told the root cause, made a 10-line minimal fix, and ran tests itself — disposable sandbox went 15→16 pass (0 fail), while canonical `demo_project/` was independently re-verified to remain 15 pass/1 fail throughout (confirmed via our own hash-diffing and `.xo/` mtimes inside the sandbox, not the worker's word). `worker_claim: COMPLETED` was derived from the SSE `done` event, not parsed from prose. O1 is genuinely achieved (all three KRs met with real evidence); O2/O3 are intentionally left not-complete — one successful run isn't a reliability guarantee, and there's no independent verifier yet. Usage/cost telemetry (`GET /api/usage/sessions/{id}`) came back unavailable, marked as such rather than fabricated. Next: the independent Promi verifier (phase 7), which still needs to be tested against a genuinely bad result to prove it has teeth.
