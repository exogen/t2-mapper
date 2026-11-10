import { randomUUID } from "node:crypto";
import {
  createDefaultRegistry,
  type GhostAlwaysObjectEventData,
  type GhostUpdate,
  type PacketData,
  type ParsedData,
  type PrecipitationGhostData,
  type SensorGroupColor,
  type SkyGhostData,
} from "t2-demo-parser";
import { skyFromGhost, updateSkyFromGhost } from "../src/scene/ghostToScene.js";
import { shiftSkyWeather } from "../src/scene/skyWeather.js";
import type { SceneSky } from "../src/scene/types.js";
import { resolvePrecipitationState } from "../src/weather/data.js";
import type { PrecipitationState } from "../src/weather/types.js";
import { ConnectionState } from "./connectionState.js";
import { isServerMessageCommand } from "./serverMessageDecode.js";
import type { ServerMessageRosterEntry as RosterEntry } from "./serverMessageState.js";
import { stripTaggedStringMarkup } from "./shared.js";
import type {
  WatchCatchupPayload,
  WatchHudStatePayload,
  WatchTargetEntry,
} from "./types.js";

export interface WatchStateOptions {
  /** Seconds in the source's clock: wall time for live, demo time for replay. */
  now?: () => number;
  identityScope?: string;
}

const registry = createDefaultRegistry();
const precipitationClassId = registry.getGhostClassId("Precipitation")!;
const skyClassId = registry.getGhostClassId("Sky")!;

type WeatherGhost =
  | { kind: "precipitation"; state: PrecipitationState }
  | { kind: "sky"; state: SceneSky };

type WatchStateSeed = Pick<
  WatchCatchupPayload,
  | "taggedStrings"
  | "dataBlocks"
  | "targetEntries"
  | "sensorGroupColors"
  | "playerSensorGroup"
  | "controlObjectGhostIndex"
  | "controlObjectData"
  | "missionName"
  | "missionSequence"
  | "displayedMission"
  | "worldGravity"
  | "ghostingComplete"
  | "initialGhosts"
  | "hudState"
>;

/**
 * Connection-scope game state a late joiner can't recover from the live
 * stream: net strings, target-system tables, sensor colors, roster/
 * scores/clock, mission info, and the latest control object. Ghost
 * state lives separately in GhostStateAccumulator (t2-demo-parser).
 *
 * The protocol state is the same ConnectionState browser playback keeps.
 * Connection identity, tournament detection, recording callbacks and the
 * wall clock stay relay-local.
 */

export class WatchStateAccumulator {
  private readonly state: ConnectionState;
  private readonly now: () => number;
  private weatherGhosts = new Map<number, WeatherGhost>();
  private weatherTime = 0;
  /** Datablock class names from SimDataBlockEvents (for CRC + payload). */
  readonly dataBlockClassNames = new Map<number, string>();

  missionName: string | null = null;
  missionSequence: string | null = null;
  displayedMission: WatchCatchupPayload["displayedMission"] = null;
  /** Latest GravityEvent in native setGravity() units; unknown until received. */
  worldGravity: number | undefined;
  ghostingComplete = false;
  controlObjectGhostIndex = -1;
  controlObjectData: ParsedData | undefined;
  /**
   * Our server-side client ID, supplied by the live connection handshake
   * or a demo header. Old demos without an ID can infer it from the welcome.
   * Used for recording metadata, not observer recovery; null until known.
   */
  selfClientId: number | null = null;
  /**
   * Tournament mode, as told by the server; null until determined. The
   * vote menu answers queries sent by the session on connect or by a
   * player's ordinary in-game menu: sendGameVoteMenu offers
   * VoteFFAMode while in tournament mode and VoteTournamentMode
   * otherwise. The stock join banner ("Server is Running in Tournament
   * Mode" BottomPrint) corroborates the positive case.
   */
  tournamentMode: boolean | null = null;

  /**
   * The per-client mission-drop burst has arrived (MsgClientReady, the
   * first message of clientMissionDropReady). The tournament banner, if
   * any, rides in that same burst, so this marks the point after which
   * the session can resolve the tournament decision on a short grace.
   */
  sawMissionDropReady = false;

