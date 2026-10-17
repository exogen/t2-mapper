import { randomUUID } from "node:crypto";
import type { PacketData, ParsedData, SensorGroupColor } from "t2-demo-parser";
import { ConnectionState } from "./connectionState.js";
import { isServerMessageCommand } from "./serverMessageDecode.js";
import type { ServerMessageRosterEntry as RosterEntry } from "./serverMessageState.js";
import { stripTaggedStringMarkup } from "./shared.js";
import type { WatchHudStatePayload, WatchTargetEntry } from "./types.js";

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
  private readonly state = new ConnectionState({
    now: () => Date.now() / 1000,
    identityScope: randomUUID(),
  });
  /** Datablock class names from SimDataBlockEvents (for CRC + payload). */
  readonly dataBlockClassNames = new Map<number, string>();

  missionName: string | null = null;
  missionSequence: string | null = null;
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
   * authoritative answer is the vote-menu query the session sends on
   * connect (GetVoteMenu "TourneyQuery" — the same probe the community
   * "TournyMode Query Support" script uses): sendGameVoteMenu offers
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

  constructor(initialRoster?: ReadonlyMap<number, RosterEntry>) {
    if (initialRoster)
      for (const [id, entry] of initialRoster) {
        this.state.playerRoster.set(id, { ...entry });
        this.state.playerIdentity.generations?.set(
          id,
          entry.clientGeneration ?? 0,
        );
      }
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
    if (funcName === "MissionStartPhase1") this.beginMissionChange();
    return true;
  }

  resolveNetString(s: string): string {
    return this.state.resolveNetString(s);
  }

  /** Notify in wire order, before a later event can rename or drop the same client. */
  applyPacket(
    parsed: PacketData,
    onRosterChange?: () => void,
    onRemoteCommand?: (name: string, args: string[]) => void,
  ): void {
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
        }
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
      if (effects.missionDropReady) this.sawMissionDropReady = true;
      return;
    }

    const msgType = this.resolveNetString(args[0]);
    if (msgType === "MsgVoteItem" && args.length >= 4) {
      // Wire: args[2]=key (echo of our GetVoteMenu key), args[3]=voteName.
      if (this.resolveNetString(args[2]) === "TourneyQuery") {
        const voteName = this.resolveNetString(args[3]);
        if (voteName === "VoteFFAMode") this.tournamentMode = true;
        else if (voteName === "VoteTournamentMode") this.tournamentMode = false;
      }
    }
  }

  // ── Snapshot exports ──

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
