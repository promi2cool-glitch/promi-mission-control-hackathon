# PROJECT.md

> What this folder is, who it's for, and what is in scope. Edit when scope changes — not on every session.

## Name

Promi Mission Control

## One-line description

A verification-first orchestration layer that lets Promi dispatch bounded autonomous missions to agents running in Quirq/XO, observe the actual work, and independently verify the result.

## Why this exists

Autonomous coding agents can claim success without having actually succeeded — a worker finishing a task is not the same as the task being correct. Promi needs a way to hand a bounded, structured mission to an agent running inside XO Space, watch the real work happen (files, tools, tests), and get back evidence it can independently verify rather than trusting the worker's own self-report. This project is the integration layer that makes that loop real, built as a hackathon-safe, standalone slice that does not depend on or expose proprietary Promi source code.

## Problem

Agent "task complete" signals are self-reported and unverified. There is no independent, structured way to confirm that a dispatched mission actually produced the claimed result, with evidence, rather than just a worker's claim of success.

## Scope

This repo is the **integration layer and a sanitized demo**, not the full Promi system. It exists to prove one complete vertical slice: Promi dispatches a mission, XO runs a Claude Code worker against a real (but sanitized) demo project, the result comes back as structured evidence, and an independent verifier judges PASS/FAIL/PARTIAL/BLOCKED.

## User

Promi itself (the orchestrating system) is the primary caller of this layer. The human audience is the hackathon judges and the Quirq/XO team evaluating the observability and verification story.

## In scope

- A structured mission schema (what Promi sends to XO).
- An XO adapter that dispatches missions to XO Space and reads back worker output via its HTTP/SSE API.
- A sanitized demo project the worker actually operates on.
- A structured result contract (what the worker/XO returns).
- An independent verifier that checks the result against the mission's stated success criteria — worker completion is not treated as verification.
- Enough XO observability surfaced (timeline/activity) to demo the loop live.
- A demo script / walkthrough for submission.

## Out of scope

- The full production Promi system or any of its proprietary source.
- Docker, databases, and frontend frameworks — deliberately deferred until the vertical slice works.
- Live trading, production deployments, or any destructive/irreversible operations.
- Secrets of any kind committed to this public repository.

## Architecture

```
USER
 → PROMI
 → STRUCTURED MISSION
 → PROMI XO ADAPTER
 → XO SPACE API
 → CLAUDE CODE WORKER
 → REAL FILE/TOOL/TEST WORK
 → STRUCTURED RESULT
 → PROMI VERIFIER
 → PASS / FAIL / PARTIAL / BLOCKED
 → EVIDENCE SHOWN BACK IN PROMI
```

Today's work builds the integration layer (`src/mission`, `src/xo`, `src/verifier`, `src/api`) and the sanitized demo project the worker will actually operate on.

## Stack & conventions

TypeScript / Node for the integration layer (Node and npm are already available; XO exposes an HTTP/SSE API that TypeScript fits cleanly; avoids blocking on Python setup since `pytest` is unavailable here). Node's built-in test runner (`node --test`) is used initially instead of installing a test framework. No Docker, no database, no frontend framework in this phase.

## Stakeholders

- **Owner:** see `.xo/project.json` `owner_user_id`
- **Other peers:** see `.xo/peers.json`

## How to run / build / test

```
npm install
npm run build   # tsc
npm test        # node --test
```

---

*This file is part of the stable prefix. Keep it under ~80 lines. Read by every agent at boot.*
