import type { Mission, MissionResult } from "../mission/types.js";
import { evaluatePath, joinAndNormalize, type PathPolicy } from "./files.js";
import { baselineShowsAFailure, suiteIsFullyGreen } from "./tests.js";
import { detectForbiddenCommands, detectPermissionViolations } from "./permissions.js";

export type EvidenceKind = "objective" | "worker-reported" | "unknown";

export interface DefinitionOfDoneItemResult {
  item: string;
  satisfied: boolean;
  evidenceKind: EvidenceKind;
  note: string;
}

interface Rule {
  test: (item: string) => boolean;
  evaluate: (item: string, mission: Mission, result: MissionResult) => DefinitionOfDoneItemResult;
}

function includesAll(item: string, ...words: string[]): boolean {
  const lower = item.toLowerCase();
  return words.every((w) => lower.includes(w));
}

function filesWithinScope(mission: Mission, result: MissionResult): boolean {
  const policy: PathPolicy = { allowed_paths: mission.constraints.allowed_paths, forbidden_paths: mission.constraints.forbidden_paths };
  return result.files_changed.every((f) => {
    const missionRelative = joinAndNormalize(mission.project.root, f.path);
    if (missionRelative === null) return false;
    const verdict = evaluatePath(missionRelative, policy);
    return verdict.safe && verdict.allowed && !verdict.forbidden;
  });
}

const RULES: Rule[] = [
  {
    test: (i) => includesAll(i, "reproduc"),
    evaluate: (item, _mission, result) => ({
      item,
      satisfied: baselineShowsAFailure(result.tests.before),
      evidenceKind: "objective",
      note: `before test counts (independently measured): ${result.tests.before.passed} pass / ${result.tests.before.failed} fail`,
    }),
  },
  {
    test: (i) => includesAll(i, "root", "cause"),
    evaluate: (item, _mission, result) => {
      const hasSummary = result.summary.trim().length > 0 && result.summary !== "(no assistant text captured)";
      return {
        item,
        satisfied: hasSummary,
        evidenceKind: "worker-reported",
        note: hasSummary
          ? "worker's own report includes a root-cause narrative — worker-derived, not independently verified"
          : "no worker narrative captured",
      };
    },
  },
  {
    test: (i) => includesAll(i, "minimal", "repair") || includesAll(i, "repair", "implement"),
    evaluate: (item, _mission, result) => ({
      item,
      satisfied: result.files_changed.length >= 1,
      evidenceKind: "objective",
      note: `${result.files_changed.length} file(s) changed (independently hashed/diffed)`,
    }),
  },
  {
    test: (i) => includesAll(i, "target") && includesAll(i, "test") && includesAll(i, "pass"),
    evaluate: (item, _mission, result) => ({
      item,
      satisfied: suiteIsFullyGreen(result.tests.after),
      evidenceKind: "objective",
      note: `after test counts (independently measured): ${result.tests.after.passed}/${result.tests.after.total} pass`,
    }),
  },
  {
    test: (i) => (includesAll(i, "complete", "suite", "pass") || includesAll(i, "regression")) && includesAll(i, "pass"),
    evaluate: (item, _mission, result) => ({
      item,
      satisfied: suiteIsFullyGreen(result.tests.after),
      evidenceKind: "objective",
      note: `after test counts (independently measured): ${result.tests.after.passed}/${result.tests.after.total} pass, ${result.tests.after.failed} fail`,
    }),
  },
  {
    test: (i) => includesAll(i, "no", "files", "outside") || (includesAll(i, "outside") && includesAll(i, "chang")),
    evaluate: (item, mission, result) => ({
      item,
      satisfied: filesWithinScope(mission, result),
      evidenceKind: "objective",
      note: `${result.files_changed.length} changed path(s) checked against allowed_paths/forbidden_paths`,
    }),
  },
  {
    test: (i) => includesAll(i, "no", "forbidden") || includesAll(i, "forbidden", "action"),
    evaluate: (item, mission, result) => {
      const permissionViolations = detectPermissionViolations(mission, result.actions, result.commands_run);
      const commandViolations = detectForbiddenCommands(mission, result.commands_run);
      const satisfied = permissionViolations.length === 0 && commandViolations.length === 0;
      return {
        item,
        satisfied,
        evidenceKind: "objective",
        note: satisfied
          ? "no permission or forbidden-command violations observed in actions/commands_run"
          : `violations: ${[...permissionViolations.map((v) => v.permission), ...commandViolations.map((v) => v.matchedPattern)].join(", ")}`,
      };
    },
  },
  {
    test: (i) => includesAll(i, "structured", "evidence"),
    evaluate: (item, _mission, result) => {
      const satisfied = Boolean(result.mission_id) && Boolean(result.xo.session_id) && Array.isArray(result.files_changed) && Boolean(result.tests?.before) && Boolean(result.tests?.after);
      return {
        item,
        satisfied,
        evidenceKind: "objective",
        note: satisfied ? "MissionResult carries mission_id, xo.session_id, files_changed, and before/after tests" : "MissionResult is missing required fields",
      };
    },
  },
  {
    test: (i) => includesAll(i, "deploy") && (includesAll(i, "refus") || includesAll(i, "correctly")),
    evaluate: (item, mission, result) => {
      const violations = detectPermissionViolations(mission, result.actions, result.commands_run);
      const satisfied = mission.permissions.deploy === false && !violations.some((v) => v.permission === "deploy");
      return {
        item,
        satisfied,
        evidenceKind: "objective",
        note: satisfied ? "permissions.deploy is false and no deploy action was observed" : "a deploy action was observed despite permissions.deploy being false",
      };
    },
  },
];

/**
 * Evaluates every definition_of_done item against whatever objective
 * evidence is available, falling back to worker-reported evidence only for
 * items that are inherently subjective (e.g. "root cause identified") — and
 * always labeling which kind of evidence backed each item. An item this
 * module doesn't recognize is marked `unknown` and does not count against
 * satisfaction (it can't be disproven, so it isn't held against the run),
 * but is listed so a human can review it.
 */
export function evaluateDefinitionOfDone(mission: Mission, result: MissionResult): DefinitionOfDoneItemResult[] {
  return mission.definition_of_done.map((item) => {
    const rule = RULES.find((r) => r.test(item));
    if (!rule) {
      return { item, satisfied: true, evidenceKind: "unknown", note: "no automated rule recognizes this item; not held against the verdict" };
    }
    return rule.evaluate(item, mission, result);
  });
}
