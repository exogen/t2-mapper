import {
  createLiveParser,
  passiveObserverProtocolState,
  type PacketData,
  type PacketParser,
} from "t2-demo-parser";
import type {
  ParsedData,
  ParseFault,
  RemoteCommandEventData,
  CRCChallengeEventData,
  GhostingMessageEventData,
} from "t2-demo-parser";
import { createLogger } from "../logger";
import { shiftSkyWeather } from "../scene/skyWeather";
import { randomId } from "../randomId";
import {
  resolveShapeName,
  stripTaggedStringMarkup,
  collectPreloadShapeNames,
  collectShapeConstructorSequences,
  STREAM_TICK_SEC,
  streamTimeToTick,
} from "./streamHelpers";
import type { PlayerMove } from "./playerPrediction";
import type { Vec3 } from "./streamHelpers";
import type { StreamSnapshot } from "./types";
import { StreamEngine } from "./StreamEngine";
import { GhostMessage } from "./entityClassification";
import type { RelayClient } from "./relayClient";
import type { WatchCatchupPayload } from "../../relay/types";
import {
  AUTH_COMMANDS,
  buildCRCDataBlockList,
  GAME_PROTOCOL_VERSION,
} from "../../relay/shared";

const log = createLogger("liveStreaming");

/**
 * Adapts live game packets from a relay connection into the
 * StreamingPlayback interface used by the existing rendering pipeline.
 */
export class LiveStreamAdapter extends StreamEngine {
  private packetParser: PacketParser;
  relay: RelayClient;

  private packetCount = 0;
  private _serverUpdateId = 0;

  private connectSynced = false;
  private _snapshot: StreamSnapshot | null = null;
  private _snapshotTick = -1;
  private _ready = false;

  /** Class names for datablocks, tracked from SimDataBlockEvents. */
  private dataBlockClassNames = new Map<number, string>();

  /** Called once when the first ghost entity is created. */
  onReady?: () => void;
  /** Called when the server starts a new mission (map cycle). */
  onMissionChange?: (missionName: string) => void;
  /** Displayed mission identity; defer the next one until its debrief ends. */
  onMissionIdentity?: (sequence: string, missionName: string) => void;
  /**
   * The parser could not fully read a packet, so its ghost tracker and
   * event sequence no longer mirror the server (the engine drops the
   * connection here). Every later packet would be misread: the owner
   * must rebuild this adapter from a fresh catch-up or connection.
   */
  onParseFault?: (fault: ParseFault) => void;
  /** Current mission name as reported by the server. */
  missionName: string | null = null;
  missionSequence: string | null = null;

  /** Server's latest move acknowledgment (which moveIndex it has processed). */
  lastMoveAck = 0;

  /**
   * "play" (default): this client drives the connection protocol
   * (auth, mission phases, CRC, ghost acks) through the relay.
   * "watch": passive spectator on a shared relay session — the relay
   * owns all protocol responses, and parser state arrives via
   * `hydrate()` instead of being built from the stream start.
   */
  readonly mode: "play" | "watch";
  private hydratedEpoch: number | null = null;

  constructor(relay: RelayClient, options?: { mode?: "play" | "watch" }) {
    super();
    this.conn.playerIdentity.scope = randomId();
    this.setPlayerPredictionEnabled(true);
    this.relay = relay;
    this.mode = options?.mode ?? "play";
    const { registry, ghostTracker, packetParser } = createLiveParser({
      protocolVersion: GAME_PROTOCOL_VERSION,
    });
    this.packetParser = packetParser;
    this.ghostTracker = ghostTracker;
    this.registry = registry;
  }

