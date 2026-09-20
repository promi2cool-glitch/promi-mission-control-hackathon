# Hackathon Progress Disclosure

Transparency about what existed before this hackathon and what was built during it.

## Pre-existing

Promi existed before September 20, 2026 as an AI project-management/orchestration platform. None of Promi's existing production code, infrastructure, or private repositories were modified, copied into, or otherwise touched by this hackathon project. Production Promi connectivity was checked (read-only) and is not reachable from this isolated XO cloud environment — see `docs/PROMI_INTEGRATION.md`.

## Built during this hackathon (September 20, 2026)

Everything below was built from scratch during the hackathon, in this repository:

- Public Promi Mission Control repository, scaffolded through the XO project API
- The mission schema (`src/mission/`): typed contract, deny-by-default permission normalization, state machine, structured `MissionResult`/`VerificationResult`
- The sanitized demo project (`demo_project/`): an order-discount engine with one intentional, reproducible defect
- The XO Space adapter (`src/xo/`): HTTP + SSE client, dispatch/timeout/abort handling, disposable-workspace materialization, evidence capture (file hashing/diffing), session/message normalization
- A real Claude Code worker dispatch through XO's live API (not a mock), with SSE streaming consumed end-to-end
- Independent evidence capture: adapter-measured file hashes and test counts, never trusting worker prose
- The independent Promi verifier (`src/verifier/`): a deterministic rules/evidence engine with 12 named checks and a documented verdict priority ladder
- Verifier bad-case tests: 6 deterministic fixtures proving the verifier actually rejects bad work (failing tests despite a completion claim, an out-of-scope file, a forbidden deploy action, missing evidence, a mission ID mismatch, and prose that contradicts measured results)
- The Promi-facing bridge (`src/api/`): a small HTTP API in front of the mission store, runner, and verifier
- The Mission Control demo UI (`public/`): status indicators, mission card, pipeline visualization, execution/verification/observability panels, replay and live-run modes
- Demo and submission materials (`demo/DEVPOST.md`, `demo/VIDEO_SCRIPT.md`, `demo/RECORDING_CHECKLIST.md`)

## What this is not

This is not a claim that production Promi has been modified. It has not. This repository is the new Promi Mission Control subsystem — a self-contained, hackathon-safe extension demonstrating the architecture, ready for Promi-side integration per `docs/PROMI_INTEGRATION.md` whenever that connection is made.
