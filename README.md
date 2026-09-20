# Promi Mission Control

Verification-first orchestration layer that lets Promi dispatch bounded autonomous missions to agents running in Quirq/XO, observe the actual work, and independently verify the result.

This repository is **not** the full Promi system. It is the hackathon-safe integration layer and a sanitized demo built to prove one thing: a mission dispatched to XO produces real, verifiable evidence — not just a self-reported "done."

## The loop

```
USER → PROMI → STRUCTURED MISSION → PROMI XO ADAPTER → XO SPACE API
  → CLAUDE CODE WORKER → REAL FILE/TOOL/TEST WORK → STRUCTURED RESULT
  → PROMI VERIFIER → PASS / FAIL / PARTIAL / BLOCKED → EVIDENCE SHOWN BACK IN PROMI
```

See [`PROJECT.md`](./PROJECT.md) for the full problem/scope/architecture, [`OBJECTIVES.md`](./OBJECTIVES.md) for outcomes, and [`PLAN.md`](./PLAN.md) for the current phase.

## Layout

```
src/
  mission/    structured mission + result contracts
  xo/         XO Space API adapter (dispatch, observe)
  verifier/   independent PASS/FAIL/PARTIAL/BLOCKED checker
  api/        the boundary Promi calls into
demo_project/ sanitized project a worker mission operates on
tests/        node --test suites
docs/architecture/  design notes and diagrams
demo/         demo/submission script and materials
```

## Stack

TypeScript / Node. No Docker, no database, no frontend framework in this phase — see `PROJECT.md` for why.

## Status

Bootstrap only. No mission has been executed yet — see `PLAN.md` for the phase order.

## Getting started

```
npm install
npm run build
npm test
```
