import type { ParsedData, SensorGroupColor } from "t2-demo-parser";
import {
  legacyFlagFields,
  refreshFlagCarriers,
  restoreFlagStates,
  type FlagState,
} from "./flagState.js";
import { updateFlagDropTimes, type FlagDropTimes } from "./flagReturnState.js";
import {
  PlayerResolver,
  collectPlayerTargets,
  type PlayerIdentityState,
  type PlayerRecord,
} from "./playerReference.js";
import {
  LoadInfoCollector,
  getServerNameFromMessage,
  isClassicModInfoMessage,
} from "./serverMessageDecode.js";
import {
  applyServerMessageState,
  type ServerMessageChanges,
  type ServerMessageRosterEntry,
  type ServerMessageTeamScore,
} from "./serverMessageState.js";
import { resolveNetString, stripTaggedStringMarkup } from "./shared.js";
import type { WatchHudStatePayload, WatchTargetEntry } from "./types.js";

/**
 * Connection-scope game state that the relay and the browser derive from
 * the same server stream: the net-string table, the target system, sensor
 * colors, and the roster, scores, flags, clock and mission info that
 * server messages maintain. The relay keeps one per connection for watch
 * catch-up and recording metadata; the browser keeps one per stream. With
 * one implementation, a late joiner hydrated from the relay's snapshot
 * holds what a client that streamed from the start holds.
 *
 * Effects the caller reacts to (entity updates, cache invalidation, self
 * identification) come back as return values; nothing here reaches into
 * either side. Environment-neutral: no node: or DOM imports.
 */

type Rgb = { r: number; g: number; b: number };

/**
 * TargetInfoEvent's string fields, as tags into the net-string table.
 */
interface TargetStringTags {
  nameTag?: number;
  typeTag?: number;
  skinTag?: number;
  skinPrefTag?: number;
}

export interface TargetInfoFields extends TargetStringTags {
  targetId: number;
  sensorGroup?: number;
  renderFlags?: number;
}

/**
 * TargetInfoEvent string fields: omitted = unchanged, 0x400 = empty.
 */
function updateTargetString(
  netStrings: ReadonlyMap<number, string>,
  values: Map<number, string>,
  pending: Map<number, number>,
  targetId: number,
  tag: number | undefined,
): void {
  if (tag == null) return;
  pending.delete(targetId);
  const value = tag === 0x400 ? "" : netStrings.get(tag);
  if (value != null) values.set(targetId, value);
  else {
    values.delete(targetId);
    pending.set(targetId, tag);
  }
}

function replaceEntries<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}

/**
 * The target system's per-target tables, with string tags held until their
 * NetStringEvent arrives.
 */
export class TargetTable {
  /**
   * Target names as sent, color codes included — the official clan tag is the
   * color-7 segments, the base name the color-6 ones.
   */
  readonly rawNames = new Map<number, string>();
  readonly types = new Map<number, string>();
  readonly skins = new Map<number, string>();
  readonly skinPrefs = new Map<number, string>();
  /**
   * Sensor group (team) per target.
   */
  readonly teams = new Map<number, number>();
  readonly renderFlags = new Map<number, number>();
  /**
   * How many times each target id has been freed (TargetFreeEvent). Target ids
   * are recycled, so an id plus its generation is what names one occupant.
   */
  readonly generations = new Map<number, number>();
  /**
   * targetId → string tag, until its NetStringEvent arrives.
   */
  readonly pendingNameTags = new Map<number, number>();
  readonly pendingTypeTags = new Map<number, number>();
  readonly pendingSkinTags = new Map<number, number>();
  readonly pendingSkinPrefTags = new Map<number, number>();
  private readonly netStrings: ReadonlyMap<number, string>;
  private readonly stringFields: ReadonlyArray<
    [Map<number, string>, Map<number, number>]
  > = [
    [this.rawNames, this.pendingNameTags],
    [this.types, this.pendingTypeTags],
    [this.skins, this.pendingSkinTags],
    [this.skinPrefs, this.pendingSkinPrefTags],
  ];

