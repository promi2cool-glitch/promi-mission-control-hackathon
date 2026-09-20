import type { Mission, MissionConstraints, MissionContext, MissionMetadata, MissionPermissions, ProjectRef } from "./types.js";
import { PERMISSION_KEYS } from "./types.js";
import { isSupportedSchemaVersion, MAX_RUNTIME_SECONDS_CAP } from "./schema.js";

export interface ValidationError {
  path: string;
  code: string;
  message: string;
}

export interface ValidationSuccess {
  ok: true;
  mission: Mission;
}

export interface ValidationFailure {
  ok: false;
  errors: ValidationError[];
}

export type ValidationOutcome = ValidationSuccess | ValidationFailure;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function err(errors: ValidationError[], path: string, code: string, message: string): void {
  errors.push({ path, code, message });
}

/**
 * Deny-by-default: any permission field that is missing, null, or not a
 * strict boolean normalizes to `false`. A field is only ever `true` when it
 * is present in the raw input and is literally `true`.
 */
function normalizePermissions(raw: unknown, errors: ValidationError[]): MissionPermissions {
  const result = {} as MissionPermissions;
  const source = isPlainObject(raw) ? raw : {};

  if (raw !== undefined && !isPlainObject(raw)) {
    err(errors, "permissions", "invalid_type", "permissions must be an object if present");
  }

  for (const key of PERMISSION_KEYS) {
    const value = source[key];
    if (value === undefined || value === null) {
      result[key] = false;
      continue;
    }
    if (typeof value !== "boolean") {
      err(errors, `permissions.${key}`, "invalid_type", `permissions.${key} must be a boolean, got ${typeof value}`);
      result[key] = false;
      continue;
    }
    result[key] = value;
  }

  return result;
}

function normalizeConstraints(raw: unknown, errors: ValidationError[]): MissionConstraints {
  const source = isPlainObject(raw) ? raw : {};

  if (raw !== undefined && !isPlainObject(raw)) {
    err(errors, "constraints", "invalid_type", "constraints must be an object if present");
  }

  const allowed_paths = source.allowed_paths;
  const forbidden_paths = source.forbidden_paths;
  const allowed_commands = source.allowed_commands;
  const forbidden_commands = source.forbidden_commands;
  const max_runtime_seconds = source.max_runtime_seconds;

  if (allowed_paths !== undefined && !isArrayOfStrings(allowed_paths)) {
    err(errors, "constraints.allowed_paths", "invalid_type", "constraints.allowed_paths must be an array of strings");
  }
  if (forbidden_paths !== undefined && !isArrayOfStrings(forbidden_paths)) {
    err(errors, "constraints.forbidden_paths", "invalid_type", "constraints.forbidden_paths must be an array of strings");
  }
  if (allowed_commands !== undefined && !isArrayOfStrings(allowed_commands)) {
    err(errors, "constraints.allowed_commands", "invalid_type", "constraints.allowed_commands must be an array of strings");
  }
  if (forbidden_commands !== undefined && !isArrayOfStrings(forbidden_commands)) {
    err(errors, "constraints.forbidden_commands", "invalid_type", "constraints.forbidden_commands must be an array of strings");
  }

  if (
    typeof max_runtime_seconds !== "number" ||
    !Number.isFinite(max_runtime_seconds) ||
    max_runtime_seconds <= 0
  ) {
    err(
      errors,
      "constraints.max_runtime_seconds",
      "invalid_value",
      "constraints.max_runtime_seconds must be a positive number",
    );
  } else if (max_runtime_seconds > MAX_RUNTIME_SECONDS_CAP) {
    err(
      errors,
      "constraints.max_runtime_seconds",
      "unreasonable_value",
      `constraints.max_runtime_seconds must not exceed ${MAX_RUNTIME_SECONDS_CAP} seconds`,
    );
  }

  return {
    allowed_paths: isArrayOfStrings(allowed_paths) ? allowed_paths : [],
    forbidden_paths: isArrayOfStrings(forbidden_paths) ? forbidden_paths : [],
    allowed_commands: isArrayOfStrings(allowed_commands) ? allowed_commands : [],
    forbidden_commands: isArrayOfStrings(forbidden_commands) ? forbidden_commands : [],
    max_runtime_seconds: typeof max_runtime_seconds === "number" ? max_runtime_seconds : 0,
  };
}

