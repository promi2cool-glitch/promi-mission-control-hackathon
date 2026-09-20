# Promi Mission Control

## Tagline

Autonomous work you can actually verify.

## What it does

Promi Mission Control lets Promi dispatch a bounded, structured mission to a real autonomous Claude Code worker running inside Quirq/XO, observe the actual execution, and then **independently verify** the result before trusting it — instead of taking the worker's "done" at its word.

A mission is a structured contract: a goal, deny-by-default permissions (nothing consequential — deploy, external messaging, financial actions, commit, PR, merge — is ever granted unless explicitly `true`), path constraints, and explicit success criteria. Promi's XO adapter dispatches it to a real Claude Code session, streams the execution over SSE, and independently measures the outcome: file hashes before/after, test counts before/after, and a normalized tool-call history — never trusting the worker's own summary. Promi's verifier is a deterministic rules/evidence engine (no LLM in the verdict path) that checks that evidence against 12 explicit criteria and returns PASS, FAIL, PARTIAL, or BLOCKED, with a full explanation.

We ran it for real: a sanitized demo project (an order-discount engine with one intentional bug) was handed to a live worker with the root cause never disclosed. The worker diagnosed it independently, made a minimal fix, and the sandbox went from 15 pass/1 fail to 16 pass/0 fail — while the canonical project stayed untouched. Promi's verifier checked all of that independently and returned **PASS, 12/12**. We then proved the verifier has teeth with six deterministic bad-result fixtures (failing tests despite a "COMPLETED" claim, an out-of-scope file, a forbidden deploy command, missing evidence, a mission ID mismatch, and false success prose) — all correctly rejected.

## How we built it

1. **Mission contract** — a typed TypeScript schema with deny-by-default permission normalization, an explicit state machine, and structured (never-thrown) validation errors.
2. **Sanitized demo project** — a small, real, intentionally-defective project with exactly one reproducible bug, so a worker has something genuine to diagnose.
3. **XO adapter** — discovered by reading the running XO Space's actual FastAPI source (not guessing): a chat-prompt/SSE-stream contract, session/message hydration, and a disposable execution sandbox materialized fresh from git for every run.
4. **A real live dispatch** — one actual Claude Code worker session, independently observable, that fixed the real bug without being told the root cause.
5. **The independent verifier** — 12 named checks feeding a documented priority ladder where a demonstrated contradiction always outranks merely-missing evidence.
6. **The Promi Bridge + Mission Control UI** — a small Node HTTP API and a framework-free dark/purple UI that replays the real captured run (default, free) or launches a new live one (explicit confirmation required).

## Challenges we ran into

- The XO API's actual contract isn't fully typed in its own OpenAPI spec — we read the FastAPI router/adapter source directly to get the real `/api/chat/prompt` → SSE → session/message shapes.
- A worker's subprocess `cwd` can only ever be a direct top-level child of the XO projects root, never a path nested inside our own repo — we had to redesign the disposable-sandbox location around that real constraint rather than assume our first design would work.
- A mission ID containing underscores broke the `claude` CLI's own transcript-path encoding (it collapses `_` to `-`, not just `/`), silently zeroing out message hydration on the first live run — diagnosed and fixed with one justified retry, not a blind one.
- Getting FAIL and BLOCKED to mean genuinely different things (a demonstrated bad result vs. simply not knowing) required an explicit, documented priority ladder in the verifier rather than a flat checklist.

## What we learned

Worker self-reports are a surprisingly persistent trap — even our own adapter's first-guess message-parsing logic initially misread the real transcript shape. Every layer that could independently measure something (file hashes, test counts, transport completion) needed to, because prose is cheap and measurement isn't.

## What's next

Wire the bridge into production Promi over a real network path (the API contract is documented and ready — see `docs/PROMI_INTEGRATION.md`); generalize beyond the single sanitized demo mission to arbitrary Promi-authored missions; add cost/usage telemetry once XO exposes it for ad-hoc sessions.

## Tech stack

TypeScript, Node.js (built-in `node:test` and `node:http` — no framework), Server-Sent Events, plain HTML/CSS/JS for the UI, and the Quirq XO Space API for real autonomous agent dispatch, streaming, and observability.

## Pre-existing work disclosure

Promi existed before September 20, 2026 as an AI project-management/orchestration platform. No production Promi code, infrastructure, or private repository was touched by this project.

## Hackathon work summary

Built entirely during the hackathon: the public Promi Mission Control repository, the XO project scaffold, the mission schema, deny-by-default permissions, the mission state machine, the result contract, the sanitized demo project, the XO Space adapter, a real Claude Code worker dispatch, SSE integration, independent evidence capture, the independent verifier and its bad-case tests, the Promi-facing bridge, the Mission Control demo UI, and this submission material. Full disclosure in `docs/HACKATHON_PROGRESS.md`.

## Quirq/XO usage

XO Space's chat/SSE API dispatched a real Claude Code worker session end-to-end: prompt creation, live SSE consumption (session-created/text-delta/heartbeat/done), session and message hydration for observability, and the disposable per-mission workspace mechanism XO provides for isolating a worker's filesystem access. This is a genuine integration, not a mock — the session ID, tool calls, and file diffs shown in the demo come from that one real run.

## Safety

Deny-by-default consequential permissions; a disposable sandbox that's rebuilt clean from git for every run; independent re-verification that the canonical demo project stayed untouched; a public demo UI that can only execute the bundled sanitized mission (no arbitrary filesystem path is ever exposed to a browser); no credentials read or logged; no production system modified.