  constructor(netStrings: ReadonlyMap<number, string>) {
    this.netStrings = netStrings;
  }

  /**
   * A NetStringEvent fills the tags waiting on it. Returns each target
   * a field resolved for, in resolution order (a target can repeat).
   */
  resolveNetString(id: number, value: string): number[] {
    const resolved: number[] = [];
    for (const [values, pending] of this.stringFields) {
      for (const [targetId, tag] of pending) {
        if (tag !== id) continue;
        pending.delete(targetId);
        values.set(targetId, value);
        resolved.push(targetId);
      }
    }
    return resolved;
  }

  /**
   * Apply a TargetInfoEvent. Returns whether it carried a field the HUD
   * shows: name, type, skin, team or render flags.
   */
  applyInfo(info: TargetInfoFields): boolean {
    const { targetId, sensorGroup, renderFlags } = info;
    this.setStrings(targetId, info);
    if (sensorGroup != null) this.teams.set(targetId, sensorGroup);
    if (renderFlags != null) this.renderFlags.set(targetId, renderFlags);
    return (
      info.nameTag != null ||
      info.typeTag != null ||
      info.skinTag != null ||
      sensorGroup != null ||
      renderFlags != null
    );
  }

  /**
   * TargetFreeEvent: the slot is free, and nothing about the old holder
   * (name, skin, team, flag bits) may leak onto whatever wears this id
   * next — the re-issue's TargetInfoEvent starts clean.
   */
  free(targetId: number): void {
    this.generations.set(targetId, (this.generations.get(targetId) ?? 0) + 1);
    for (const [values, pending] of this.stringFields) {
      values.delete(targetId);
      pending.delete(targetId);
    }
    this.teams.delete(targetId);
    this.renderFlags.delete(targetId);
  }

  /**
   * A roster rename names the client's target before its TargetInfoEvent.
   */
  rename(targetId: number, rawName: string): void {
    this.pendingNameTags.delete(targetId);
    this.rawNames.set(targetId, rawName);
  }

  /**
   * One entry of a catch-up or a demo's start block (entries' inverse).
   */
  seed(entry: WatchTargetEntry): void {
    const id = entry.targetId;
    if (entry.name != null) this.rawNames.set(id, entry.name);
    if (entry.typeDescription != null)
      this.types.set(id, entry.typeDescription);
    if (entry.skin != null) this.skins.set(id, entry.skin);
    if (entry.skinPref != null) this.skinPrefs.set(id, entry.skinPref);
    this.setStrings(id, entry);
    if (entry.sensorGroup != null) this.teams.set(id, entry.sensorGroup);
    if (entry.targetData != null) this.renderFlags.set(id, entry.targetData);
  }

  /**
   * Every known target, in the catch-up wire shape (seed's inverse).
   */
  entries(): WatchTargetEntry[] {
    const targetIds = new Set<number>([
      ...this.rawNames.keys(),
      ...this.types.keys(),
      ...this.pendingNameTags.keys(),
      ...this.pendingTypeTags.keys(),
      ...this.pendingSkinTags.keys(),
      ...this.pendingSkinPrefTags.keys(),
      ...this.teams.keys(),
      ...this.renderFlags.keys(),
      ...this.skins.keys(),
      ...this.skinPrefs.keys(),
    ]);
    return [...targetIds]
      .sort((a, b) => a - b)
      .map((targetId) => ({
        targetId,
        name: this.rawNames.get(targetId),
        typeDescription: this.types.get(targetId),
        nameTag: this.pendingNameTags.get(targetId),
        typeTag: this.pendingTypeTags.get(targetId),
        skinTag: this.pendingSkinTags.get(targetId),
        skinPrefTag: this.pendingSkinPrefTags.get(targetId),
        skin: this.skins.get(targetId),
        skinPref: this.skinPrefs.get(targetId),
        sensorGroup: this.teams.get(targetId),
        targetData: this.renderFlags.get(targetId),
      }));
  }

