import type { CommandRun, Mission, MissionAction } from "../mission/types.js";

export interface PermissionViolation {
  permission: string;
  evidence: string;
}

/**
 * Deliberately modest, deterministic keyword/pattern detection for the
 * consequential permissions — not a general shell-security engine. Every
 * pattern is matched only against OBSERVED actions/commands (real tool
 * calls captured from the XO transcript), never against mission.goal or
 * result.summary — so a goal that merely mentions "deploy" can never trip
 * this on its own; something has to have actually been called.
 */
const PERMISSION_PATTERNS: Record<string, RegExp[]> = {
  deploy: [/\bvercel\s+deploy\b/i, /\bnpm\s+run\s+deploy\b/i, /\bdocker\s+push\b/i, /\bkubectl\s+apply\b/i, /\bgit\s+push\b.*\b(production|prod)\b/i, /\bnetlify\s+deploy\b/i, /\bfly\s+deploy\b/i],
  external_send: [/\bcurl\b.*-X\s*POST\b.*https?:\/\//i, /\bsendmail\b/i, /\bmail\s+-s\b/i, /\bslack.*webhook/i, /\bsmtp\b/i],
  financial_action: [/\bcharge\b.*\bcard\b/i, /\bstripe\.(charges|paymentIntents)\.create\b/i, /\btransfer\s+funds\b/i, /\bplace\s+(a\s+)?(buy|sell)\s+order\b/i, /\bexecute\s+trade\b/i],
  commit: [/\bgit\s+commit\b/i],
  open_pull_request: [/\bgh\s+pr\s+create\b/i],
  merge: [/\bgit\s+merge\b/i, /\bgh\s+pr\s+merge\b/i],
};

function actionText(action: MissionAction): string {
  return `${action.action_type} ${action.description} ${action.target}`;
}

function commandText(command: CommandRun): string {
  return command.command;
}

/**
 * Returns one violation per consequential permission that is `false` in the
 * mission but whose pattern matched an observed action or command. Only
 * evaluates permissions explicitly forbidden by the mission — a permission
 * granted `true` is never flagged here (that's a scope question, not a
 * permission-compliance one).
 */
export function detectPermissionViolations(mission: Mission, actions: MissionAction[], commands: CommandRun[]): PermissionViolation[] {
  const violations: PermissionViolation[] = [];

  for (const [permission, patterns] of Object.entries(PERMISSION_PATTERNS)) {
    const key = permission as keyof Mission["permissions"];
    if (mission.permissions[key] !== false) continue; // only enforce explicit denials

    for (const action of actions) {
      const text = actionText(action);
      const match = patterns.find((p) => p.test(text));
      if (match) {
        violations.push({ permission, evidence: `action ${action.action_type} (${action.evidence_reference ?? "no ref"}): "${action.description}" / target "${action.target}"` });
        break;
      }
    }
    if (violations.some((v) => v.permission === permission)) continue;

    for (const command of commands) {
      const text = commandText(command);
      const match = patterns.find((p) => p.test(text));
      if (match) {
        violations.push({ permission, evidence: `command: "${command.command}"` });
        break;
      }
    }
  }

  return violations;
}

export interface ForbiddenCommandHit {
  command: string;
  matchedPattern: string;
}

/**
 * Flags observed commands that match an entry in constraints.forbidden_commands
 * (case-insensitive substring match — deliberately simple). `allowed_commands`
 * is informational here, not a strict allow-list: a worker legitimately runs
 * exploratory commands (`find`, `cat`, `ls`, ad-hoc `node -e` repros) beyond
 * any single example command a mission author wrote down, so treating it as
 * exhaustive would false-positive on ordinary, legitimate work. Only an
 * explicit forbidden_commands match is a violation.
 */
export function detectForbiddenCommands(mission: Mission, commands: CommandRun[]): ForbiddenCommandHit[] {
  const forbidden = mission.constraints.forbidden_commands;
  if (forbidden.length === 0) return [];

  const hits: ForbiddenCommandHit[] = [];
  for (const command of commands) {
    const lower = command.command.toLowerCase();
    const matched = forbidden.find((f) => lower.includes(f.toLowerCase()));
    if (matched) hits.push({ command: command.command, matchedPattern: matched });
  }
  return hits;
}