  constructor(
    initialRoster?: ReadonlyMap<number, RosterEntry>,
    options: WatchStateOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now() / 1000);
    this.state = new ConnectionState({
      now: this.now,
      identityScope: options.identityScope ?? randomUUID(),
    });
    if (initialRoster)
      for (const [id, entry] of initialRoster) {
        this.state.playerRoster.set(id, { ...entry });
        this.state.playerIdentity.generations?.set(
          id,
          entry.clientGeneration ?? 0,
        );
      }
  }

  /** Seed a recording's retained state without dispatching its pending events. */
  seed(seed: WatchStateSeed): void {
    this.state.seedTables(seed);
    this.state.hydrateHud(seed.hudState);
    this.playerSensorGroup = seed.playerSensorGroup;
    this.controlObjectGhostIndex = seed.controlObjectGhostIndex;
    this.controlObjectData = structuredClone(seed.controlObjectData);
    this.missionName = seed.missionName;
    this.missionSequence = seed.missionSequence ?? null;
    this.displayedMission =
      seed.displayedMission === undefined
        ? this.currentMissionIdentity()
        : structuredClone(seed.displayedMission);
    this.worldGravity = seed.worldGravity;
    this.ghostingComplete = seed.ghostingComplete ?? false;
    this.weatherGhosts.clear();
    this.weatherTime = this.now();
    for (const ghost of seed.initialGhosts) this.applyWeatherGhost(ghost);
    for (const [id, block] of seed.dataBlocks)
      this.dataBlockClassNames.set(id, block.className);
  }

  /** Checkpoints own their mutable data; subsequent packets cannot change them. */
  save() {
    return structuredClone({
      connection: this.state.save(),
      dataBlockClassNames: this.dataBlockClassNames,
      missionName: this.missionName,
      missionSequence: this.missionSequence,
      displayedMission: this.displayedMission,
      worldGravity: this.worldGravity,
      ghostingComplete: this.ghostingComplete,
      weatherGhosts: this.weatherGhosts,
      weatherTime: this.weatherTime,
      controlObjectGhostIndex: this.controlObjectGhostIndex,
      controlObjectData: this.controlObjectData,
      selfClientId: this.selfClientId,
      tournamentMode: this.tournamentMode,
      sawMissionDropReady: this.sawMissionDropReady,
    });
  }

  restore(saved: ReturnType<WatchStateAccumulator["save"]>): void {
    const { connection, dataBlockClassNames, ...fields } =
      structuredClone(saved);
    this.state.restore(connection);
    this.dataBlockClassNames.clear();
    for (const [id, name] of dataBlockClassNames)
      this.dataBlockClassNames.set(id, name);
    Object.assign(this, fields);
  }

  get netStrings(): Map<number, string> {
    return this.state.netStrings;
  }

  /**
   * GameConnection's own sensor group (SetSensorGroupEvent); 0 = observer.
   */
  get playerSensorGroup(): number {
    return this.state.playerSensorGroup;
  }

  set playerSensorGroup(sensorGroup: number) {
    this.state.playerSensorGroup = sensorGroup;
  }

  /**
   * The match is underway or seconds away (see ConnectionState).
   */
  get matchStarted(): boolean {
    return this.state.matchStarted;
  }

  set matchStarted(started: boolean) {
    this.state.matchStarted = started;
  }

  /**
   * Stream-authoritative server name (MsgMissionDropInfo, or Classic's
   * mod-info MsgLoadInfo), when known.
   */
  get serverName(): string | undefined {
    return this.state.serverDisplayName ?? undefined;
  }

  /**
   * Stream-authoritative mission type display name (MsgMissionDropInfo
   * or MsgLoadInfo), when known.
   */
  get missionType(): string | undefined {
    return this.state.missionTypeDisplayName ?? undefined;
  }

  /**
   * Clear mission-scoped display state on an in-place mission cycle.
   */
  beginMissionChange(): void {
    this.state.beginMissionChange();
    this.ghostingComplete = false;
    this.clearControlObject();
  }

  private clearControlObject(): void {
    this.controlObjectGhostIndex = -1;
    this.controlObjectData = undefined;
  }

  /** Mission-phase metadata is shared by live and delayed catch-up state. */
  applyMissionStart(funcName: string, args: string[]): boolean {
    if (
      funcName !== "MissionStartPhase1" &&
      funcName !== "MissionStartPhase3"
    ) {
      return false;
    }
    const name = args[1] && this.resolveNetString(args[1]);
    const sequence = args[0] && this.resolveNetString(args[0]);
    if (!name || !sequence) return false;
    if (name === this.missionName && sequence === this.missionSequence)
      return false;
    this.missionName = name;
    this.missionSequence = sequence;
    if (!this.state.matchEnded)
      this.displayedMission = this.currentMissionIdentity();
    if (funcName === "MissionStartPhase1") this.beginMissionChange();
    return true;
  }

  private currentMissionIdentity() {
    return this.missionName
      ? { name: this.missionName, sequence: this.missionSequence }
      : null;
  }

  resolveNetString(s: string): string {
    return this.state.resolveNetString(s);
  }

  /** Notify in wire order, before a later event can rename or drop the same client. */
  applyPacket(
    parsed: PacketData,
    onRosterChange?: () => void,
    onRemoteCommand?: (name: string, args: string[]) => void,
    sourceTime = this.now(),
  ): void {
    this.weatherTime = sourceTime;
    if (parsed.gameState.controlObjectGhostIndex !== undefined) {
      this.controlObjectGhostIndex = parsed.gameState.controlObjectGhostIndex;
    }
    if (parsed.gameState.controlObjectData !== undefined) {
      this.controlObjectData = parsed.gameState.controlObjectData;
    }

    for (const event of parsed.events) {
      const data = event.parsedData;
      if (!data || this.state.applyEvent(data)) continue;
      if (data.type === "GravityEvent") {
        if (typeof data.gravity === "number" && Number.isFinite(data.gravity)) {
          this.worldGravity = data.gravity;
        }
      } else if (data.type === "GhostingMessageEvent") {
        if (data.message === 0) {
          this.ghostingComplete = true; // GhostAlwaysDone
        } else if (data.message === 2) {
          this.ghostingComplete = false; // EndGhosting
          this.weatherGhosts.clear();
          // A snapshot between teardown and the next control update must not
          // seed the previous world's camera or replay inputs against its body.
          this.clearControlObject();
        }
      } else if (data.type === "GhostAlwaysObjectEvent") {
        const { ghostIndex, classId, objectData } =
          data as GhostAlwaysObjectEventData;
        if (classId != null && objectData)
          this.applyWeatherGhost({
            index: ghostIndex,
            type: "create",
            classId,
            parsedData: objectData,
          });
      } else if (data.type === "SimDataBlockEvent") {
        const objectId = data.objectId as number | undefined;
        const className = data.dataBlockClassName as string | undefined;
        if (objectId != null && className) {
          this.dataBlockClassNames.set(objectId, className);
        }
      } else if (data.type === "RemoteCommandEvent") {
        const funcName = this.resolveNetString((data.funcName as string) ?? "");
        const args = (data.args as string[]) ?? [];
        if (funcName === "MissionEnd") {
          this.state.endMatch();
        } else if (isServerMessageCommand(funcName) && args.length >= 1) {
          this.handleServerMessage(args, onRosterChange);
        } else if (funcName === "BottomPrint" && args.length >= 1) {
          if (
            /Server is Running in Tournament Mode/i.test(
              this.resolveNetString(args[0]),
            )
          ) {
            this.tournamentMode = true;
          }
        }
        onRemoteCommand?.(
          funcName,
          args.map((arg) => this.resolveNetString(arg)),
        );
      }
    }
    for (const ghost of parsed.ghosts) this.applyWeatherGhost(ghost);
  }

  private applyWeatherGhost({
    index,
    type,
    classId,
    parsedData,
  }: Pick<GhostUpdate, "index" | "type" | "classId" | "parsedData">): void {
    if (type !== "update") this.weatherGhosts.delete(index);
    if (!parsedData || type === "delete") return;
    const previous = this.weatherGhosts.get(index);
    if (
      previous?.kind === "precipitation" ||
      (type === "create" && classId === precipitationClassId)
    ) {
      this.weatherGhosts.set(index, {
        kind: "precipitation",
        state: resolvePrecipitationState(
          parsedData as PrecipitationGhostData,
          this.weatherTime,
          previous?.kind === "precipitation" ? previous.state : undefined,
        ),
      });
    } else if (
      previous?.kind === "sky" ||
      (type === "create" && classId === skyClassId)
    ) {
      const data = parsedData as SkyGhostData;
      this.weatherGhosts.set(index, {
        kind: "sky",
        state:
          previous?.kind === "sky"
            ? updateSkyFromGhost(previous.state, data, this.weatherTime)
            : skyFromGhost(index, data, this.weatherTime),
      });
    }
  }

  private handleServerMessage(
    args: string[],
    onRosterChange?: () => void,
  ): void {
    const effects = this.state.applyServerMessage(args);
    if (effects) {
      if (effects.joinedClientId != null) {
        this.identifySelf(effects.joinedClientId, args);
      }
      // Capture aliases / peak player counts per event, before a later
      // message in the same packet can rename or drop this client.
      if (effects.rosterMetadataChanged) onRosterChange?.();
      if (effects.serverName) this.state.serverDisplayName = effects.serverName;
      // First message of the mission-drop burst — the tournament banner,
      // if any, follows in the same burst.
      if (effects.missionDropReady) {
        this.sawMissionDropReady = true;
        this.displayedMission = this.currentMissionIdentity();
      }
      return;
    }

    const msgType = this.resolveNetString(args[0]);
    if (msgType === "MsgVoteItem" && args.length >= 4) {
      // Wire: args[2] echoes the query key (ordinary menus use numbers).
      // The offered mode switch identifies the current mode, regardless of key.
      const voteName = this.resolveNetString(args[3]);
      if (voteName === "VoteFFAMode") this.tournamentMode = true;
      else if (voteName === "VoteTournamentMode") this.tournamentMode = false;
    }
  }

  // ── Snapshot exports ──

  getWeatherStates(
    snapshotTime = this.weatherTime,
  ): Pick<WatchCatchupPayload, "precipitationStates" | "skyWeatherStates"> {
    const states: Pick<
      WatchCatchupPayload,
      "precipitationStates" | "skyWeatherStates"
    > = {};
    for (const [index, ghost] of this.weatherGhosts) {
      if (ghost.kind === "precipitation") {
        const state = resolvePrecipitationState({}, snapshotTime, ghost.state);
        if (state.storm)
          state.storm = {
            ...state.storm,
            startTime: state.storm.startTime - snapshotTime,
          };
        (states.precipitationStates ??= []).push([index, state]);
      } else if (ghost.state.weather) {
        (states.skyWeatherStates ??= []).push([
          index,
          shiftSkyWeather(ghost.state.weather, -snapshotTime),
        ]);
      }
    }
    return states;
  }

  getTaggedStrings(): Array<[number, string]> {
    return this.state.taggedStringEntries();
  }

  /** Read-only roster view: preserves client identity without copying per packet. */
  getPlayerRoster(): ReadonlyMap<number, Readonly<RosterEntry>> {
    return this.state.playerRoster;
  }

  /**
   * Fallback for old demos that omit the recorder ID and the handshake.
   * Only a recognized private greeting identifies self; an account GUID
   * can be shared by multiple connections and cannot identify our client.
   */
  private identifySelf(clientId: number, args: string[]): void {
    if (this.selfClientId != null) return;
    const message = stripTaggedStringMarkup(
      this.resolveNetString(args[1] ?? ""),
    ).trim();
    if (!/^(welcome\b|mission insertion complete\b)/i.test(message)) return;
    this.selfClientId = clientId;
  }

  /** Roster entries on a real team — observers (including the relay's
   *  own connection) stay at teamId 0 and don't count. */
  countActivePlayers(): number {
    let count = 0;
    for (const entry of this.state.playerRoster.values()) {
      if (entry.teamId > 0) count++;
    }
    return count;
  }

  getTargetEntries(): WatchTargetEntry[] {
    return this.state.targets.entries();
  }

  getSensorGroupColors(): SensorGroupColor[] {
    return this.state.sensorGroupColorEntries();
  }

  getHudState(): WatchHudStatePayload {
    return this.state.hudState();
  }
}