  /**
   * Every target that could be a player's: these plus any _ClientConnection.
   */
  playerTargets(knownIds: Iterable<number>): PlayerRecord[] {
    return collectPlayerTargets(
      this.rawNames,
      this.types,
      this.teams,
      this.generations,
      knownIds,
    );
  }

  clear(): void {
    for (const map of this.maps()) map.clear();
  }

  /**
   * The tables for a checkpoint; callers clone.
   */
  save() {
    return {
      rawNames: this.rawNames,
      types: this.types,
      skins: this.skins,
      skinPrefs: this.skinPrefs,
      teams: this.teams,
      renderFlags: this.renderFlags,
      generations: this.generations,
      pendingNameTags: this.pendingNameTags,
      pendingTypeTags: this.pendingTypeTags,
      pendingSkinTags: this.pendingSkinTags,
      pendingSkinPrefTags: this.pendingSkinPrefTags,
    };
  }

  /**
   * Adopt a cloned save().
   */
  restore(saved: ReturnType<TargetTable["save"]>): void {
    const own = this.save();
    for (const key of Object.keys(own) as Array<keyof typeof own>)
      replaceEntries<number, string | number>(own[key], saved[key]);
  }

  private setStrings(targetId: number, tags: TargetStringTags): void {
    const { netStrings } = this;
    updateTargetString(
      netStrings,
      this.rawNames,
      this.pendingNameTags,
      targetId,
      tags.nameTag,
    );
    updateTargetString(
      netStrings,
      this.types,
      this.pendingTypeTags,
      targetId,
      tags.typeTag,
    );
    updateTargetString(
      netStrings,
      this.skins,
      this.pendingSkinTags,
      targetId,
      tags.skinTag,
    );
    updateTargetString(
      netStrings,
      this.skinPrefs,
      this.pendingSkinPrefTags,
      targetId,
      tags.skinPrefTag,
    );
  }

  private maps(): Map<number, string | number>[] {
    return Object.values(this.save());
  }
}

/**
 * What a target-system or sensor event changed, for the caller's reactions.
 */
export type ConnectionEventEffect =
  | { kind: "none" }
  | { kind: "netString"; resolvedTargets: number[] }
  | { kind: "targetInfo"; targetId: number; hudChanged: boolean }
  | { kind: "targetFree"; targetId: number; hadFlagBit: boolean };

/**
 * What a server message changed, for the caller's reactions.
 */
export interface ConnectionMessageEffects extends ServerMessageChanges {
  /**
   * Mission or game type names, or the game class, may have changed.
   */
  readonly missionInfoChanged?: boolean;
  /**
   * A server name the message carries; each side keeps its own policy.
   */
  readonly serverName?: string;
  /**
   * MsgClientReady: the client dropped into a (new) mission.
   */
  readonly missionDropReady?: boolean;
  /**
   * MsgLoadInfoDone published the mission's loading-screen text.
   */
  readonly loadInfoChanged?: boolean;
}

const NO_EVENT_EFFECT: ConnectionEventEffect = { kind: "none" };
const NO_MESSAGE_EFFECTS: ConnectionMessageEffects = {};

export interface ConnectionStateOptions {
  /**
   * Seconds: wall time on the relay, stream time in the browser.
   */
  now: () => number;
  /**
   * Scope of the player identities this connection hands out.
   */
  identityScope: string;
  /**
   * Player targets known beyond the roster's (the browser's Player ghosts).
   */
  playerTargetIds?: () => Iterable<number>;
}

/**
 * A catch-up's or demo start block's tables, needed before any ghost.
 */
export interface ConnectionTables {
  taggedStrings: Iterable<[number, string]>;
  targetEntries: Iterable<WatchTargetEntry>;
  sensorGroupColors: Iterable<
    Pick<SensorGroupColor, "group" | "targetGroup" | "r" | "g" | "b">
  >;
  targetGenerations?: Iterable<[number, number]>;
}

