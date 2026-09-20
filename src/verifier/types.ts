import type { Mission, MissionResult, TestCounts, VerificationCheck, VerificationResult } from "../mission/types.js";

/**
 * Evidence the verifier needs but that doesn't naturally live on a
 * MissionResult — chiefly whether the canonical (non-disposable) project
 * stayed in its expected state. Optional: a mission with no canonical-demo
 * concept simply omits it, and canonical_demo_unchanged degrades to a
 * non-required, informational check rather than failing.
 */
export interface IndependentEvidence {
  canonicalDemoTests?: { before: TestCounts; after: TestCounts } | null;
}

export interface VerifyMissionInput {
  mission: Mission;
  result: MissionResult;
  evidence?: IndependentEvidence;
}

/** A single named check's inputs, shared across all check functions for a uniform signature. */
export interface CheckContext {
  mission: Mission;
  result: MissionResult;
  evidence: IndependentEvidence;
}

export type CheckFn = (ctx: CheckContext) => VerificationCheck;

export type { VerificationCheck, VerificationResult };