  // ── Relay send gate ──
  // Every adapter→relay send goes through here so watch mode can never
  // fight the relay session over protocol responses. Add new sends via
  // this object, not by calling this.relay directly.
  private sendToRelay = {
    command: (command: string, args: string[]): void => {
      if (this.mode === "watch") return;
      this.relay.sendCommand(command, args);
    },
    authEvent: (command: string, args: string[]): void => {
      if (this.mode === "watch") return;
      this.relay.sendAuthEvent(command, args);
    },
    crcCompute: (
      seed: number,
      field2: number,
      datablocks: { objectId: number; className: string; shapeName: string }[],
      includeTextures: boolean,
    ): void => {
      if (this.mode === "watch") return;
      this.relay.sendCRCCompute(seed, field2, datablocks, includeTextures);
    },
    ghostAck: (sequence: number, ghostCount: number): void => {
      if (this.mode === "watch") return;
      this.relay.sendGhostAck(sequence, ghostCount);
    },
  };

  // ── StreamEngine abstract implementations ──

  getDataBlockData(id: number): ParsedData | undefined {
    return this.packetParser.getDataBlockDataMap()?.get(id);
  }

  protected getDataBlockDataMap(): ReadonlyMap<number, ParsedData> | undefined {
    return this.packetParser.getDataBlockDataMap();
  }

  /** Rebuilt when datablocks arrive or a catch-up replaces the map. */
  private _shapeSequences: {
    dataBlocks: ReadonlyMap<number, ParsedData>;
    size: number;
    byShape: Map<string, string[]>;
  } | null = null;

  getShapeConstructorSequences(shapeName: string): string[] | undefined {
    const dataBlocks = this.packetParser.getDataBlockDataMap();
    if (!dataBlocks) return undefined;
    let cache = this._shapeSequences;
    if (
      !cache ||
      cache.dataBlocks !== dataBlocks ||
      cache.size !== dataBlocks.size
    ) {
      cache = this._shapeSequences = {
        dataBlocks,
        size: dataBlocks.size,
        byShape: collectShapeConstructorSequences(dataBlocks.values()),
      };
    }
    return cache.byShape.get(shapeName.toLowerCase());
  }

  protected getTimeSec(): number {
    return this.tickCount * STREAM_TICK_SEC;
  }

  protected getCameraYawPitch(data: ParsedData | undefined): {
    yaw: number;
    pitch: number;
  } {
    const absRot = this.getAbsoluteRotation(data);
    return absRot ?? { yaw: 0, pitch: 0 };
  }

  protected getPreloadShapeNames(): string[] {
    return collectPreloadShapeNames(
      [...this.dataBlockClassNames].map(([id, className]) => ({
        className,
        data: this.getDataBlockData(id),
      })),
    );
  }

  /** Changes only when server state arrives, not when client simulation advances. */
  get serverUpdateId(): number {
    return this._serverUpdateId;
  }

  // ── StreamingPlayback interface ──

  reset(): void {
    this.resetSharedState();
    this.ghostTracker.clear?.();
    this.packetCount = 0;
    this._serverUpdateId++;
    this.lastMoveAck = 0;
    this._snapshot = null;
    this._shapeSequences = null;
    this.dataBlockClassNames.clear();
    this.observerMode = "fly";
    this.missionName = null;
    this.missionSequence = null;
  }

  getSnapshot(): StreamSnapshot {
    if (this._snapshot && this._snapshotTick === this.tickCount) {
      return this._snapshot;
    }
    // Default observer camera if none exists
    this.camera ??= {
      time: this.getTimeSec(),
      position: [0, 0, 200],
      rotation: [0, 0, 0, 1],
      fov: 90,
      mode: "observer",
    };
    this._snapshot = this.buildSnapshot(false);
    this._snapshotTick = this.tickCount;
    return this._snapshot;
  }

  stepToTime(
    targetTimeSec: number,
    maxMoveTicks = Number.POSITIVE_INFINITY,
  ): StreamSnapshot {
    const targetTick = Number.isFinite(targetTimeSec)
      ? streamTimeToTick(Math.max(0, targetTimeSec))
      : this.tickCount;
    for (
      let ticks = 0;
      this.tickCount < targetTick && ticks < maxMoveTicks;
      ticks++
    )
      this.processTick();
    return this.getSnapshot();
  }

  /** Watchers' local camera input must not drive the relay's control object. */
  submitMove(move: PlayerMove, id: number): void {
    if (this.mode !== "play") return;
    this.collectMove(move, id);
  }