export class ConnectionState {
  readonly netStrings = new Map<number, string>();
  readonly targets = new TargetTable(this.netStrings);
  /**
   * group → targetGroup → color (SensorGroupColorEvent).
   */
  readonly sensorGroupColors = new Map<number, Map<number, Rgb>>();
  /**
   * GameConnection's own sensor group, delivered by SetSensorGroupEvent. The
   * stock game sets it to our team (0 = observer), independently of roster
   * identity and the target or control object being viewed.
   */
  playerSensorGroup = 0;
  playerRoster = new Map<number, ServerMessageRosterEntry>();
  teamScores: ServerMessageTeamScore[] = [];
  flags = new Map<number, FlagState>();
  playerIdentity: PlayerIdentityState;
  flagDroppedAtSec: FlagDropTimes = {};
  /**
   * The last MsgSystemClock: when it arrived and the time it set (0 = count-up,
   * > 0 = count-down).
   */
  clock: { anchorSec: number; durationMs: number } | null = null;
  /**
   * The match is underway (or seconds away): set by MsgMissionStart
   * (start/countdown — idle warmup sends neither), a running match clock, or a
   * team with points on the board (untimed servers send no running clock).
   * Never true while a server sits in pre-match warmup.
   */
  matchStarted = false;
  /**
   * Match-over interval: MissionEnd seen, next MsgClientReady not.
   */
  matchEnded = false;
  /**
   * When MissionEnd arrived; the clock and flag timers hold there.
   */
  matchEndedAtSec: number | null = null;
  /**
   * Mission display name (e.g. "Riverdance"), from
   * MsgMissionDropInfo/MsgLoadInfo.
   */
  missionDisplayName: string | null = null;
  /**
   * Game type display name (e.g. "Capture the Flag"), from
   * MsgMissionDropInfo/MsgLoadInfo.
   */
  missionTypeDisplayName: string | null = null;
  /**
   * Game class name (e.g. "CTFGame"), from MsgClientReady.
   */
  gameClassName: string | null = null;
  serverDisplayName: string | null = null;
  /**
   * The mission's loading-screen text (MsgLoadInfo … MsgLoadInfoDone).
   */
  readonly loadInfo = new LoadInfoCollector();
  private readonly options: ConnectionStateOptions;

  constructor(options: ConnectionStateOptions) {
    this.options = options;
    this.playerIdentity = {
      scope: options.identityScope,
      generations: new Map(),
    };
  }

  resolveNetString(s: string): string {
    return resolveNetString(s, this.netStrings);
  }

  /**
   * Apply a net-string, target-system or sensor event. Returns null for
   * events this state doesn't own.
   */
  applyEvent(
    data: ParsedData,
    eventName?: string,
  ): ConnectionEventEffect | null {
    switch ((data.type as string | undefined) ?? eventName) {
      case "NetStringEvent": {
        const { id, value } = data as { id?: number; value?: string };
        if (id == null || typeof value !== "string") return NO_EVENT_EFFECT;
        this.netStrings.set(id, value);
        return {
          kind: "netString",
          resolvedTargets: this.targets.resolveNetString(id, value),
        };
      }
      case "TargetInfoEvent": {
        const info = data as Partial<TargetInfoFields>;
        if (info.targetId == null) return NO_EVENT_EFFECT;
        return {
          kind: "targetInfo",
          targetId: info.targetId,
          hudChanged: this.targets.applyInfo(info as TargetInfoFields),
        };
      }
      case "TargetFreeEvent": {
        const { targetId } = data as { targetId?: number };
        if (targetId == null) return NO_EVENT_EFFECT;
        const hadFlagBit =
          ((this.targets.renderFlags.get(targetId) ?? 0) & 0x2) !== 0;
        for (const player of this.playerRoster.values())
          if (player.targetId === targetId) player.targetId = -1;
        this.targets.free(targetId);
        return { kind: "targetFree", targetId, hadFlagBit };
      }
      case "SetSensorGroupEvent": {
        const { sensorGroup } = data as { sensorGroup?: number };
        if (typeof sensorGroup === "number")
          this.playerSensorGroup = sensorGroup;
        return NO_EVENT_EFFECT;
      }
      case "SensorGroupColorEvent": {
        const { sensorGroup, colors } = data as {
          sensorGroup: number;
          colors?: Array<{
            index: number;
            default?: boolean;
            r?: number;
            g?: number;
            b?: number;
          }>;
        };
        if (!colors) return NO_EVENT_EFFECT;
        const map = this.sensorColorsOf(sensorGroup);
        for (const c of colors) {
          if (c.default) map.delete(c.index);
          else map.set(c.index, { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0 });
        }
        return NO_EVENT_EFFECT;
      }
      default:
        return null;
    }
  }

