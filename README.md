# Promi Mission Control

**Autonomous work you can actually verify.**

Autonomous coding agents can do real work — but the agent saying "done" isn't proof. Promi Mission Control dispatches a bounded, structured mission to a real Claude Code worker running inside Quirq/XO, watches the actual execution (files, tools, tests), and then independently re-measures the result before ever calling it a success. Worker completion and Promi verification are two different things, on purpose.

```
USER → PROMI → MISSION → XO AUTONOMOUS WORKER → REAL EXECUTION → EVIDENCE → PROMI VERIFICATION → PASS / FAIL
```

> 📸 *Screenshot: Mission Control hero UI showing the real verified run — see `demo/` after recording.*

## The problem

An agent's self-report ("I fixed it! All tests pass.") is not evidence. Every autonomous-agent workflow eventually has to answer: *how do we know the work is actually correct, without re-doing it ourselves?*

## The solution

A verification-first pipeline with a real trust boundary in the middle:

1. **Promi** constructs a structured **Mission** — a goal, deny-by-default permissions, path constraints, and explicit success criteria.
2. **XO** dispatches it to a real, separate **Claude Code worker** session — observable independently via XO's own API.
3. The worker does **real file/tool/test work** inside a disposable sandbox — never the canonical project.
4. Promi's adapter **independently measures** the result: file hashes, test counts, tool-call history — never trusting the worker's own prose.
5. **Promi's verifier** — a deterministic rules engine, no LLM in the verdict path — checks the evidence against the mission and returns **PASS / FAIL / PARTIAL / BLOCKED**.

## Architecture

See [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) for the full diagram and trust-boundary explanation. Short version:

```
Mission Contract → Promi Mission Control → XO Space API → Claude Code Worker
  → Real File/Tool/Test Work → Mission Result → Deterministic Promi Verifier
  → PASS / FAIL / PARTIAL / BLOCKED → Promi / User
```

## A real run, not a mock

This isn't illustrative sample output — it's the actual result of a real dispatched mission.

| | |
|---|---|
| Mission | `mis_demo_bugfix_001` |
| XO worker | Claude Code / Claude Sonnet 5 |
| XO session | `7d8303e2-b890-4ce7-ac77-f6c7a8066f15` (independently observable via `GET /api/sessions/:id`) |
| Worker diagnosed | The intentional bug, **without being told the root cause** |
| Files changed | `demo_project/src/discountEngine.js` |
| Sandbox tests before → after | 15 pass / 1 fail → **16 pass / 0 fail** |
| Canonical demo (untouched) | 15 pass / 1 expected fail, before **and** after |
| Worker claim | `COMPLETED` |

## Independent verification

Promi's verifier re-checked that run against 12 deterministic, evidence-based criteria — mission identity, transport completion, baseline/regression test counts (measured independently, not from worker prose), path/permission/command safety, workspace confinement, canonical-project integrity, definition-of-done, and evidence completeness.

**Result: `PASS`, 12/12 checks — not hardcoded, it fell out of the evidence.**

The verifier was then proven to actually reject bad work, using deterministic test fixtures (no wasted live agent runs): a worker claiming `COMPLETED` while tests still fail → `FAIL`; an out-of-scope changed file (`../private.txt`) → `FAIL`; a synthetic observed `vercel deploy --prod` against a mission with `deploy: false` → `FAIL`; missing critical evidence → `BLOCKED`; a mission ID mismatch → `FAIL`; glowing prose contradicted by real test failures → `FAIL`.

## Safety

- **Deny-by-default permissions.** A missing or malformed `deploy`/`external_send`/`financial_action`/`commit`/`open_pull_request`/`merge` is always `false`, never silently granted.
- **Disposable sandboxes.** The worker only ever touches a throwaway copy; the canonical demo project is independently re-verified unchanged after every run.
- **No secrets in the loop.** The bridge never reads or sends `XO_API_KEY`; loopback XO calls need no auth header.
- **The public demo UI can only execute the bundled sanitized demo mission** — no arbitrary filesystem path is ever exposed to a browser.
- **No production Promi was modified.** See `docs/HACKATHON_PROGRESS.md` and `docs/PROMI_INTEGRATION.md`.

## Quick start

Requirements: Node.js 20+, and (only for real mission dispatch/replay-with-live-data) a running XO Space on `127.0.0.1:5002`.

```bash
npm install
npm run build
npm test          # core mission-layer tests
npm run verify    # build + core tests + canonical demo baseline + real-mission verification
npm run demo      # starts the Promi Bridge API + Mission Control UI
```

`npm run demo` prints a local URL (`http://127.0.0.1:<port>`, auto-discovering a free port) and, inside an XO/Coder workspace, a browser-reachable proxied URL.

### Test commands

```bash
npm run test:mission    # mission contract: validation, permissions, state machine
npm run test:xo         # XO adapter: SSE parsing, dispatch, workspace, evidence (mocked HTTP/SSE)
npm run test:verifier   # the verifier: path safety, permission detection, all 6 bad-case fixtures
npm run test:api        # the Promi Bridge HTTP API (mocked runner — no live agent calls)
```

### Demo commands

```bash
npm run mission:demo             # dispatch the real sanitized demo mission to a live XO worker
npm run verify:mission -- <id>   # independently verify a completed mission's evidence
npm run demo                     # the full Mission Control UI + bridge API
```

None of the test suites launch a real XO worker — that only happens via `npm run mission:demo` or the UI's explicit, confirmation-gated "Run New Live Mission" button.

## Technologies

TypeScript, Node.js (built-in `node:test`, `node:http`, no framework), Server-Sent Events, and the Quirq XO Space API for real autonomous agent dispatch and observability.

## Hackathon disclosure

Promi existed before this hackathon as an AI project-management/orchestration platform. Everything in this repository — the mission contract, the XO adapter, the sanitized demo, the verifier, the bridge, and the demo UI — was built during the hackathon. See [`docs/HACKATHON_PROGRESS.md`](docs/HACKATHON_PROGRESS.md) for the full disclosure and [`docs/PROMI_INTEGRATION.md`](docs/PROMI_INTEGRATION.md) for how production Promi can integrate with this subsystem.