  // ── Live-specific: connect sequence sync ──

  private syncConnectSequence(data: Uint8Array): void {
    if (this.connectSynced || data.length < 1) return;
    this.connectSynced = true;
    // The browser parser is a passive observer — it never sends packets
    // (the relay handles all outgoing UDP traffic).
    this.packetParser.setConnectionProtocolState(
      passiveObserverProtocolState(data[0]),
    );
  }

  // ── Live-specific: feed raw packet ──

  feedPacket(data: Uint8Array): void {
    if (this.mode === "watch") {
      // Watch mode has no valid parser state until the relay's catch-up
      // payload arrives; the seeded connectionState replaces the
      // syncConnectSequence bootstrap entirely.
      if (this.hydratedEpoch === null) return;
    } else {
      this.syncConnectSequence(data);
    }
    this.processPacket(data);
  }

  // ── Watch-specific: hydrate from a relay catch-up payload ──

  /**
   * Rebuild parser + engine state from a WatchCatchupPayload, mirroring
   * how demo playback seeds from a mid-match recording's
   * InitialBlockData (DemoStreamAdapter.reset in demoStreaming.ts).
   * Safe to call again on a new epoch (session reconnect): everything
   * is replaced.
   */
  hydrate(payload: WatchCatchupPayload): void {
    // Fresh engine state (clears entities, HUD, net strings, targets).
    this.reset();
    this.seedHydration(payload);
    if (
      typeof payload.worldGravity === "number" &&
      Number.isFinite(payload.worldGravity)
    ) {
      this.worldGravity = payload.worldGravity;
      this.debrisHistory.setGravity(this.getTimeSec(), this.gravity);
    }
    if (payload.ghostingComplete) this.ghostAlwaysDoneSec = this.getTimeSec();
    // Fresh ready latch too: EVERY catch-up — the initial attach and
    // every reconnect re-hydration — is preceded by liveReady=false in
    // liveConnectionStore (onCatchup), and only the onReady edge sets
    // it back. Keeping the old latch across a reconnect meant onReady
    // never re-fired, leaving the loading spinner stuck over a
    // perfectly live stream.
    this._ready = false;

    // Seeded parser stack — continues the raw stream in lockstep with
    // the relay's parser from the packet boundary the payload captured.
    const { registry, ghostTracker, packetParser } = createLiveParser({
      protocolVersion:
        payload.protocolVersion === undefined
          ? GAME_PROTOCOL_VERSION
          : payload.protocolVersion,
      dataBlocks: payload.dataBlocks.map(([id, block]) => [id, block.data]),
      ghosts: payload.initialGhosts
        .filter((g) => g.classId != null)
        .map((g) => ({ index: g.index, classId: g.classId! })),
      connectionProtocolState: payload.connectionState,
      nextRecvEventSeq: payload.nextRecvEventSeq,
      compressionPoint: payload.compressionPoint,
      pendingGuaranteedEvents: payload.pendingGuaranteedEvents,
    });
    this.packetParser = packetParser;
    this.ghostTracker = ghostTracker;
    this.registry = registry;
    this.connectSynced = true;

    // Connection tables, seeded as demo reset does (demoStreaming.ts),
    // before the ghosts they name and color.
    this.conn.seedTables({
      ...payload,
      targetGenerations: payload.hudState.targetGenerations,
    });
    this.conn.playerSensorGroup = payload.playerSensorGroup;
    for (const [id, block] of payload.dataBlocks) {
      if (block.className) this.dataBlockClassNames.set(id, block.className);
    }
    this.missionName = payload.missionName;
    this.missionSequence = payload.missionSequence ?? null;

    // Ghosts flow through the normal create path: applyGhostData with
    // full merged parsedData, sceneData captured via ghostToSceneObject.
    const precipitation =
      payload.precipitationStates && new Map(payload.precipitationStates);
    const skyWeather =
      payload.skyWeatherStates && new Map(payload.skyWeatherStates);
    const now = this.getTimeSec();
    for (const ghost of payload.initialGhosts) {
      const rain = precipitation?.get(ghost.index);
      const sky = skyWeather?.get(ghost.index);
      this.processGhostUpdate(
        ghost,
        rain || sky
          ? {
              precipitation: rain && {
                ...rain,
                storm: rain.storm && {
                  ...rain.storm,
                  startTime: now + rain.storm.startTime,
                },
              },
              skyWeather: sky && shiftSkyWeather(sky, now),
            }
          : undefined,
      );
    }

    // Control object: the relay's server-side observer camera. The relay
    // only sends neutral moves, so this is exactly where the server placed
    // its observer (per-map drop point) — the initial view a real client
    // gets.
    // Build the camera immediately so the first snapshot carries it
    // (otherwise it only materializes on the first live packet).
    this.processControlObject({
      controlObjectGhostIndex: payload.controlObjectGhostIndex,
      controlObjectData: payload.controlObjectData,
      compressionPoint: payload.compressionPoint,
    });
    this.updateCameraAndHud();

    this._serverUpdateId++;

    // Roster/scores/clock (a late joiner can't recover these live).
    const hud = payload.hudState;
    this.conn.hydrateHud(hud);
    this.onRosterChanged();
    this.onTeamScoresChanged();
    if (hud.matchEnded) this.endMatch();
    // Mission change before the info push: its handler resets per-mission
    // info in the stores, which onMissionInfoChange then refills (a
    // mid-mission catch-up never re-sends it).
    this.hydratedEpoch = payload.epoch;
    if (payload.missionName) {
      this.onMissionChange?.(payload.missionName);
    }
    const displayedMission =
      payload.displayedMission === undefined
        ? payload.missionName && {
            name: payload.missionName,
            sequence: this.missionSequence,
          }
        : payload.displayedMission;
    if (displayedMission)
      this.onMissionIdentity?.(
        displayedMission.sequence ?? displayedMission.name,
        displayedMission.name,
      );
    if (!hud.missionDisplayName) {
      // Should repopulate via MsgMissionDropInfo shortly (e.g. attach
      // landed mid mission-change); logged to trace occurrences where
      // it never arrives and the header falls back to the raw name.
      log.warn(
        "catch-up hud has no mission display name (mission=%s, epoch=%d)",
        payload.missionName ?? "?",
        payload.epoch,
      );
    }
    this.onMissionInfoChange?.();
    log.info(
      "hydrated epoch %d: %d entities, %d datablocks, %d net strings",
      payload.epoch,
      this.entities.size,
      payload.dataBlocks.length,
      payload.taggedStrings.length,
    );
    if (this.entities.size > 0 && !this._ready) {
      this._ready = true;
      this.onReady?.();
    }
  }