  /**
   * Apply a ServerMessage (args after the command name). Returns null for
   * messages this state doesn't own; the caller may handle those.
   */
  applyServerMessage(args: string[]): ConnectionMessageEffects | null {
    if (args.length < 1) return null;
    const resolve = (s: string) => this.resolveNetString(s);
    const msgType = resolve(args[0]);

    this.flagDroppedAtSec = updateFlagDropTimes(
      this.flagDroppedAtSec,
      msgType,
      args,
      resolve,
      this.matchEndedAtSec ?? this.options.now(),
    );

    const changes = applyServerMessageState(msgType, args, resolve, {
      playerRoster: this.playerRoster,
      teamScores: this.teamScores,
      flags: this.flags,
      playerIdentity: this.playerIdentity,
      resolvePlayers: () => this.resolvePlayers(),
    });
    if (changes) {
      if (changes.matchStarted) this.matchStarted = true;
      const renamed = changes.renamedPlayer;
      // Rename the client target now; its TargetInfoEvent can arrive a
      // packet later.
      if (renamed && changes.renamedTargetId != null)
        this.targets.rename(changes.renamedTargetId, renamed.rawName);
      return changes;
    }

    if (msgType === "MsgSystemClock" && args.length >= 4) {
      // Wire order: args[2]=timeLimitMinutes, args[3]=timeRemainingMS.
      // Binary-verified (HudClock 0x004fe7e0/0x004fe8a0): the client
      // calls clockHud.setTime(timeRemainingMS / 60000), which stores a
      // single deadline; each frame renders abs(now - deadline) — so
      // 0 counts up from 00:00 (untimed/joiner sync), N counts down and
      // passes through zero into count-up overtime. args[2] is dead
      // data on the client ($Hud::TimeLimit, never read).
      const timeRemainingMS = parseFloat(resolve(args[3]));
      this.clock = {
        anchorSec: this.matchEndedAtSec ?? this.options.now(),
        durationMs: Number.isFinite(timeRemainingMS) ? timeRemainingMS : 0,
      };
      // A running match clock (late-join case): warmup joiners get 0,0
      // and pre-start countdown ticks stay under ~30s.
      if (Number.isFinite(timeRemainingMS) && timeRemainingMS > 60_000)
        this.matchStarted = true;
      return NO_MESSAGE_EFFECTS;
    }
    if (msgType === "MsgMissionStart") {
      // Sent by DefaultGame::startMatch ("Match started!") and by the
      // pre-start countdown ticks — never during idle warmup.
      this.matchStarted = true;
      return NO_MESSAGE_EFFECTS;
    }
    if (msgType === "MsgMissionDropInfo" && args.length >= 5) {
      // messageClient(%cl, 'MsgMissionDropInfo', ..., $MissionDisplayName, $MissionTypeDisplayName, $ServerName)
      const resolved = args.map(resolve);
      this.setMissionNames(resolved[2], resolved[3]);
      return {
        missionInfoChanged: true,
        serverName: getServerNameFromMessage(resolved) ?? undefined,
      };
    }
    if (msgType === "MsgLoadInfo" && args.length >= 5) {
      // messageClient(%cl, 'MsgLoadInfo', "", $CurrentMission, $MissionDisplayName, $MissionTypeDisplayName)
      const resolved = args.map(resolve);
      // Classic's sendModInfoToClient reuses this command for
      // ($CurrentMission, "Classic  1.1", $Host::GameName), then sends
      // the regular mission info again seven seconds later. Match its
      // versioned label (including the two spaces), not arbitrary maps
      // whose names begin with "Classic".
      let serverName: string | undefined;
      if (isClassicModInfoMessage(resolved))
        serverName = getServerNameFromMessage(resolved) ?? undefined;
      else this.setMissionNames(resolved[3], resolved[4]);
      this.loadInfo.begin();
      return { missionInfoChanged: true, serverName };
    }
    if (LoadInfoCollector.handles(msgType)) {
      return this.loadInfo.apply(msgType, args, resolve)
        ? { loadInfoChanged: true }
        : NO_MESSAGE_EFFECTS;
    }
    if (msgType === "MsgClientReady" && args.length >= 3) {
      // messageClient(%cl, 'MsgClientReady', "", %game.class)
      this.gameClassName = resolve(args[2]) || this.gameClassName;
      this.flags.clear();
      // Dropping into a (new) mission ends any match-over interval.
      if (this.matchEndedAtSec != null && this.clock)
        this.clock.anchorSec += this.options.now() - this.matchEndedAtSec;
      this.matchEnded = false;
      this.matchEndedAtSec = null;
      // Mission-scoped: a same-map restart skips beginMissionChange.
      this.matchStarted = false;
      return { missionDropReady: true, missionInfoChanged: true };
    }
    return null;
  }

