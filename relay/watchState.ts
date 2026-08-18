import type { PacketData, ParsedData, SensorGroupColor } from "t2-demo-parser";
import type { WatchHudStatePayload, WatchTargetEntry } from "./types.js";

/**
 * Connection-scope game state a late joiner can't recover from the live
 * stream: net strings, target-system tables, sensor colors, roster/
 * scores/clock, mission info, and the latest control object. Ghost
 * state lives separately in GhostStateAccumulator (t2-demo-parser).
 *
 * The roster/score/clock/mission handlers are ports of
 * StreamEngine.handleServerMessage (src/stream/StreamEngine.ts:2422) —
 * kept relay-local so relay/ keeps zero src/ imports. Field semantics
 * reference the StreamEngine source lines they mirror.
 */

interface RosterEntry {
  name: string;
  targetId?: number;
  teamId: number;
  score: number;
  ping: number;
  packetLoss: number;
}

interface TeamScoreEntry {
  teamId: number;
  name: string;
  score: number;
  flagStatus?: "home" | "field" | "held";
  flagCarrier?: string;
}

function stripTaggedStringMarkup(s: string): string {
  let stripped = "";
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 0x20) stripped += s[i];
  }
  return stripped;
}

export class WatchStateAccumulator {
  readonly netStrings = new Map<number, string>();
  /** nameTag → targetId awaiting its NetStringEvent (StreamEngine.ts:703). */
  private pendingNameTags = new Map<number, number>();
  private targetNames = new Map<number, string>();
  private targetSkins = new Map<number, string>();
  private targetSkinPrefs = new Map<number, string>();
  private targetTeams = new Map<number, number>();
  private targetRenderFlags = new Map<number, number>();
  /** group → targetGroup → color (SensorGroupColorEvent, StreamEngine.ts:753). */
  private sensorGroupColors = new Map<
    number,
    Map<number, { r: number; g: number; b: number }>
  >();
  playerSensorGroup = 0;
  /** Datablock class names from SimDataBlockEvents (for CRC + payload). */
  readonly dataBlockClassNames = new Map<number, string>();

  private playerRoster = new Map<number, RosterEntry>();
  private teamScores: TeamScoreEntry[] = [];
  private clock: { durationMs: number; receivedAt: number } | null = null;
  private missionDisplayName: string | undefined;
  private missionTypeDisplayName: string | undefined;
  private gameClassName: string | undefined;
  private serverDisplayName: string | undefined;

  missionName: string | null = null;
  controlObjectGhostIndex = -1;
  controlObjectData: ParsedData | undefined;

  /** Stream-authoritative server name (MsgMissionDropInfo), when known. */
  get serverName(): string | undefined {
    return this.serverDisplayName;
  }

  /**
   * Clear mission-scoped display state on an in-place mission cycle,
   * mirroring the browser's MissionStartPhase1 handling
   * (liveStreaming.ts) so late joiners see the same state as watchers
   * who rode through the change. Fresh values arrive via MsgClientReady
   * and MsgMissionDropInfo once the new mission loads.
   */
  beginMissionChange(): void {
    this.missionDisplayName = undefined;
    this.missionTypeDisplayName = undefined;
    this.gameClassName = undefined;
    this.serverDisplayName = undefined;
  }

  resolveNetString(s: string): string {
    if (s.length >= 2 && s.charCodeAt(0) === 1) {
      const id = parseInt(s.slice(1), 10);
      if (Number.isFinite(id)) return this.netStrings.get(id) ?? s;
    }
    return s;
  }

