# Promi Integration Contract

Promi Mission Control is the autonomous mission execution and verification subsystem being added to Promi. This document describes exactly how production Promi can integrate with it, based on the API actually implemented in `src/api/` — nothing here is aspirational or imaginary.

## Production connectivity status

**Production Promi connectivity not available from the isolated XO cloud environment; bridge API is complete and ready for Promi-side integration.**

This XO workspace is a sandboxed cloud environment with no configured route, credential, or hostname pointing at a production Promi instance (checked read-only: no `PROMI_*` environment variable resolves to an endpoint, and no such mechanism is documented for this workspace). No integration was attempted, and none was assumed to exist. This is not a blocker — it means the two systems have not yet been wired together over a network, not that the bridge is unfinished.

## Integration flow

```
Promi receives a user goal
  → constructs a Mission (see src/mission/types.ts)
  → POST /api/missions                          (validates; does NOT execute)
  → POST /api/missions/:id/run                   (starts real execution; 202 Accepted)
  → polls GET /api/missions/:id                  (until state is COMPLETED / FAILED / BLOCKED)
  → GET /api/missions/:id/result                 (the MissionResult)
  → GET /api/missions/:id/verification           (the VerificationResult)
  → displays evidence + verdict to the user
```

Creation and execution are deliberately separate calls — `POST /api/missions` never runs anything on its own.

## Endpoints

All responses are JSON. The bridge runs on `127.0.0.1:<port>` (see `npm run demo`); no auth header is required for same-host access, matching XO's own loopback contract.

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "promi-mission-control",
  "version": "0.0.1",
  "xo": "reachable",
  "verifier": "ready"
}
```

### `GET /api/status`

```json
{
  "promi": "online",
  "xo": "reachable",
  "worker": { "state": "COMPLETED" },
  "verifier": { "state": "ready", "last_verdict": "PASS" }
}
```

### `GET /api/missions`

Returns every mission the bridge currently knows about (the bundled sanitized demo mission, plus any created via `POST /api/missions` since the process started — there is no database, so this resets on restart; persisted evidence on disk does not).

```json
{ "missions": [ { "mission_id": "mis_demo_bugfix_001", "...": "full Mission object" } ] }
```

### `POST /api/missions`

Request body: a raw `Mission` object (see `src/mission/types.ts`). Validated with the same `validateMission` used everywhere else in this codebase — deny-by-default permissions apply here too; an omitted `deploy`/`external_send`/`financial_action`/`commit`/`open_pull_request`/`merge` is never silently granted.

```
201 { "mission": { "...": "the normalized, validated Mission" } }
400 { "error": "mission is invalid", "details": [ { "path": "...", "code": "...", "message": "..." } ] }
```

### `POST /api/missions/:id/run`

Starts real execution: validate → prepare disposable workspace → baseline check → XO dispatch → stream → result → independent verifier → final status. Responds immediately (`202`) with the mission's new `RUNNING` state; the client polls `GET /api/missions/:id` for completion.

```
202 { "mission_id": "mis_demo_bugfix_001", "state": "RUNNING" }
400 { "error": "only the sanitized demo mission (\"mis_demo_bugfix_001\") can be executed via this endpoint" }
409 { "error": "a run is already in progress for this mission", "state": "RUNNING" }
```

For this hackathon build, execution is intentionally restricted to the bundled sanitized demo mission — the web UI never exposes an arbitrary filesystem root, and the bridge refuses to run anything else. Generalizing to arbitrary missions is future work, not something this endpoint silently allows today.

### `GET /api/missions/:id`

The combined view: mission definition, current run state, worker status, and verification summary.

```json
{
  "mission_id": "mis_demo_bugfix_001",
  "state": "COMPLETED",
  "started_at": "2026-09-20T16:35:11.088Z",
  "finished_at": "2026-09-20T16:35:38.672Z",
  "error": null,
  "mission": { "...": "full Mission object" },
  "worker": { "runtime": "claude_code", "status": "COMPLETED" },
  "result_available": true,
  "verification": { "status": "COMPLETE", "verdict": "PASS", "checks_passed": 12, "checks_total": 12 }
}
```

`404 { "error": "unknown mission \"...\"" }` for a mission the bridge has never seen.

### `GET /api/missions/:id/result`

The full `MissionResult` (see `src/mission/types.ts`): before/after test counts, file changes with hashes, normalized actions/commands, `worker_claim`, XO session id. `404` if the mission hasn't been dispatched yet.

### `GET /api/missions/:id/verification`

The full `VerificationResult`: all 12 named checks with `passed`/`required`/`evidence`/`reason`, the overall `verdict`, `violations`, and `evidence`. `404` if not yet verified.

### `GET /api/missions/:id/observability`

Safe, derived XO observability: session id, runtime, action/command counts, duration, start/finish timestamps, and usage telemetry (or an explicit `usage_available: false` rather than a fabricated number). `404` if there's no execution evidence yet.

## What Promi does with the result

- `worker.status` reflects the transport-level completion signal, never parsed prose — Promi can trust it as "did the XO turn finish," not "was the work good."
- `verification.verdict` is the actual trust boundary. Only `PASS` means every required, evidence-based check passed. `FAIL` means a demonstrated contradiction was found; `BLOCKED` means the evidence needed to decide wasn't available; `PARTIAL` means the core checks passed but a noncritical item (e.g. an unmeasurable "root cause identified" item with no worker narrative) fell short.
- Promi should never present `worker.status === "COMPLETED"` as success on its own — that's exactly the gap this subsystem exists to close.