  /** Replay sources can seed an absolute clock and recorded input cursor. */
  protected seedHydration(_payload: WatchCatchupPayload): void {}

  /** A source-specific cursor may observe control corrections without parsing twice. */
  protected onPacketApplied(_packet: PacketData): void {}

  protected override handleServerMessage(args: string[]): void {
    const wasEnded = this.matchEnded;
    super.handleServerMessage(args);
    // Loading the next mission can begin while the previous score screen is
    // still visible. MsgClientReady is the boundary that ends that debrief.
    if (wasEnded && !this.matchEnded) this.publishMissionIdentity();
  }

  private publishMissionIdentity(): void {
    if (this.missionName && this.missionSequence && !this.matchEnded)
      this.onMissionIdentity?.(this.missionSequence, this.missionName);
  }

  protected invalidateSnapshot(): void {
    this._snapshot = null;
    this._serverUpdateId++;
  }

  // ── Live-specific: auth event detection ──

  /**
   * Handle RemoteCommandEvents that require relay-side responses:
   * auth events, mission phase acknowledgments, etc.
   */
  private handleRelayCommands(parsedData: RemoteCommandEventData): void {
    const rawFuncName = parsedData.funcName;
    if (!rawFuncName) return;
    const funcName = this.resolveNetString(rawFuncName);

    // T2csri auth events → forward to relay for crypto processing.
    if (AUTH_COMMANDS.includes(funcName)) {
      const rawArgs = parsedData.args ?? [];
      const args = rawArgs
        .map((a) => this.resolveNetString(a))
        .filter((a) => a !== "");
      log.info("auth event: %s %o", funcName, args);
      this.sendToRelay.authEvent(funcName, args);
      return;
    }

    // Mission download phase acknowledgments — the server won't proceed
    // to ghosting until the client responds to each phase.
    const rawArgs = parsedData.args ?? [];
    const resolvedArgs = rawArgs.map((a) => this.resolveNetString(a));
    if (funcName === "MissionStartPhase1") {
      const seq = resolvedArgs[0] ?? "";
      const newMissionName = resolvedArgs[1] ?? null;
      log.info(
        "mission phase 1, seq=%s mission=%s resolvedArgs=%o",
        seq,
        newMissionName,
        resolvedArgs,
      );
      // Phase 1 signals a new mission load — clear all ghosts (the server
      // called resetGhosting before sending this) and update mission name.
      if (
        newMissionName &&
        (newMissionName !== this.missionName || seq !== this.missionSequence)
      ) {
        this.missionName = newMissionName;
        this.missionSequence = seq || null;
        this.conn.beginMissionChange();
        this.clearAllEntities();
        this._ready = false;
        this._snapshot = null;
        this.invalidateHudCache();
        this.observerMode = "fly";
        this.lastMoveAck = 0;
        this.pendingPlayerMoves = [];
        this.nextPlayerMoveId = 0;
        this.lastClientMoveId = 0;
        // Drop the old mission's camera AND control-object state so
        // consumers (e.g. spectator initial placement) wait for the new
        // mission's control data instead of a stale position —
        // updateCameraAndHud rebuilds the camera from latestControl on
        // every packet, so clearing the camera alone isn't enough. The
        // server re-scopes its observer camera during the new mission's
        // phases and fresh control data follows.
        this.camera = null;
        this.latestControl = { ghostIndex: -1 };
        this.controlPlayerGhostId = undefined;
        this.lastControlType = "camera";
        this.isPiloting = false;
        this.onMissionChange?.(newMissionName);
      }
      this.publishMissionIdentity();
      this.sendToRelay.command("MissionStartPhase1Done", [seq]);
    } else if (funcName === "MissionStartPhase2") {
      const seq = resolvedArgs[0] ?? "";
      log.info("mission phase 2 (datablocks), seq=%s", seq);
      this.sendToRelay.command("MissionStartPhase2Done", [seq]);
    } else if (funcName === "MissionStartPhase3") {
      const seq = resolvedArgs[0] ?? "";
      const currentMission = resolvedArgs[1] ?? null;
      log.info(
        "mission phase 3 (ghosting), seq=%s mission=%s",
        seq,
        currentMission,
      );
      // Phase 3 sends $CurrentMission — update if different from phase 1.
      if (currentMission) {
        this.missionName = currentMission;
        this.missionSequence = seq || null;
        this.publishMissionIdentity();
      }
      // Send an empty favorites list then acknowledge phase 3.
      this.sendToRelay.command("setClientFav", [""]);
      this.sendToRelay.command("MissionStartPhase3Done", [seq]);
    }
  }

