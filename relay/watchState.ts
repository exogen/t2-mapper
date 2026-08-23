import type { PacketData, ParsedData, SensorGroupColor } from "t2-demo-parser";
import { stripTaggedStringMarkup } from "./shared.js";
import {
  decodeTeamAdd,
  decodeFlagEvent,
  applyScoreHudToRoster,
  applyDebriefRowToRoster,
} from "./serverMessageDecode.js";
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
  /** Display name with markup stripped, for matching/keying. */
  name: string;
  /** Raw name preserving color-code control bytes, for colored display
   *  (the scoreboard). Stripped once at the display/sidecar boundary. */
  rawName: string;
  targetId?: number;
  teamId: number;
  score: number;
  ping: number;
  packetLoss: number;
  kills?: number;
}

interface TeamScoreEntry {
  teamId: number;
  name: string;
  score: number;
  flagStatus?: "home" | "field" | "held";
  flagCarrier?: string;
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
  /** The match is underway (or seconds away): set by MsgMissionStart
   *  (start/countdown — idle warmup sends neither), a running match
   *  clock, or a team with points on the board (untimed servers send no
   *  running clock). Never true while a server sits in pre-match warmup. */
  matchStarted = false;
  private missionDisplayName: string | undefined;
  private missionTypeDisplayName: string | undefined;
  private gameClassName: string | undefined;
  private matchEnded = false;
  private serverDisplayName: string | undefined;

  missionName: string | null = null;
  controlObjectGhostIndex = -1;
  controlObjectData: ParsedData | undefined;
  /**
   * Our own account GUID (from the T2csri certificate), set by the owner
   * when authenticated. The server reports it as each client's `sendGuid`.
   * It narrows self-identification to our account but does NOT pin a
   * single connection — the same account can have several clients
   * connected at once — so it's a filter, not the whole answer (see
   * identifySelf). null when connecting without credentials.
   */
  expectedSelfGuid: string | null = null;
  /**
   * Our own client id, learned from the welcome MsgClientJoin the server
   * sends only to us about us (see identifySelf). There is no dedicated
   * self-id message. null until identified.
   */
  selfClientId: number | null = null;
  /**
   * Tournament mode, as told by the server; null until determined. The
   * authoritative answer is the vote-menu query the session sends on
   * connect (GetVoteMenu "TourneyQuery" — the same probe the community
   * "TournyMode Query Support" script uses): sendGameVoteMenu offers
   * VoteFFAMode while in tournament mode and VoteTournamentMode
   * otherwise. The stock join banner ("Server is Running in Tournament
   * Mode" BottomPrint) corroborates the positive case.
   */
  tournamentMode: boolean | null = null;

  /** Stream-authoritative server name (MsgMissionDropInfo), when known. */
  get serverName(): string | undefined {
    return this.serverDisplayName;
  }

