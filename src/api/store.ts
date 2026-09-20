import type { Mission } from "../mission/types.js";

export type RunState = "IDLE" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";

export interface MissionRunStatus {
  state: RunState;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

function freshStatus(): MissionRunStatus {
  return { state: "IDLE", startedAt: null, finishedAt: null, error: null };
}

/**
 * In-memory only, by design — no database for this hackathon subsystem.
 * Missions and run state reset on process restart; persisted evidence
 * (result.json / verification.json under .mission-runs/) survives restarts
 * on disk regardless, which is what GET endpoints actually read from.
 */
export class MissionStore {
  private missions = new Map<string, Mission>();
  private runStatus = new Map<string, MissionRunStatus>();

  registerMission(mission: Mission): void {
    this.missions.set(mission.mission_id, mission);
    if (!this.runStatus.has(mission.mission_id)) {
      this.runStatus.set(mission.mission_id, freshStatus());
    }
  }

  getMission(id: string): Mission | undefined {
    return this.missions.get(id);
  }

  listMissions(): Mission[] {
    return [...this.missions.values()];
  }

  getStatus(id: string): MissionRunStatus {
    return this.runStatus.get(id) ?? freshStatus();
  }

  setStatus(id: string, patch: Partial<MissionRunStatus>): void {
    this.runStatus.set(id, { ...this.getStatus(id), ...patch });
  }
}