  /** Respond to CRCChallengeEvent — required for Phase 2 to begin. */
  private handleCRCChallenge(parsedData: CRCChallengeEventData): void {
    const seed = parsedData.crcValue;
    const field1 = parsedData.field1;
    const field2 = parsedData.field2;
    // field1 bit 0 = includeTextures (from $Host::CRCTextures)
    const includeTextures = (field1 & 1) !== 0;
    log.info(
      "CRC challenge: seed=0x%s f1=0x%s f2=0x%s includeTextures=%s",
      (seed >>> 0).toString(16),
      (field1 >>> 0).toString(16),
      (field2 >>> 0).toString(16),
      includeTextures,
    );

    // Collect datablocks for relay-side CRC computation over game files.
    const datablocks = buildCRCDataBlockList(
      this.packetParser.getDataBlockDataMap(),
      this.dataBlockClassNames,
    );
    log.info("CRC: sending %d datablocks for computation", datablocks.length);
    this.sendToRelay.crcCompute(seed, field2, datablocks, includeTextures);
  }

  /**
   * Respond to GhostingMessageEvent type 0 (GhostAlwaysDone).
   * The server sends this after activateGhosting(); the client must respond
   * with type 1 so the server sets mGhosting=true and begins sending ghosts.
   */
  private handleGhostingMessage(parsedData: GhostingMessageEventData): void {
    const message = parsedData.message;
    const sequence = parsedData.sequence;
    const ghostCount = parsedData.ghostCount;
    log.info(
      "GhostingMessageEvent: message=%d sequence=%d ghostCount=%d",
      message,
      sequence,
      ghostCount,
    );
    if (message === GhostMessage.GhostAlwaysDone) {
      log.info("Sending ghost ack for sequence %d", sequence);
      this.sendToRelay.ghostAck(sequence, ghostCount);
    }
  }