  /**
   * MissionEnd. Returns whether the match just ended.
   */
  endMatch(): boolean {
    if (this.matchEnded) return false;
    this.matchEnded = true;
    this.matchEndedAtSec = this.options.now();
    return true;
  }

  /**
   * A new mission is loading (MissionStartPhase1): forget mission-scoped
   * display state. Fresh values arrive with MsgClientReady and
   * MsgMissionDropInfo. The loading-screen text stays: servers send it
   * before Phase1 (GameConnection::onConnect, loadMission).
   */
  beginMissionChange(): void {
    this.flagDroppedAtSec = {};
    this.flags.clear();
    this.missionDisplayName = null;
    this.missionTypeDisplayName = null;
    this.gameClassName = null;
    this.serverDisplayName = null;
    this.matchStarted = false;
  }

  /**
   * Forget everything, as for a stream replayed from its start.
   */
  reset(): void {
    this.netStrings.clear();
    this.targets.clear();
    this.sensorGroupColors.clear();
    this.playerSensorGroup = 0;
    this.playerRoster.clear();
    this.teamScores = [];
    this.flags.clear();
    this.playerIdentity.generations = new Map();
    this.flagDroppedAtSec = {};
    this.clock = null;
    this.matchStarted = false;
    this.matchEnded = false;
    this.matchEndedAtSec = null;
    this.missionDisplayName = null;
    this.missionTypeDisplayName = null;
    this.gameClassName = null;
    this.serverDisplayName = null;
    this.loadInfo.reset();
  }

  /**
   * Player targets: the roster's, the caller's extras, every _ClientConnection.
   */
  playerTargets(): PlayerRecord[] {
    const ids: number[] = [];
    for (const player of this.playerRoster.values())
      if (player.targetId != null) ids.push(player.targetId);
    for (const id of this.options.playerTargetIds?.() ?? []) ids.push(id);
    return this.targets.playerTargets(ids);
  }

  resolvePlayers(targets = this.playerTargets()): PlayerResolver {
    return new PlayerResolver(
      this.playerIdentity.scope,
      Array.from(this.playerRoster, ([clientId, player]) => ({
        clientId,
        ...player,
      })),
      targets,
    );
  }

  // ── Catch-up snapshot: the relay writes it, a late joiner reads it ──

  taggedStringEntries(): Array<[number, string]> {
    return [...this.netStrings.entries()];
  }

