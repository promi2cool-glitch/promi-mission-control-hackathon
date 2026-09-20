# OBJECTIVES.md

> The north-star outcomes for this project. Stable on the order of weeks. Edit when objectives genuinely shift — not when tasks shift (the current plan goes in `PLAN.md`; in-flight todos are recorded through the todo API — see AGENTS.md §5).

## Format

Each objective: a one-line outcome statement, then 2–4 measurable key results.

> Outcome ≠ output. "Ship feature X" is an output. "Reduce time-to-first-result by 50%" is an outcome.

---

## O1 — Execute one complete real autonomous mission inside XO

**Why now:** The whole thesis of Promi Mission Control depends on proving a mission can actually run end-to-end inside XO against real files/tools, not a mock.

**Key results:**
- KR1: A structured mission (mission schema) is dispatched to XO Space via its API and accepted. ✅
- KR2: A Claude Code worker inside XO executes real file/tool/test work against the sanitized demo project. ✅
- KR3: The mission run is observable end-to-end via XO's timeline/activity endpoints. ✅

**Status:** achieved — 2026-09-20. `demo/sample-mission.json` was dispatched for real via `npm run mission:demo` against the running XO Space (session `7d8303e2-b890-4ce7-ac77-f6c7a8066f15`, distinct from this controlling session). The worker independently diagnosed the intentional GOLD-tier rounding defect (never told the root cause), made a minimal fix, and ran the tests itself: the disposable sandbox went from 15 pass/1 fail to 16 pass/0 fail, while the canonical `demo_project/` stayed untouched at 15 pass/1 fail throughout. Observable via `GET /api/sessions/{id}` and `GET /api/messages/{id}` (12 real messages, 10 tool calls). This is one successful run, not a reliability guarantee — see PLAN.md phase 4/5 notes.

---

## O2 — Return structured evidence to Promi

**Why now:** Unverified "done" claims are the problem this project exists to solve; the result contract has to carry evidence, not just a status flag.

**Key results:**
- KR1: A structured result schema is defined (files touched, commands run, test output, diffs). ✅
- KR2: The XO adapter reliably translates raw XO output into that structured result. ✅
- KR3: Evidence survives round-trip back to a Promi-side consumer without loss. ✅

**Status:** achieved — 2026-09-20. `result.json` for `mis_demo_bugfix_001` (independently-measured file hashes/diffs, before/after test counts, normalized tool-call actions/commands) was consumed directly by the verifier (`src/verifier/verify.ts`) with zero reinterpretation or loss, producing `verification.json`/`verification.html`. "Reliably" is demonstrated across one real run plus 30 deterministic unit tests exercising the evidence shape — not a claim of large-scale production reliability.

---

## O3 — Independently verify the worker result

**Why now:** Worker completion is not equivalent to a verification pass — the verifier is the actual trust boundary of the system.

**Key results:**
- KR1: A verifier component checks the structured result against the mission's stated success criteria. ✅
- KR2: The verifier produces one of PASS / FAIL / PARTIAL / BLOCKED, never a bare boolean. ✅
- KR3: At least one demo mission is shown failing verification despite the worker claiming success, proving the check has teeth. ✅

**Status:** achieved — 2026-09-20. `src/verifier/` is a deterministic rules/evidence engine (no LLM in the verdict path): 12 named checks (`mission_identity`, `worker_completed`, `baseline_verified`, `regression_tests_pass`, `changed_files_allowed`, `forbidden_paths_untouched`, `permissions_respected`, `forbidden_commands_absent`, `workspace_confined`, `canonical_demo_unchanged`, `definition_of_done`, `evidence_complete`) feed a priority-ordered verdict ladder. The real mission (`mis_demo_bugfix_001`, session `7d8303e2-...`) verifies **PASS**, evidence-driven — the verdict was not hardcoded; it fell out of the checks actually passing. Teeth were proven with 6 deterministic bad-case fixtures derived from the real result (no second live worker dispatched, as instructed): worker claims COMPLETED while tests still fail → FAIL; an out-of-scope changed path (`../private.txt`) → FAIL; a synthetic observed `vercel deploy --prod` command against the guardrail mission's `permissions.deploy=false` → FAIL (the goal text alone mentioning "deploy" was separately confirmed to NOT trigger this); missing critical evidence → BLOCKED; mission ID mismatch → FAIL; glowing worker prose contradicted by objective test failure → FAIL. 30/30 verifier unit tests pass.

---

## O4 — Expose sufficient XO observability for the Quirq demo

**Why now:** The hackathon story depends on judges being able to *see* the mission run, not just read a result.

**Key results:**
- KR1: Live XO activity/timeline data is surfaced during a demo run.
- KR2: The demo walkthrough shows dispatch → execution → evidence → verification as a visible sequence.

**Status:** not started

---

## O5 — Keep proprietary Promi code and secrets out of the public repository

**Why now:** This repo is public and may be submitted to The Code Registry; it must be safe to share unconditionally.

**Key results:**
- KR1: Zero secrets (API keys, tokens) ever committed — enforced by a pre-commit scan.
- KR2: Zero proprietary Promi source files included — only the sanitized integration layer and demo.
- KR3: Every commit is reviewed (`git status` + diff) before push, no exceptions.

**Status:** in progress — enforced from bootstrap onward

---

*Add more as needed. If you have more than 5 active objectives, you don't have objectives — you have a backlog. Move some to `PLAN.md`.*