  /**
   * Observer camera mode, kept in sync with the server's camera state.
   * In "fly" mode, trigger 0 (fire) would make the server assign a team —
   * so we must NEVER send fire in fly mode.
   */
  observerMode: "fly" | "follow" = "fly";

  /**
   * True once real control-object state has arrived (index + data) —
   * as opposed to a camera synthesized from the compressionPoint
   * fallback, whose position can be stale across a mission change and
   * whose yaw/pitch default to 0. Spectator initial placement waits
   * for this so it snaps to the server's actual observer position.
   */
  hasControlObject(): boolean {
    return (
      this.latestControl.ghostIndex >= 0 && this.latestControl.data != null
    );
  }

  // ── Packet processing ──

  private processPacket(data: Uint8Array): void {
    this.packetCount++;
    try {
      const rejectedBefore = this.packetParser.protocolRejected;
      const noDispatchBefore = this.packetParser.protocolNoDispatch;
      const parsed = this.packetParser.parsePacket(data);
      const wasRejected = this.packetParser.protocolRejected > rejectedBefore;
      const wasNoDispatch =
        this.packetParser.protocolNoDispatch > noDispatchBefore;

      // Ping/ack keepalives (packetType 1/2) carry no game payload and
      // take the no-dispatch path by design — only warn when a DATA
      // packet (packetType 0) is rejected or suppressed (duplicate seq).
      if (
        wasRejected ||
        (wasNoDispatch && parsed.dnetHeader.packetType === 0)
      ) {
        log.warn(
          "packet #%d %s: %d bytes (total rejected=%d, noDispatch=%d)",
          this.packetCount,
          wasRejected ? "REJECTED" : "duplicate-seq",
          data.length,
          this.packetParser.protocolRejected,
          this.packetParser.protocolNoDispatch,
        );
      }

      if (wasRejected || wasNoDispatch) return;

      const isEarlyPacket = this.packetCount < 20;
      const isMilestonePacket = this.packetCount % 100 === 0;
      const shouldLog = isEarlyPacket || isMilestonePacket;

      if (shouldLog) {
        log.debug(
          "packet #%d: %d events, %d ghosts, %d bytes%s%s",
          this.packetCount,
          parsed.events.length,
          parsed.ghosts.length,
          data.length,
          parsed.gameState.controlObjectGhostIndex !== undefined
            ? `, control=${parsed.gameState.controlObjectGhostIndex}`
            : "",
          parsed.gameState.cameraFov !== undefined
            ? `, fov=${parsed.gameState.cameraFov}`
            : "",
        );
      }

      if (parsed.parseFault) {
        // Nothing past the fault is trustworthy, and neither is any
        // packet after it: hand the adapter back for a rebuild.
        log.error(
          "packet #%d %s parse fault: %s",
          this.packetCount,
          parsed.parseFault.stage,
          parsed.parseFault.message,
        );
        this.onParseFault?.(parsed.parseFault);
        return;
      }

      // Track move acknowledgments for client-side prediction replay.
      this.lastMoveAck = parsed.gameState.lastMoveAck;

      // Control object state
      this.processControlObject(parsed.gameState);
      this.onPacketApplied(parsed);

      // Events and ghosts are applied one at a time: a handler that
      // throws on one (an unsupported class, a bad datablock reference)
      // must not drop the rest of the packet, which the parser has
      // already registered in its tracker.
      for (const event of parsed.events) {
        try {
          this.processParsedEvent(event, isEarlyPacket, shouldLog);
        } catch (e) {
          log.error("event %d handler failed: %o", event.classId, e);
        }
      }

      for (const ghost of parsed.ghosts) {
        try {
          this.processParsedGhost(ghost);
        } catch (e) {
          log.error(
            "ghost #%d %s handler failed: %o",
            ghost.index,
            ghost.type,
            e,
          );
        }
      }

      this.acknowledgeMoves(
        this.lastMoveAck,
        parsed.gameState.controlObjectData,
      );
      this._snapshot = null;
      this._serverUpdateId++;

      // Periodic status at milestones
      if (isMilestonePacket && this.packetCount > 1) {
        const dbMap = this.packetParser.getDataBlockDataMap();
        log.info(
          "status @ packet %d: %d entities, %d datablocks, rejected=%d, noDispatch=%d",
          this.packetCount,
          this.entities.size,
          dbMap?.size ?? 0,
          this.packetParser.protocolRejected,
          this.packetParser.protocolNoDispatch,
        );
      }

      // Entity count milestones
      const entityCount = this.entities.size;
      if (
        this.packetCount === 1 ||
        (entityCount > 0 && entityCount % 25 === 0 && this.packetCount < 100)
      ) {
        const types = new Map<string, number>();
        for (const e of this.entities.values()) {
          types.set(e.type, (types.get(e.type) ?? 0) + 1);
        }
        const summary = [...types.entries()]
          .map(([t, c]) => `${t}=${c}`)
          .join(" ");
        log.info("entity count: %d (%s)", entityCount, summary);
      }

      const prevMode = this.camera?.mode;
      this.updateCameraAndHud();

      // Log camera mode transitions (always, not just early packets).
      if (this.camera && this.camera.mode !== prevMode) {
        log.info(
          "camera mode: %s → %s%s",
          prevMode ?? "none",
          this.camera.mode,
          this.camera.mode === "third-person"
            ? ` orbit=${this.camera.orbitTargetId ?? "?"} dist=${this.camera.orbitDistance ?? "?"}`
            : "",
        );
      }
      // Log camera position for early packets
      if (this.packetCount <= 5 && this.camera) {
        const [cx, cy, cz] = this.camera.position;
        log.debug(
          "camera: mode=%s pos=(%s, %s, %s) fov=%s",
          this.camera.mode,
          cx.toFixed(1),
          cy.toFixed(1),
          cz.toFixed(1),
          this.camera.fov,
        );
      }
    } catch (e) {
      const errorContext = {
        packetCount: this.packetCount,
        entityCount: this.entities.size,
        dataLength: data.length,
        controlGhost: this.latestControl.ghostIndex,
        connectSynced: this.connectSynced,
      };
      log.error("Failed to process live packet: %o %o", e, errorContext);
    }
  }