  sensorGroupColorEntries(): SensorGroupColor[] {
    const flat: SensorGroupColor[] = [];
    for (const [group, map] of this.sensorGroupColors) {
      for (const [targetGroup, color] of map) {
        flat.push({ group, targetGroup, ...color, a: 255 });
      }
    }
    return flat;
  }

  /**
   * Roster, scores, flags, clock and mission info (hydrateHud's inverse).
   */
  hudState(): WatchHudStatePayload {
    const players = this.resolvePlayers();
    refreshFlagCarriers(this.flags, players);
    const nowSec = this.matchEndedAtSec ?? this.options.now();
    const loadInfo = this.loadInfo.saveState();
    return {
      playerIdentity: {
        scope: this.playerIdentity.scope,
        generations: Array.from(this.playerIdentity.generations ?? []),
      },
      targetGenerations: Array.from(this.targets.generations),
      flags: Array.from(this.flags.values()),
      playerRoster: [...this.playerRoster.entries()].map(
        ([clientId, entry]) => ({ clientId, ...entry }),
      ),
      teamScores: this.teamScores.map((entry) => ({
        ...entry,
        ...legacyFlagFields(this.flags.get(entry.teamId), players),
      })),
      flagDropElapsedSec: Object.fromEntries(
        Object.entries(this.flagDroppedAtSec).map(([team, droppedAt]) => [
          team,
          nowSec - droppedAt!,
        ]),
      ),
      clock: this.clock
        ? {
            durationMs: this.clock.durationMs,
            // Whole milliseconds, the resolution of the relay's clock.
            elapsedMs: Math.round((nowSec - this.clock.anchorSec) * 1000),
          }
        : undefined,
      missionDisplayName: this.missionDisplayName ?? undefined,
      missionTypeDisplayName: this.missionTypeDisplayName ?? undefined,
      gameClassName: this.gameClassName ?? undefined,
      serverDisplayName: this.serverDisplayName ?? undefined,
      matchEnded: this.matchEnded,
      matchStarted: this.matchStarted,
      loadInfo: loadInfo.complete ?? undefined,
      pendingLoadInfo: loadInfo.pending ?? undefined,
    };
  }

  /**
   * Seed the tables a catch-up or demo start block carries. They come
   * before any ghost, which is named, colored and dated from them as it's
   * created — as on a client that streamed from the start.
   */
  seedTables(tables: ConnectionTables): void {
    for (const [id, value] of tables.taggedStrings)
      this.netStrings.set(id, value);
    for (const entry of tables.targetEntries) this.targets.seed(entry);
    for (const { group, targetGroup, r, g, b } of tables.sensorGroupColors)
      this.sensorColorsOf(group).set(targetGroup, { r, g, b });
    for (const [id, generation] of tables.targetGenerations ?? [])
      this.targets.generations.set(id, generation);
  }

