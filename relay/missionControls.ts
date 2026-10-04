import { taglessPlayerName } from "./shared.js";
import type { ServerMessageRosterEntry } from "./serverMessageState.js";

/** Exact base names; JSON preserves commas, spaces, and letter casing. */
export function loadAlwaysAdminPlayers(
  value: string | undefined,
): ReadonlySet<string> {
  if (!value?.trim()) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "ALWAYS_ADMIN_PLAYERS must be a JSON array of nonempty player names",
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((name) => typeof name !== "string" || !name.trim())
  )
    throw new Error(
      "ALWAYS_ADMIN_PLAYERS must be a JSON array of nonempty player names",
    );
  return new Set(parsed);
}

export function isAlwaysAdminPlayer(
  player: Pick<ServerMessageRosterEntry, "rawName" | "isSmurf"> | undefined,
  names: ReadonlySet<string> | undefined,
): boolean {
  // Missing join metadata cannot establish that this is a non-smurf account.
  return (
    player?.isSmurf === false &&
    names?.has(taglessPlayerName(player.rawName)) === true
  );
}

/** Commands are accepted only from the stock/Classic global ChatMessage format. */
export function decodeGlobalChat(
  args: string[],
): { clientId: number; text: string } | null {
  // hud.cs uses \c4 (byte 0x06); team chat uses \c3 (byte 0x05).
  if (args.length < 6 || args[3] !== "\x06%1: %2" || !/^\d+$/.test(args[0]))
    return null;
  const clientId = Number(args[0]);
  return Number.isSafeInteger(clientId) && clientId > 0
    ? { clientId, text: args[5] }
    : null;
}

export interface MissionControlCommand {
  recording?: boolean;
  watching?: boolean;
  error?: string;
}

export function parseMissionControlCommand(
  text: string,
): MissionControlCommand | null {
  const match = /^@mapgenius(?::\s*|\s+|$)(.*)$/i.exec(text.trim());
  if (!match) return null;
  const command: MissionControlCommand = {};
  for (const token of match[1].toLowerCase().split(/\s+/).filter(Boolean)) {
    if (token === "status") continue;
    if (/^[+-](?:rec|record|recording|demo)$/.test(token)) {
      command.recording = token[0] === "+";
    } else if (/^[+-](?:watch|spectate|spectator|spectators)$/.test(token)) {
      command.watching = token[0] === "+";
    } else {
      return { error: "Use @MapGenius: +rec/-rec +watch/-watch, or status." };
    }
  }
  return command;
}

export interface MissionControlState {
  mission: [sequence: string, name: string] | null;
  recording: boolean;
  watching: boolean;
  /** The choice latched at match end; absent while captains can still change it. */
  recordingDecision?: boolean;
  /** Distinct accounts and their admin level when each pending vote was cast. */
  votes?: Partial<Record<MissionControlSetting, Record<string, AdminVoteRole>>>;
}

export type MissionControlSetting = "recording" | "watching";
export type AdminVoteRole = "admin" | "superadmin";
const settings = ["recording", "watching"] as const;
const guidVoterPattern = /^guid:[1-9]\d*$/;

function restoreVoteBallot(value: unknown): Map<string, AdminVoteRole> | null {
  if (value === undefined) return new Map();
  if (Array.isArray(value)) {
    if (
      !value.every(
        (voter) =>
          typeof voter === "string" && /^(?:guid|client):[1-9]\d*$/.test(voter),
      )
    )
      return null;
    // Older ballots have no role; retain known GUIDs as ordinary admin votes.
    return new Map(
      value
        .filter((voter) => guidVoterPattern.test(voter))
        .map((voter) => [voter, "admin"] as const),
    );
  }
  if (!value || typeof value !== "object") return null;
  const entries = Object.entries(value);
  if (
    entries.some(
      ([voter, role]) =>
        !guidVoterPattern.test(voter) ||
        (role !== "admin" && role !== "superadmin"),
    )
  )
    return null;
  return new Map(entries as [string, AdminVoteRole][]);
}

export interface AdminVotePolicy {
  tournament: boolean;
  minPlayerCount: number;
  /** Zero or missing requires a server-granted superadmin role. */
  adminVotes?: number;
  /** Zero or missing counts superadmins only toward the ordinary threshold. */
  superAdminVotes?: number;
}