  applyPacket(parsed: PacketData): void {
    if (parsed.gameState.controlObjectGhostIndex !== undefined) {
      this.controlObjectGhostIndex = parsed.gameState.controlObjectGhostIndex;
    }
    if (parsed.gameState.controlObjectData !== undefined) {
      this.controlObjectData = parsed.gameState.controlObjectData;
    }

    for (const event of parsed.events) {
      const data = event.parsedData;
      if (!data) continue;
      switch (data.type) {
        case "NetStringEvent":
          this.handleNetString(data);
          break;
        case "TargetInfoEvent":
          this.handleTargetInfo(data);
          break;
        case "SetSensorGroupEvent":
          if (typeof data.sensorGroup === "number") {
            this.playerSensorGroup = data.sensorGroup;
          }
          break;
        case "SensorGroupColorEvent":
          this.handleSensorGroupColor(data);
          break;
        case "TargetFreeEvent":
          if (typeof data.targetId === "number") {
            this.targetNames.delete(data.targetId);
            this.targetSkins.delete(data.targetId);
            this.targetSkinPrefs.delete(data.targetId);
            this.targetTeams.delete(data.targetId);
            this.targetRenderFlags.delete(data.targetId);
          }
          break;
        case "SimDataBlockEvent": {
          const objectId = data.objectId as number | undefined;
          const className = data.dataBlockClassName as string | undefined;
          if (objectId != null && className) {
            this.dataBlockClassNames.set(objectId, className);
          }
          break;
        }
        case "RemoteCommandEvent": {
          const funcName = this.resolveNetString(
            (data.funcName as string) ?? "",
          );
          const args = (data.args as string[]) ?? [];
          if (funcName === "ServerMessage" && args.length >= 1) {
            this.handleServerMessage(args);
          }
          break;
        }
      }
    }
  }

  private handleNetString(data: ParsedData): void {
    const id = data.id as number | undefined;
    const value = data.value as string | undefined;
    if (id == null || typeof value !== "string") return;
    this.netStrings.set(id, value);
    const pendingTargetId = this.pendingNameTags.get(id);
    if (pendingTargetId != null) {
      this.pendingNameTags.delete(id);
      this.targetNames.set(
        pendingTargetId,
        stripTaggedStringMarkup(value).trim(),
      );
    }
  }

  /** Mirrors StreamEngine.processEvent TargetInfoEvent (StreamEngine.ts:691). */
  private handleTargetInfo(data: ParsedData): void {
    const targetId = data.targetId as number | undefined;
    if (targetId == null) return;
    const nameTag = data.nameTag as number | undefined;
    if (nameTag != null) {
      const resolved = this.netStrings.get(nameTag);
      if (resolved) {
        this.targetNames.set(
          targetId,
          stripTaggedStringMarkup(resolved).trim(),
        );
      } else {
        this.pendingNameTags.set(nameTag, targetId);
      }
    }
    const sensorGroup = data.sensorGroup as number | undefined;
    if (sensorGroup != null) this.targetTeams.set(targetId, sensorGroup);
    const renderFlags = data.renderFlags as number | undefined;
    if (renderFlags != null) this.targetRenderFlags.set(targetId, renderFlags);
    const skinTag = data.skinTag as number | undefined;
    if (skinTag != null && skinTag !== 0x400) {
      const resolved = this.netStrings.get(skinTag);
      if (resolved) this.targetSkins.set(targetId, resolved);
    }
    const skinPrefTag = data.skinPrefTag as number | undefined;
    if (skinPrefTag != null && skinPrefTag !== 0x400) {
      const resolved = this.netStrings.get(skinPrefTag);
      if (resolved) this.targetSkinPrefs.set(targetId, resolved);
    }
  }

  private handleSensorGroupColor(data: ParsedData): void {
    const sg = data.sensorGroup as number;
    const colors = data.colors as
      | Array<{
          index: number;
          default?: boolean;
          r?: number;
          g?: number;
          b?: number;
        }>
      | undefined;
    if (!colors) return;
    let map = this.sensorGroupColors.get(sg);
    if (!map) {
      map = new Map();
      this.sensorGroupColors.set(sg, map);
    }
    for (const c of colors) {
      if (c.default) {
        map.delete(c.index);
      } else {
        map.set(c.index, { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0 });
      }
    }
  }

