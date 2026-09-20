# Architecture

## The loop

```
USER
   ↓
PROMI
   ↓
MISSION CONTRACT                  src/mission/  (types, deny-by-default permissions, state machine)
   ↓
PROMI MISSION CONTROL             this repository — the bridge + adapter + verifier
   ↓
XO SPACE API                      src/xo/client.ts, sse.ts  (HTTP + SSE, no auth needed on loopback)
   ↓
CLAUDE CODE WORKER                a real, separate XO session — untrusted
   ↓
REAL FILE / TOOL / TEST WORK      inside a disposable sandbox, never the canonical project
   ↓
MISSION RESULT                    src/xo/runMission.ts — independently measured, not worker prose
   ↓
DETERMINISTIC PROMI VERIFIER      src/verifier/  — a rules/evidence engine, no LLM in the verdict path
   ↓
PASS / FAIL / PARTIAL / BLOCKED
   ↓
PROMI / USER                      via src/api/ (the Promi Bridge) and the demo UI
```

## Trust boundaries

This is the actual point of the project, so it's worth being explicit about where trust starts and stops.

**The worker is untrusted.** A Claude Code worker running inside XO is a capable but unverified agent. It can read files, run commands, and edit code inside its assigned sandbox — but nothing it says about its own work is treated as ground truth.

**Worker prose is not truth.** `MissionResult.summary` and `worker_claim` are the worker's own self-report. `worker_claim` is derived from the XO SSE transport's own completion signal (`done`/`agent-error`/`timeout`), not by parsing the worker's words — but it is still, structurally, "what the worker claims," and the verifier never treats it as equivalent to an independent verdict. Bad Case F (a worker's prose says "Mission accomplished successfully" while measured tests still fail) exists specifically to prove this boundary holds.

**XO provides observation, not verification.** The XO Space API gives dispatch, streaming, session records, and message/tool-call history. That's raw material for evidence — XO itself makes no claim about whether the work was any good.

**The adapter independently measures tests and files.** `src/xo/workspace.ts` and `src/xo/evidence.ts` run the actual test suite and hash the actual files before and after a mission — this is the layer that produces objective evidence, deliberately separate from anything the worker says. `src/xo/session.ts` normalizes the worker's tool-call transcript into `actions`/`commands_run`, again from observed data, not narrated summaries.

**The verifier makes the final verdict, deterministically.** `src/verifier/verify.ts` is a rules/evidence engine: 12 named checks, no LLM anywhere in the verdict path, and an explicit priority ladder where a demonstrated contradiction (wrong mission ID, an out-of-scope file, a forbidden action, failing tests, canonical-project drift) always outranks merely-missing evidence. That's what makes FAIL and BLOCKED mean different things instead of being interchangeable "not good" buckets.

**Consequential permissions are deny-by-default.** `src/mission/validate.ts` normalizes every permission field so that anything absent, null, or malformed becomes `false` — never silently granted. `deploy`, `external_send`, `financial_action`, `commit`, `open_pull_request`, and `merge` all require explicit `true` to ever be usable, and the verifier's `permissions_respected` check flags an observed action that contradicts a denied permission regardless of what the mission's goal text says.

## Where the boundary actually sits (an honest caveat)

The worker's OS-level tool sandbox (`claude --add-dir <sandbox-root>`) scopes to the whole disposable `mission-<id>/` directory, not `demo_project/` specifically, and it's cooperative rather than a hard OS jail (documented in `src/xo/workspace.ts`). The verifier does not lean on that boundary — `workspace_confined` and `changed_files_allowed` check independently-measured file paths and hashes, which is the only thing that can't be argued with.

## Repository layout

```
src/mission/    structured mission + result contracts, deny-by-default validation, state machine
src/xo/         XO Space adapter — client, SSE parsing, dispatch, disposable workspace, evidence, the runner
src/verifier/   the deterministic verifier — checks, path safety, permissions, report rendering
src/api/        the Promi Bridge — HTTP API in front of the mission store + runner + verifier
src/cli/        thin CLI wrappers around the same modules (mission:demo, verify:mission, demo)
public/         the Mission Control demo UI (static HTML/CSS/JS, no framework)
demo_project/   the sanitized, intentionally-defective project a mission operates on
demo/           sample missions + submission materials
tests/          node --test suites (mission, xo, verifier, api)
docs/           this document, the Promi integration contract, hackathon disclosure
```