export interface AdminVoteRequirements {
  adminVotes: number;
  superAdminVotes: number;
}

export function loadAdminVotePolicies(
  value: string | undefined,
): AdminVotePolicy[] {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("RELAY_ADMIN_VOTE_POLICIES must be a JSON array");
  }
  if (!Array.isArray(parsed))
    throw new Error("RELAY_ADMIN_VOTE_POLICIES must be a JSON array");
  const seen = new Set<string>();
  return parsed.map((policy, index) => {
    if (
      !policy ||
      typeof policy !== "object" ||
      Array.isArray(policy) ||
      typeof policy.tournament !== "boolean" ||
      !Number.isSafeInteger(policy.minPlayerCount) ||
      policy.minPlayerCount < 0 ||
      (policy.adminVotes !== undefined &&
        (!Number.isSafeInteger(policy.adminVotes) || policy.adminVotes < 0)) ||
      (policy.superAdminVotes !== undefined &&
        (!Number.isSafeInteger(policy.superAdminVotes) ||
          policy.superAdminVotes < 0)) ||
      !((policy.adminVotes ?? 0) >= 1 || (policy.superAdminVotes ?? 0) >= 1)
    )
      throw new Error(
        `RELAY_ADMIN_VOTE_POLICIES[${index}] requires a boolean tournament, nonnegative integer minPlayerCount and vote thresholds, and at least one positive adminVotes or superAdminVotes threshold`,
      );
    const key = `${policy.tournament}:${policy.minPlayerCount}`;
    if (seen.has(key))
      throw new Error(
        `RELAY_ADMIN_VOTE_POLICIES repeats tournament=${policy.tournament}, minPlayerCount=${policy.minPlayerCount}`,
      );
    seen.add(key);
    return {
      tournament: policy.tournament,
      minPlayerCount: policy.minPlayerCount,
      ...(policy.adminVotes !== undefined && { adminVotes: policy.adminVotes }),
      ...(policy.superAdminVotes !== undefined && {
        superAdminVotes: policy.superAdminVotes,
      }),
    };
  });
}

export function selectAdminVoteRequirements(
  policies: readonly AdminVotePolicy[],
  tournament: boolean | null,
  playerCount: number,
): AdminVoteRequirements | null {
  // Do not grant the less restrictive policy during the initial mode probe.
  if (tournament === null) {
    const tourney = selectAdminVoteRequirements(policies, true, playerCount);
    const normal = selectAdminVoteRequirements(policies, false, playerCount);
    if (!tourney || !normal) return null;
    if (
      tourney.adminVotes === normal.adminVotes &&
      tourney.superAdminVotes === normal.superAdminVotes
    )
      return tourney;
    const adminVotes =
      tourney.adminVotes && normal.adminVotes
        ? Math.max(tourney.adminVotes, normal.adminVotes)
        : 0;
    // Superadmins can also satisfy each mode's ordinary-admin threshold.
    const superAdminMinimum = (requirements: AdminVoteRequirements) =>
      Math.min(
        requirements.adminVotes || Infinity,
        requirements.superAdminVotes || Infinity,
      );
    const superAdminVotes = Math.max(
      superAdminMinimum(tourney),
      superAdminMinimum(normal),
    );
    return {
      adminVotes,
      superAdminVotes:
        adminVotes > 0 && superAdminVotes >= adminVotes ? 0 : superAdminVotes,
    };
  }
  let selected: AdminVotePolicy | undefined;
  for (const policy of policies) {
    if (
      policy.tournament === tournament &&
      policy.minPlayerCount <= playerCount &&
      (!selected || policy.minPlayerCount > selected.minPlayerCount)
    )
      selected = policy;
  }
  return selected
    ? {
        adminVotes: selected.adminVotes ?? 0,
        superAdminVotes: selected.superAdminVotes ?? 0,
      }
    : null;
}

/** Kept by server address across session replacement; only a new mission resets it. */
export class MissionControls {
  recording = true;
  watching = true;
  recordingDecision: boolean | undefined;
  private mission: MissionControlState["mission"] = null;
  private votes = {
    recording: new Map<string, AdminVoteRole>(),
    watching: new Map<string, AdminVoteRole>(),
  };

