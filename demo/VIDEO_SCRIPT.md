# Video Script

Target length: **2:30–2:50**

---

## 0:00–0:18 — Problem

> "AI agents can do real work — but the worker saying 'done' isn't proof."

Show a plain slide or terminal with a worker claiming success next to a failing test. One beat, don't linger.

## 0:18–0:35 — Promi Mission Control

Open the Mission Control UI. Show the mission card: goal, granted permissions (read/modify/run commands/run tests), denied permissions (deploy/external messaging/financial actions/merge). Say:

> "Promi Mission Control gives an agent a bounded mission — not free rein."

## 0:35–1:35 — Real live XO worker (mandatory for Quirq judging)

Click **Run New Live Mission**, confirm the dialog. Switch to the XO Space UI/session view and show, live:

- the environment / disposable sandbox directory
- the worker session starting
- activity / tool calls as they happen
- the session ID
- commands/tools being invoked
- the actual code change
- the tests running

Narrate briefly over it:

> "This is a real Claude Code worker, in a disposable sandbox, fixing a bug it was never told the cause of."

## 1:35–2:15 — Promi verification

Return to Mission Control. Show:

- worker completed
- 16/16 tests passing (sandbox), canonical demo still 15/1 (untouched)
- 12/12 verification checks
- **PASS**

Then, quickly, one bad-result example from the "Why Verification Matters" section:

> "Worker says COMPLETED. Tests still fail. Promi says FAIL." — labeled clearly as a deterministic verifier test case, not another live run.

## 2:15–2:40 — Why it matters

> "Promi can use this same bounded, observable, verification-first architecture across software maintenance, research, and other project workflows."

## 2:40–2:50 — End card

**Promi Mission Control**
Autonomous work you can actually verify.

GitHub link on screen.

---

## Notes for the recorder

- The live segment (0:35–1:35) is the one part of this video that must show a real agent running in XO — do not substitute replay footage for it.
- Everything before and after that segment can use Mission Control's **Replay Verified Mission** mode if rehearsing, but the actual recording should show one real live run per the checklist in `demo/RECORDING_CHECKLIST.md`.
