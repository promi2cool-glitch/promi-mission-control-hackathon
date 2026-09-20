import type { TestCounts } from "../mission/types.js";

export function countsAreInternallyConsistent(counts: TestCounts): boolean {
  return (
    Number.isFinite(counts.total) &&
    Number.isFinite(counts.passed) &&
    Number.isFinite(counts.failed) &&
    Number.isFinite(counts.skipped) &&
    counts.passed + counts.failed + counts.skipped === counts.total
  );
}

/** Was there a genuine pre-existing failure for the mission to fix? (not hardcoded to any specific count) */
export function baselineShowsAFailure(counts: TestCounts): boolean {
  return countsAreInternallyConsistent(counts) && counts.failed >= 1;
}

/** Full regression suite green: every test ran, none failed. */
export function suiteIsFullyGreen(counts: TestCounts): boolean {
  return countsAreInternallyConsistent(counts) && counts.total > 0 && counts.failed === 0 && counts.passed === counts.total;
}

export function countsAreEqual(a: TestCounts, b: TestCounts): boolean {
  return a.total === b.total && a.passed === b.passed && a.failed === b.failed && a.skipped === b.skipped;
}