  /**
   * Stream-authoritative mission type display name (MsgMissionDropInfo
   * or MsgLoadInfo), when known.
   */
  get missionType(): string | undefined {
    return this.missionTypeDisplayName;
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
    this.matchStarted = false;
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
          } else if (funcName === "BottomPrint" && args.length >= 1) {
            if (
              /Server is Running in Tournament Mode/i.test(
                this.resolveNetString(args[0]),
              )
            ) {
              this.tournamentMode = true;
            }
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
        // Team objectives only score once the match is running.
        if (newScore > 0) this.matchStarted = true;
      }
    } else if (
      msgType === "MsgCTFAddTeam" ||
      msgType === "MsgCnHAddTeam" ||
      msgType === "MsgHuntAddTeam" ||
      msgType === "MsgSiegeAddTeam"
    ) {
      const d = decodeTeamAdd(msgType, args, (s) => this.resolveNetString(s));
      if (d) {
        // Only CTF's team score drives match-started (mirrors the browser).
        if (msgType === "MsgCTFAddTeam" && d.score != null && d.score > 0) {
          this.matchStarted = true;
        }
        if (!isNaN(d.teamId) && d.teamId > 0) {
          const existing = this.teamScores.find((t) => t.teamId === d.teamId);
          if (existing) {
            existing.name = d.name;
            if (d.score != null) existing.score = d.score;
            if (d.flag) {
              existing.flagStatus = d.flag.status;
              existing.flagCarrier = d.flag.carrier;
            }
          } else {
            this.teamScores.push({
              teamId: d.teamId,
              name: d.name,
              score: d.score ?? 0,
              ...(d.flag && {
                flagStatus: d.flag.status,
                flagCarrier: d.flag.carrier,
              }),
            });
          }
        }
      }
    } else if (
      msgType === "MsgCTFFlagTaken" ||
      msgType === "MsgCTFFlagDropped" ||
      msgType === "MsgCTFFlagReturned" ||
      msgType === "MsgCTFFlagCapped"
    ) {
      const d = decodeFlagEvent(msgType, args, (s) => this.resolveNetString(s));
      if (d) {
        const entry = this.teamScores.find((t) => t.teamId === d.teamId);
        if (entry) {
          entry.flagStatus = d.status;
          entry.flagCarrier = d.carrier;
        }
      }
    } else if (msgType === "MsgClientJoin" && args.length >= 4) {
      const rawName = this.resolveNetString(args[2]);
      const name = stripTaggedStringMarkup(rawName).trim();
      const clientId = parseInt(this.resolveNetString(args[3]), 10);
      const joinTargetId = parseInt(this.resolveNetString(args[4] ?? ""), 10);
      if (!isNaN(clientId)) {
        this.identifySelf(clientId, args);
      }
      if (!isNaN(clientId)) {
        this.playerRoster.set(clientId, {
          name,
          rawName,
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
            rawName: "",
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
          // The live score HUD (SetLineHud) is authoritative on servers
          // (TacoServer) whose MsgPlayerScore reports 0; don't let a 0
          // here clobber a real score already applied from that HUD.
          if (!isNaN(score) && (score !== 0 || existing.score === 0)) {
            existing.score = score;
          }
          if (!isNaN(ping)) existing.ping = ping;
          if (!isNaN(packetLoss)) existing.packetLoss = packetLoss;
        }
      }
    } else if (msgType === "MsgVoteItem" && args.length >= 4) {
      // Wire: args[2]=key (echo of our GetVoteMenu key), args[3]=voteName.
      if (this.resolveNetString(args[2]) === "TourneyQuery") {
        const voteName = this.resolveNetString(args[3]);
        if (voteName === "VoteFFAMode") this.tournamentMode = true;
        else if (voteName === "VoteTournamentMode") this.tournamentMode = false;
      }
    } else if (msgType === "MsgSystemClock" && args.length >= 4) {
      const timeRemainingMS = parseFloat(this.resolveNetString(args[3]));
      this.clock = {
        durationMs: Number.isFinite(timeRemainingMS) ? timeRemainingMS : 0,
        receivedAt: Date.now(),
      };
      // A running match clock (late-join case): warmup joiners get 0,0
      // and pre-start countdown ticks stay under ~30s.
      if (Number.isFinite(timeRemainingMS) && timeRemainingMS > 60_000) {
        this.matchStarted = true;
      }
    } else if (msgType === "MsgMissionStart") {
      // Sent by DefaultGame::startMatch ("Match started!") and by the
      // pre-start countdown ticks — never during idle warmup. Either
      // way the match is underway or seconds from it.
      this.matchStarted = true;
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
      this.matchEnded = false;
      // Mission-scoped (mirrors the browser): a same-map restart skips
      // beginMissionChange, so clear here too.
      this.matchStarted = false;
    } else if (msgType === "SetLineHud" && args.length >= 7) {
      applyScoreHudToRoster(
        args,
        (s) => this.resolveNetString(s),
        this.playerRoster,
      );
    } else if (msgType === "MsgDebriefAddLine" && args.length >= 5) {
      applyDebriefRowToRoster(
        args,
        (s) => this.resolveNetString(s),
        this.playerRoster,
      );
    } else if (
      msgType === "MsgClearDebrief" ||
      msgType === "MsgDebriefResult"
    ) {
      // gameOver debrief burst — the match-over interval (until the next
      // MsgClientReady), so late joiners auto-open the score screen too.
      this.matchEnded = true;
    }
  }

  // ── Snapshot exports ──

  getTaggedStrings(): Array<[number, string]> {
    return [...this.netStrings.entries()];
  }

  /**
   * All roster names, observers included (JoinTeam-before-Join stubs
   * have an empty name until MsgClientJoin backfills — skipped).
   */
  getRosterNames(): string[] {
    const names: string[] = [];
    for (const entry of this.playerRoster.values()) {
      // Raw (unstripped) — the recorder's sanitizePlayerName is the single
      // canonical strip, so names are never processed twice.
      if (entry.name) names.push(entry.rawName);
    }
    return names;
  }

  /**
   * Identify our own client from a MsgClientJoin. Our connection uniquely
   * receives one non-empty "welcome" join about us (arg 1, the greeting);
   * every other client — including ones on our SAME account (a GUID is an
   * account, not a connection: multiple MapGenius observers can share it)
   * — reaches us either as a silent roster-sync join (empty message) or,
   * if they connect later, after we're already identified. So we take the
   * first non-empty-message join, once.
   *
   * When authenticated we additionally require the join's `sendGuid` (arg
   * 9) to be ours, which rejects other accounts outright. The only
   * residual ambiguity is a same-account client joining within our own
   * connect burst — itself a MapGenius observer, so tracking it instead is
   * harmless (it should be an observer too).
   */
  private identifySelf(clientId: number, args: string[]): void {
    if (this.selfClientId != null) return;
    if (this.resolveNetString(args[1] ?? "") === "") return;
    if (this.expectedSelfGuid) {
      const guid = this.resolveNetString(args[9] ?? "").trim();
      if (guid !== this.expectedSelfGuid) return;
    }
    this.selfClientId = clientId;
  }

  /**
   * Our own team, or null if unknown (self not yet identified, or no
   * roster entry for it). 0 means observer; > 0 means we've been placed
   * on a real team — which, as a watch observer, we never want to be.
   */
  getSelfTeamId(): number | null {
    if (this.selfClientId == null) return null;
    const self = this.playerRoster.get(this.selfClientId);
    return self ? self.teamId : null;
  }

  /** Roster entries on a real team — observers (including the relay's
   *  own connection) stay at teamId 0 and don't count. */
  countActivePlayers(): number {
    let count = 0;
    for (const entry of this.playerRoster.values()) {
      if (entry.teamId > 0) count++;
    }
    return count;
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
      matchEnded: this.matchEnded,
      matchStarted: this.matchStarted,
    };
  }
}