  /**
   * The rest of a catch-up's hudState (hudState's inverse). The caller
   * ends the match when `hud.matchEnded` says so, through its own
   * endMatch: the browser also freezes its scene there.
   */
  hydrateHud(hud: WatchHudStatePayload): void {
    const nowSec = this.options.now();
    this.playerIdentity = {
      scope: hud.playerIdentity?.scope ?? globalThis.crypto.randomUUID(),
      generations: hud.playerIdentity
        ? new Map(hud.playerIdentity.generations)
        : null,
    };
    this.flagDroppedAtSec = Object.fromEntries(
      Object.entries(hud.flagDropElapsedSec ?? {}).map(([team, elapsed]) => [
        team,
        nowSec - elapsed!,
      ]),
    );
    for (const entry of hud.playerRoster) {
      this.playerRoster.set(entry.clientId, {
        name: entry.name,
        rawName: entry.rawName,
        guid: entry.guid,
        clientGeneration: entry.clientGeneration,
        isAdmin: entry.isAdmin,
        isSuperAdmin: entry.isSuperAdmin,
        isSmurf: entry.isSmurf,
        targetId: entry.targetId,
        teamId: entry.teamId,
        score: entry.score,
        ping: entry.ping,
        packetLoss: entry.packetLoss,
        kills: entry.kills,
      });
    }
    // Older relays send flags only as the legacy per-team fields.
    this.flags = restoreFlagStates(
      hud.flags,
      hud.teamScores,
      this.playerIdentity.scope,
      hud.playerRoster,
    );
    this.teamScores = hud.teamScores.map(({ teamId, name, score }) => ({
      teamId,
      name,
      score,
    }));
    if (hud.clock)
      this.clock = {
        anchorSec: nowSec - hud.clock.elapsedMs / 1000,
        durationMs: hud.clock.durationMs,
      };
    this.missionDisplayName = hud.missionDisplayName ?? null;
    this.missionTypeDisplayName = hud.missionTypeDisplayName ?? null;
    this.gameClassName = hud.gameClassName ?? null;
    this.serverDisplayName = hud.serverDisplayName ?? null;
    this.loadInfo.restoreState({
      complete: hud.loadInfo ?? null,
      pending: hud.pendingLoadInfo ?? null,
    });
    // Older relays don't send matchStarted; a running clock in the
    // payload proves the match is underway just as well.
    this.matchStarted =
      hud.matchStarted ?? (hud.clock != null && hud.clock.durationMs > 60_000);
  }

  /**
   * Everything above, for a checkpoint; callers clone.
   */
  save() {
    return {
      netStrings: this.netStrings,
      targets: this.targets.save(),
      sensorGroupColors: this.sensorGroupColors,
      playerSensorGroup: this.playerSensorGroup,
      playerRoster: this.playerRoster,
      teamScores: this.teamScores,
      flags: this.flags,
      playerIdentity: this.playerIdentity,
      flagDroppedAtSec: this.flagDroppedAtSec,
      clock: this.clock,
      matchStarted: this.matchStarted,
      matchEnded: this.matchEnded,
      matchEndedAtSec: this.matchEndedAtSec,
      missionDisplayName: this.missionDisplayName,
      missionTypeDisplayName: this.missionTypeDisplayName,
      gameClassName: this.gameClassName,
      serverDisplayName: this.serverDisplayName,
      loadInfo: this.loadInfo.saveState(),
    };
  }

  /**
   * Adopt a cloned save().
   */
  restore(saved: ReturnType<ConnectionState["save"]>): void {
    replaceEntries(this.netStrings, saved.netStrings);
    this.targets.restore(saved.targets);
    replaceEntries(this.sensorGroupColors, saved.sensorGroupColors);
    this.playerSensorGroup = saved.playerSensorGroup;
    this.playerRoster = saved.playerRoster;
    this.teamScores = saved.teamScores;
    this.flags = saved.flags;
    this.playerIdentity = saved.playerIdentity;
    this.flagDroppedAtSec = saved.flagDroppedAtSec;
    this.clock = saved.clock;
    this.matchStarted = saved.matchStarted;
    this.matchEnded = saved.matchEnded;
    this.matchEndedAtSec = saved.matchEndedAtSec;
    this.missionDisplayName = saved.missionDisplayName;
    this.missionTypeDisplayName = saved.missionTypeDisplayName;
    this.gameClassName = saved.gameClassName;
    this.serverDisplayName = saved.serverDisplayName;
    this.loadInfo.restoreState(saved.loadInfo);
  }

  private sensorColorsOf(group: number): Map<number, Rgb> {
    let colors = this.sensorGroupColors.get(group);
    if (!colors) {
      colors = new Map();
      this.sensorGroupColors.set(group, colors);
    }
    return colors;
  }

  private setMissionNames(mission: string, missionType: string): void {
    this.missionDisplayName =
      stripTaggedStringMarkup(mission) || this.missionDisplayName;
    this.missionTypeDisplayName =
      stripTaggedStringMarkup(missionType) || this.missionTypeDisplayName;
  }
}
