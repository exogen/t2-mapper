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
  // hud.cs: chatMessageAll(%client, '\c4%1: %2', %client.name, %text).
  if (args.length < 6 || args[3] !== "\x05%1: %2" || !/^\d+$/.test(args[0]))
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
  /** Distinct admins proposing the opposite of each currently applied setting. */
  votes?: Partial<Record<MissionControlSetting, string[]>>;
}

export type MissionControlSetting = "recording" | "watching";
const settings = ["recording", "watching"] as const;

export interface AdminVotePolicy {
  tournament: boolean;
  minPlayerCount: number;
  adminVotes: number;
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
      !Number.isSafeInteger(policy.adminVotes) ||
      policy.adminVotes < 1
    )
      throw new Error(
        `RELAY_ADMIN_VOTE_POLICIES[${index}] requires a boolean tournament, nonnegative integer minPlayerCount, and positive integer adminVotes`,
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
      adminVotes: policy.adminVotes,
    };
  });
}

export function selectAdminVotesRequired(
  policies: readonly AdminVotePolicy[],
  tournament: boolean | null,
  playerCount: number,
): number | null {
  // Do not grant the less restrictive policy during the initial mode probe.
  if (tournament === null) {
    const tourney = selectAdminVotesRequired(policies, true, playerCount);
    const normal = selectAdminVotesRequired(policies, false, playerCount);
    return tourney === null || normal === null
      ? null
      : Math.max(tourney, normal);
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
  return selected?.adminVotes ?? null;
}

/** Kept by server address across session replacement; only a new mission resets it. */
export class MissionControls {
  recording = true;
  watching = true;
  recordingDecision: boolean | undefined;
  private mission: MissionControlState["mission"] = null;
  private votes = { recording: new Set<string>(), watching: new Set<string>() };

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
      (!votes ||
        typeof votes !== "object" ||
        Array.isArray(votes) ||
        settings.some(
          (setting) =>
            votes[setting] !== undefined &&
            (!Array.isArray(votes[setting]) ||
              !votes[setting]!.every(
                (voter) =>
                  typeof voter === "string" &&
                  /^(?:guid|client):[1-9]\d*$/.test(voter),
              )),
        ))
    )
      return null;
    const controls = new MissionControls();
    controls.mission = mission;
    controls.recording = recording;
    controls.watching = watching;
    controls.recordingDecision = recordingDecision;
    for (const setting of settings)
      controls.votes[setting] = new Set(votes?.[setting]);
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
            .map((setting) => [setting, [...this.votes[setting]]]),
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

  voteCount(setting: MissionControlSetting): number {
    return this.votes[setting].size;
  }

  /** Returns whether the ballot or applied setting changed. */
  vote(
    setting: MissionControlSetting,
    enabled: boolean,
    voter: string,
    required: number,
  ): boolean {
    if (setting === "recording" && this.recordingDecision !== undefined)
      return false;
    const votes = this.votes[setting];
    if (enabled === this[setting]) return votes.delete(voter);
    const previousCount = votes.size;
    votes.add(voter);
    if (votes.size >= required) {
      this[setting] = enabled;
      votes.clear();
      return true;
    }
    return votes.size !== previousCount;
  }

  forgetVoter(voter: string): boolean {
    const recording = this.votes.recording.delete(voter);
    const watching = this.votes.watching.delete(voter);
    return recording || watching;
  }

  retainVoters(eligible: ReadonlySet<string>): boolean {
    let changed = false;
    for (const setting of settings) {
      for (const voter of this.votes[setting]) {
        if (!eligible.has(voter))
          changed = this.votes[setting].delete(voter) || changed;
      }
    }
    return changed;
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