  static restore(value: unknown): MissionControls | null {
    if (!value || typeof value !== "object") return null;
    const { mission, recording, watching, recordingDecision, votes } =
      value as MissionControlState;
    if (
      typeof recording !== "boolean" ||
      typeof watching !== "boolean" ||
      (recordingDecision !== undefined &&
        typeof recordingDecision !== "boolean") ||
      (mission !== null &&
        (!Array.isArray(mission) ||
          mission.length !== 2 ||
          !mission.every(
            (part) => typeof part === "string" && part.length > 0,
          )))
    )
      return null;
    if (
      votes !== undefined &&
      (!votes || typeof votes !== "object" || Array.isArray(votes))
    )
      return null;
    const controls = new MissionControls();
    controls.mission = mission;
    controls.recording = recording;
    controls.watching = watching;
    controls.recordingDecision = recordingDecision;
    for (const setting of settings) {
      const ballot = restoreVoteBallot(votes?.[setting]);
      if (!ballot) return null;
      controls.votes[setting] = ballot;
    }
    if (recordingDecision !== undefined) controls.votes.recording.clear();
    return controls;
  }

  snapshot(): MissionControlState {
    return {
      mission: this.mission && [...this.mission],
      recording: this.recording,
      watching: this.watching,
      ...(this.recordingDecision !== undefined && {
        recordingDecision: this.recordingDecision,
      }),
      ...(this.hasVotes && {
        votes: Object.fromEntries(
          settings
            .filter((setting) => this.votes[setting].size > 0)
            .map((setting) => [
              setting,
              Object.fromEntries(this.votes[setting]),
            ]),
        ),
      }),
    };
  }

  get restricted(): boolean {
    return !this.recording || !this.watching;
  }

  get needsPersistence(): boolean {
    return (
      this.restricted || this.recordingDecision !== undefined || this.hasVotes
    );
  }

  private get hasVotes(): boolean {
    return settings.some((setting) => this.votes[setting].size > 0);
  }

  voteCount(setting: MissionControlSetting, role?: AdminVoteRole): number {
    if (!role) return this.votes[setting].size;
    let count = 0;
    for (const voteRole of this.votes[setting].values())
      if (voteRole === role) count++;
    return count;
  }

  clearVotes(setting: MissionControlSetting): boolean {
    if (this.votes[setting].size === 0) return false;
    this.votes[setting].clear();
    return true;
  }

  /** Returns whether the ballot or applied setting changed. */
  vote(
    setting: MissionControlSetting,
    enabled: boolean,
    voter: string,
    required: AdminVoteRequirements,
    role: AdminVoteRole = "admin",
  ): boolean {
    if (!guidVoterPattern.test(voter)) return false;
    if (setting === "recording" && this.recordingDecision !== undefined)
      return false;
    if (required.adminVotes === 0 && role !== "superadmin") return false;
    const votes = this.votes[setting];
    if (enabled === this[setting]) return votes.delete(voter);
    const previousCount = votes.size;
    if (!votes.has(voter)) votes.set(voter, role);
    if (
      (required.adminVotes > 0 && votes.size >= required.adminVotes) ||
      (required.superAdminVotes > 0 &&
        this.voteCount(setting, "superadmin") >= required.superAdminVotes)
    ) {
      this[setting] = enabled;
      votes.clear();
      return true;
    }
    return votes.size !== previousCount;
  }

  finishRecording(): void {
    this.recordingDecision ??= this.recording;
    this.votes.recording.clear();
  }

  /** A recovered demo journal may be newer than the saved watch-session state. */
  restoreRecordingPolicy(recording: boolean, decision?: boolean): void {
    if (recording !== this.recording || decision !== undefined)
      this.votes.recording.clear();
    this.recording = decision ?? recording;
    this.recordingDecision = decision;
  }

  observeMission(sequence: string, name: string): boolean {
    if (!sequence || !name) return false;
    const changed =
      this.mission !== null &&
      (this.mission[0] !== sequence || this.mission[1] !== name);
    this.mission = [sequence, name];
    if (changed) {
      this.recording = this.watching = true;
      this.recordingDecision = undefined;
      for (const setting of settings) this.votes[setting].clear();
    }
    return changed;
  }
}