function normalizeContext(raw: unknown, errors: ValidationError[]): MissionContext {
  const source = isPlainObject(raw) ? raw : {};

  if (raw !== undefined && !isPlainObject(raw)) {
    err(errors, "context", "invalid_type", "context must be an object if present");
  }

  const summary = source.summary;
  const relevant_files = source.relevant_files;
  const notes = source.notes;

  if (summary !== undefined && typeof summary !== "string") {
    err(errors, "context.summary", "invalid_type", "context.summary must be a string");
  }
  if (relevant_files !== undefined && !isArrayOfStrings(relevant_files)) {
    err(errors, "context.relevant_files", "invalid_type", "context.relevant_files must be an array of strings");
  }
  if (notes !== undefined && !isArrayOfStrings(notes)) {
    err(errors, "context.notes", "invalid_type", "context.notes must be an array of strings");
  }

  return {
    summary: typeof summary === "string" ? summary : "",
    relevant_files: isArrayOfStrings(relevant_files) ? relevant_files : [],
    notes: isArrayOfStrings(notes) ? notes : [],
  };
}

function normalizeProject(raw: unknown, errors: ValidationError[]): ProjectRef {
  if (!isPlainObject(raw)) {
    err(errors, "project", "missing", "project is required and must be an object");
    return { id: "", name: "", root: "", description: "" };
  }

  const { id, name, root, description } = raw;

  if (!isNonEmptyString(id)) {
    err(errors, "project.id", "missing", "project.id is required and must be a non-empty string");
  }
  if (!isNonEmptyString(name)) {
    err(errors, "project.name", "missing", "project.name is required and must be a non-empty string");
  }
  if (!isNonEmptyString(root)) {
    err(errors, "project.root", "missing", "project.root is required and must be a non-empty string");
  }
  if (description !== undefined && typeof description !== "string") {
    err(errors, "project.description", "invalid_type", "project.description must be a string");
  }

  return {
    id: isNonEmptyString(id) ? id : "",
    name: isNonEmptyString(name) ? name : "",
    root: isNonEmptyString(root) ? root : "",
    description: typeof description === "string" ? description : "",
  };
}

function normalizeMetadata(raw: unknown, errors: ValidationError[]): MissionMetadata {
  const source = isPlainObject(raw) ? raw : {};

  if (raw !== undefined && !isPlainObject(raw)) {
    err(errors, "metadata", "invalid_type", "metadata must be an object if present");
  }

  const requested_by = source.requested_by;
  const tags = source.tags;

  if (requested_by !== undefined && typeof requested_by !== "string") {
    err(errors, "metadata.requested_by", "invalid_type", "metadata.requested_by must be a string");
  }
  if (tags !== undefined && !isArrayOfStrings(tags)) {
    err(errors, "metadata.tags", "invalid_type", "metadata.tags must be an array of strings");
  }

  return {
    requested_by: typeof requested_by === "string" ? requested_by : "",
    tags: isArrayOfStrings(tags) ? tags : [],
  };
}

/**
 * Validate and normalize a raw, untrusted mission payload into a Mission.
 * Never throws — malformed input produces structured ValidationError[].
 * Permissions are deny-by-default: an absent or malformed permission field
 * always normalizes to `false`, never `true`.
 */
export function validateMission(raw: unknown): ValidationOutcome {
  const errors: ValidationError[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: "$", code: "invalid_type", message: "mission must be an object" }] };
  }

  const { schema_version, mission_id, created_at, project, goal, context, permissions, constraints, definition_of_done, metadata } = raw;

  if (!isSupportedSchemaVersion(schema_version)) {
    err(
      errors,
      "schema_version",
      "unsupported_schema_version",
      `schema_version ${JSON.stringify(schema_version)} is not supported`,
    );
  }

  if (!isNonEmptyString(mission_id)) {
    err(errors, "mission_id", "missing", "mission_id is required and must be a non-empty string");
  }

  if (created_at !== undefined && typeof created_at !== "string") {
    err(errors, "created_at", "invalid_type", "created_at must be a string if present");
  }

  const normalizedProject = normalizeProject(project, errors);

  if (!isNonEmptyString(goal)) {
    err(errors, "goal", "missing", "goal is required and must be a non-empty string");
  }

  const normalizedContext = normalizeContext(context, errors);
  const normalizedPermissions = normalizePermissions(permissions, errors);
  const normalizedConstraints = normalizeConstraints(constraints, errors);
  const normalizedMetadata = normalizeMetadata(metadata, errors);

  if (!Array.isArray(definition_of_done) || definition_of_done.length === 0) {
    err(errors, "definition_of_done", "missing", "definition_of_done must be a non-empty array");
  } else if (!isArrayOfStrings(definition_of_done)) {
    err(errors, "definition_of_done", "invalid_type", "definition_of_done must be an array of strings");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const mission: Mission = {
    schema_version: schema_version as string,
    mission_id: mission_id as string,
    created_at: typeof created_at === "string" ? created_at : new Date().toISOString(),
    project: normalizedProject,
    goal: goal as string,
    context: normalizedContext,
    permissions: normalizedPermissions,
    constraints: normalizedConstraints,
    definition_of_done: definition_of_done as string[],
    metadata: normalizedMetadata,
  };

  return { ok: true, mission };
}