  /** Port of StreamEngine.handleServerMessage (StreamEngine.ts:2422). */
  private handleServerMessage(args: string[]): void {
    const msgType = this.resolveNetString(args[0]);

    if (
      (msgType === "MsgTeamScoreIs" || msgType === "MsgTeamScore") &&
      args.length >= 4
    ) {
      const teamId = parseInt(this.resolveNetString(args[2]), 10);
      const newScore = parseInt(this.resolveNetString(args[3]), 10);
      if (!isNaN(teamId) && !isNaN(newScore)) {
        const entry = this.teamScores.find((t) => t.teamId === teamId);
        if (entry) entry.score = newScore;
      }
    } else if (msgType === "MsgCTFAddTeam" && args.length >= 6) {
      const teamId = parseInt(this.resolveNetString(args[2]), 10);
      const teamName = stripTaggedStringMarkup(this.resolveNetString(args[3]));
      const statusText = stripTaggedStringMarkup(
        this.resolveNetString(args[4]),
      );
      const flagStatus = statusText.startsWith("<At Base")
        ? ("home" as const)
        : statusText.startsWith("<In the Field")
          ? ("field" as const)
          : statusText
            ? ("held" as const)
            : ("home" as const);
      const score = parseInt(this.resolveNetString(args[5]), 10);
      const flagCarrier =
        flagStatus === "held" ? statusText.trim() || undefined : undefined;
      if (!isNaN(teamId) && teamId > 0) {
        const existing = this.teamScores.find((t) => t.teamId === teamId);
        if (existing) {
          existing.name = teamName;
          existing.score = isNaN(score) ? existing.score : score;
          existing.flagStatus = flagStatus;
          existing.flagCarrier = flagCarrier;
        } else {
          this.teamScores.push({
            teamId,
            name: teamName,
            score: isNaN(score) ? 0 : score,
            flagStatus,
            flagCarrier,
          });
        }
      }
    } else if (
      (msgType === "MsgCTFFlagTaken" ||
        msgType === "MsgCTFFlagDropped" ||
        msgType === "MsgCTFFlagReturned" ||
        msgType === "MsgCTFFlagCapped") &&
      args.length >= 5
    ) {
      const teamId = parseInt(this.resolveNetString(args[4]), 10);
      const entry = this.teamScores.find((t) => t.teamId === teamId);
      if (entry) {
        entry.flagStatus =
          msgType === "MsgCTFFlagTaken"
            ? "held"
            : msgType === "MsgCTFFlagDropped"
              ? "field"
              : "home";
        const actor = stripTaggedStringMarkup(
          this.resolveNetString(args[2]),
        ).trim();
        entry.flagCarrier =
          entry.flagStatus === "held" && actor ? actor : undefined;
      }
    } else if (msgType === "MsgClientJoin" && args.length >= 4) {
      const name = stripTaggedStringMarkup(
        this.resolveNetString(args[2]),
      ).trim();
      const clientId = parseInt(this.resolveNetString(args[3]), 10);
      const joinTargetId = parseInt(this.resolveNetString(args[4] ?? ""), 10);
      if (!isNaN(clientId)) {
        this.playerRoster.set(clientId, {
          name,
          targetId: isNaN(joinTargetId) ? undefined : joinTargetId,
          teamId: 0,
          score: 0,
          ping: 0,
          packetLoss: 0,
        });
      }
    } else if (msgType === "MsgClientDrop" && args.length >= 4) {
      const clientId = parseInt(this.resolveNetString(args[3]), 10);
      if (!isNaN(clientId)) this.playerRoster.delete(clientId);
    } else if (msgType === "MsgClientJoinTeam" && args.length >= 6) {
      const clientId = parseInt(this.resolveNetString(args[4]), 10);
      const teamId = parseInt(this.resolveNetString(args[5]), 10);
      if (!isNaN(clientId) && !isNaN(teamId)) {
        const existing = this.playerRoster.get(clientId);
        if (existing) {
          existing.teamId = teamId;
        } else {
          this.playerRoster.set(clientId, {
            name: "",
            teamId,
            score: 0,
            ping: 0,
            packetLoss: 0,
          });
        }
      }
    } else if (msgType === "MsgPlayerScore" && args.length >= 5) {
      const clientId = parseInt(this.resolveNetString(args[2]), 10);
      if (!isNaN(clientId)) {
        const existing = this.playerRoster.get(clientId);
        if (existing) {
          const score = parseInt(this.resolveNetString(args[3]), 10);
          const ping = parseInt(this.resolveNetString(args[4]), 10);
          const packetLoss = parseInt(this.resolveNetString(args[5] ?? ""), 10);
          if (!isNaN(score)) existing.score = score;
          if (!isNaN(ping)) existing.ping = ping;
          if (!isNaN(packetLoss)) existing.packetLoss = packetLoss;
        }
      }
    } else if (msgType === "MsgSystemClock" && args.length >= 4) {
      const timeRemainingMS = parseFloat(this.resolveNetString(args[3]));
      this.clock = {
        durationMs: Number.isFinite(timeRemainingMS) ? timeRemainingMS : 0,
        receivedAt: Date.now(),
      };
    } else if (msgType === "MsgMissionDropInfo" && args.length >= 5) {
      const missionDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[2]),
      );
      const missionTypeDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[3]),
      );
      const serverDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[4]),
      );
      this.missionDisplayName = missionDisplayName || this.missionDisplayName;
      this.missionTypeDisplayName =
        missionTypeDisplayName || this.missionTypeDisplayName;
      this.serverDisplayName = serverDisplayName || this.serverDisplayName;
    } else if (msgType === "MsgLoadInfo" && args.length >= 5) {
      const missionDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[3]),
      );
      const missionTypeDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[4]),
      );
      this.missionDisplayName = missionDisplayName || this.missionDisplayName;
      this.missionTypeDisplayName =
        missionTypeDisplayName || this.missionTypeDisplayName;
    } else if (msgType === "MsgClientReady" && args.length >= 3) {
      this.gameClassName = this.resolveNetString(args[2]) || this.gameClassName;
    }
  }

  // ── Snapshot exports ──

  getTaggedStrings(): Array<[number, string]> {
    return [...this.netStrings.entries()];
  }

  getTargetEntries(): WatchTargetEntry[] {
    const targetIds = new Set<number>([
      ...this.targetNames.keys(),
      ...this.targetTeams.keys(),
      ...this.targetRenderFlags.keys(),
      ...this.targetSkins.keys(),
      ...this.targetSkinPrefs.keys(),
    ]);
    return [...targetIds]
      .sort((a, b) => a - b)
      .map((targetId) => ({
        targetId,
        name: this.targetNames.get(targetId),
        skin: this.targetSkins.get(targetId),
        skinPref: this.targetSkinPrefs.get(targetId),
        sensorGroup: this.targetTeams.get(targetId),
        targetData: this.targetRenderFlags.get(targetId),
      }));
  }

  getSensorGroupColors(): SensorGroupColor[] {
    const flat: SensorGroupColor[] = [];
    for (const [group, map] of this.sensorGroupColors) {
      for (const [targetGroup, color] of map) {
        flat.push({ group, targetGroup, ...color, a: 255 });
      }
    }
    return flat;
  }

  getHudState(): WatchHudStatePayload {
    return {
      playerRoster: [...this.playerRoster.entries()].map(
        ([clientId, entry]) => ({ clientId, ...entry }),
      ),
      teamScores: this.teamScores.map((entry) => ({ ...entry })),
      clock: this.clock
        ? {
            durationMs: this.clock.durationMs,
            elapsedMs: Date.now() - this.clock.receivedAt,
          }
        : undefined,
      missionDisplayName: this.missionDisplayName,
      missionTypeDisplayName: this.missionTypeDisplayName,
      gameClassName: this.gameClassName,
      serverDisplayName: this.serverDisplayName,
    };
  }
}
