export type ISODateTimeString = string;

export interface ProjectRef {
  id: string;
  name: string;
  root: string;
  description: string;
}

export interface MissionContext {
  summary: string;
  relevant_files: string[];
  notes: string[];
}

/**
 * Deny-by-default: a permission that is absent from the raw mission input
 * must normalize to `false`, never `true`. See validate.ts.
 */
export interface MissionPermissions {
  read_files: boolean;
  modify_files: boolean;
  run_commands: boolean;
  run_tests: boolean;
  create_branch: boolean;
  commit: boolean;
  open_pull_request: boolean;
  merge: boolean;
  deploy: boolean;
  external_send: boolean;
  financial_action: boolean;
}

export const PERMISSION_KEYS: readonly (keyof MissionPermissions)[] = [
  "read_files",
  "modify_files",
  "run_commands",
  "run_tests",
  "create_branch",
  "commit",
  "open_pull_request",
  "merge",
  "deploy",
  "external_send",
  "financial_action",
];

/** Permissions consequential enough that omission or ambiguity must never be treated as a grant. */
export const CONSEQUENTIAL_PERMISSION_KEYS: readonly (keyof MissionPermissions)[] = [
  "commit",
  "open_pull_request",
  "merge",
  "deploy",
  "external_send",
  "financial_action",
];

export interface MissionConstraints {
  allowed_paths: string[];
  forbidden_paths: string[];
  allowed_commands: string[];
  forbidden_commands: string[];
  max_runtime_seconds: number;
}

export interface MissionMetadata {
  requested_by: string;
  tags: string[];
}

export interface Mission {
  schema_version: string;
  mission_id: string;
  created_at: ISODateTimeString;
  project: ProjectRef;
  goal: string;
  context: MissionContext;
  permissions: MissionPermissions;
  constraints: MissionConstraints;
  definition_of_done: string[];
  metadata: MissionMetadata;
}

export const MISSION_STATES = [
  "CREATED",
  "QUEUED",
  "PLANNING",
  "RUNNING",
  "TESTING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
] as const;

export type MissionState = (typeof MISSION_STATES)[number];

export type WorkerClaim = "COMPLETED" | "FAILED" | "BLOCKED";

export interface MissionAction {
  timestamp: ISODateTimeString;
  action_type: string;
  description: string;
  target: string;
  success: boolean;
  evidence_reference: string | null;
}

export type FileChangeType = "created" | "modified" | "deleted";

export interface FileChange {
  path: string;
  change_type: FileChangeType;
  before_hash: string | null;
  after_hash: string | null;
}

export interface CommandRun {
  command: string;
  cwd: string;
  exit_code: number;
  stdout_summary: string;
  stderr_summary: string;
}

export interface TestCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TestsSummary {
  before: TestCounts;
  after: TestCounts;
}

export interface Artifact {
  type: string;
  path: string;
  description: string;
}

export interface MissionError {
  code: string;
  message: string;
}

export interface XoMeta {
  session_id: string | null;
  duration_ms: number | null;
  usage: Record<string, unknown> | null;
}

/**
 * `worker_claim` is the worker's own self-report. It is NOT verification —
 * see VerificationResult, which is the independent trust boundary.
 */
export interface MissionResult {
  schema_version: string;
  mission_id: string;
  status: MissionState;
  started_at: ISODateTimeString;
  finished_at: ISODateTimeString | null;
  summary: string;
  plan: string[];
  actions: MissionAction[];
  files_changed: FileChange[];
  commands_run: CommandRun[];
  tests: TestsSummary;
  artifacts: Artifact[];
  errors: MissionError[];
  xo: XoMeta;
  worker_claim: WorkerClaim;
}

export type VerificationVerdict = "PASS" | "FAIL" | "PARTIAL" | "BLOCKED";

export interface VerificationCheck {
  name: string;
  passed: boolean;
  required: boolean;
  evidence: string;
  reason: string;
}

export interface VerificationResult {
  mission_id: string;
  verdict: VerificationVerdict;
  checks: VerificationCheck[];
  summary: string;
  evidence: string[];
  violations: string[];
}