  private processParsedEvent(
    event: PacketData["events"][number],
    isEarlyPacket: boolean,
    shouldLog: boolean,
  ): void {
    if (event.parsedData) {
      const type = event.parsedData.type as string;
      if (type === "RemoteCommandEvent") {
        this.handleRelayCommands(event.parsedData as RemoteCommandEventData);
      } else if (type === "CRCChallengeEvent") {
        this.handleCRCChallenge(event.parsedData as CRCChallengeEventData);
      } else if (type === "GhostingMessageEvent") {
        this.handleGhostingMessage(
          event.parsedData as GhostingMessageEventData,
        );
      }

      // Always log RemoteCommandEvents (chat, server messages, HUD).
      if (type === "RemoteCommandEvent") {
        const funcName = this.resolveNetString(
          (event.parsedData.funcName as string) ?? "",
        );
        log.debug("remote: %s", funcName);
      }
      // Log other events in early packets
      if (isEarlyPacket) {
        if (type !== "NetStringEvent" && type !== "RemoteCommandEvent") {
          log.debug(
            "event: %s%s",
            type,
            type === "SimDataBlockEvent"
              ? ` id=${event.parsedData.objectId} class=${event.parsedData.dataBlockClassName}`
              : "",
          );
        }
      }

      // Track SimDataBlockEvent class names for CRC computation.
      if (type === "SimDataBlockEvent") {
        const dbId = event.parsedData.objectId as number | undefined;
        const dbClassName = event.parsedData.dataBlockClassName as
          string | undefined;
        if (dbId != null && dbClassName) {
          this.dataBlockClassNames.set(dbId, dbClassName);
        }
        if (shouldLog) {
          const dbData = event.parsedData.dataBlockData as
            ParsedData | undefined;
          const shapeName = resolveShapeName(dbClassName ?? "", dbData);
          log.debug(
            "datablock: id=%d class=%s%s",
            dbId,
            dbClassName ?? "?",
            shapeName ? ` shape=${shapeName}` : "",
          );
        }
      }

      const eventName = this.registry.getEventParser(event.classId)?.name;
      this.processEvent(event, eventName);

      // Log net strings in early packets
      if (isEarlyPacket && type === "NetStringEvent") {
        const id = event.parsedData.id as number;
        const value = event.parsedData.value as string;
        if (id != null && typeof value === "string") {
          log.trace(
            'netString #%d = "%s"',
            id,
            value.length > 60 ? value.slice(0, 60) + "…" : value,
          );
        }
      }

      // Log target info
      if (type === "TargetInfoEvent") {
        const targetId = event.parsedData.targetId as number | undefined;
        const nameTag = event.parsedData.nameTag as number | undefined;
        if (targetId != null && nameTag != null) {
          const resolved = this.conn.netStrings.get(nameTag);
          if (resolved) {
            const name = stripTaggedStringMarkup(resolved);
            log.info(
              'target #%d: "%s" team=%s',
              targetId,
              name,
              event.parsedData.sensorGroup ?? "?",
            );
          }
        }
      }

      // Log sensor group changes
      if (type === "SetSensorGroupEvent") {
        const sg = event.parsedData.sensorGroup as number | undefined;
        if (sg != null) {
          log.info("sensor group changed: → %d", sg);
        }
      }

      // Log sensor group colors
      if (type === "SensorGroupColorEvent") {
        const sg = event.parsedData.sensorGroup as number;
        const colors = event.parsedData.colors as Array<unknown> | undefined;
        if (colors) {
          log.debug(
            "sensor group colors: group=%d, %d entries",
            sg,
            colors.length,
          );
        }
      }
    }
  }

  private processParsedGhost(ghost: PacketData["ghosts"][number]): void {
    if (ghost.type === "create") {
      const pos = ghost.parsedData?.position as Vec3 | undefined;
      const hasPos =
        pos &&
        typeof pos.x === "number" &&
        typeof pos.y === "number" &&
        typeof pos.z === "number";
      const className = this.resolveGhostClassName(ghost.index, ghost.classId);
      log.debug(
        "ghost create: #%d %s%s (%d entities total)",
        ghost.index,
        className ?? "?",
        hasPos
          ? ` at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`
          : "",
        this.entities.size + 1,
      );
      if (!this._ready) {
        this._ready = true;
        this.onReady?.();
      }
    } else if (ghost.type === "delete") {
      const prevEntityId = this.entityIdByGhostIndex.get(ghost.index);
      const prevEntity = prevEntityId
        ? this.entities.get(prevEntityId)
        : undefined;
      if (this.packetCount < 50 || this.packetCount % 200 === 0) {
        log.debug(
          "ghost delete: #%d %s (%d entities remaining)",
          ghost.index,
          prevEntity?.className ?? "?",
          this.entities.size - 1,
        );
      }
    }
    this.processGhostUpdate(ghost);
  }
}
