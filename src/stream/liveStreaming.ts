import {
  createLiveParser,
  type PacketParser,
} from "t2-demo-parser";
import { resolveShapeName, stripTaggedStringMarkup } from "./streamHelpers";
import type { Vec3 } from "./streamHelpers";
import type { StreamSnapshot } from "./types";
import { StreamEngine } from "./StreamEngine";
import type { RelayClient } from "./relayClient";

// ── Player list entry ──

export interface PlayerListEntry {
  targetId: number;
  name: string;
  sensorGroup: number;
}

/**
 * Adapts live game packets from a relay connection into the
 * StreamingPlayback interface used by the existing rendering pipeline.
 */
export class LiveStreamAdapter extends StreamEngine {
  private packetParser: PacketParser;
  relay: RelayClient;

  private currentTimeSec = 0;
  private connectSynced = false;
  private _snapshot: StreamSnapshot | null = null;
  private _snapshotTick = -1;
  private _ready = false;
  /** Class names for datablocks, tracked from SimDataBlockEvents. */
  private dataBlockClassNames = new Map<number, string>();

  /** Called once when the first ghost entity is created. */
  onReady?: () => void;

  constructor(relay: RelayClient) {
    super();
    this.relay = relay;
    const { registry, ghostTracker, packetParser } = createLiveParser();
    this.packetParser = packetParser;
    this.ghostTracker = ghostTracker;
    this.registry = registry;
  }

  // ── StreamEngine abstract implementations ──

  getDataBlockData(id: number): Record<string, unknown> | undefined {
    return this.packetParser.getDataBlockDataMap()?.get(id);
  }

  private _shapeConstructorCache: Map<string, string[]> | null = null;

  getShapeConstructorSequences(shapeName: string): string[] | undefined {
    // Rebuild cache each call since datablocks arrive incrementally.
    this._shapeConstructorCache = new Map();
    const dbMap = this.packetParser.getDataBlockDataMap();
    if (!dbMap) return undefined;
    for (const [, block] of dbMap) {
      const shape = block.shape as string | undefined;
      const seqs = block.sequences as string[] | undefined;
      if (shape && seqs) {
        this._shapeConstructorCache.set(shape.toLowerCase(), seqs);
      }
    }
    return this._shapeConstructorCache.get(shapeName.toLowerCase());
  }

  protected getTimeSec(): number {
    return this.currentTimeSec;
  }

  protected getCameraYawPitch(
    data: Record<string, unknown> | undefined,
  ): { yaw: number; pitch: number } {
    const absRot = this.getAbsoluteRotation(data);
    return absRot ?? { yaw: 0, pitch: 0 };
  }

  getEffectShapes(): string[] {
    const shapes = new Set<string>();
    const dbMap = this.packetParser.getDataBlockDataMap();
    if (!dbMap) return [];
    for (const [, block] of dbMap) {
      const explosionId = block.explosion as number | undefined;
      if (explosionId == null) continue;
      const expBlock = dbMap.get(explosionId);
      if (expBlock?.dtsFileName) {
        shapes.add(expBlock.dtsFileName as string);
      }
    }
    return [...shapes];
  }

  // ── StreamingPlayback interface ──

  reset(): void {
    this.resetSharedState();
    this.ghostTracker.clear?.();
    this.currentTimeSec = 0;
    this._snapshot = null;
    this._snapshotTick = -1;
    this.dataBlockClassNames.clear();
    this.observerMode = "fly";
  }

  getSnapshot(): StreamSnapshot {
    if (this._snapshot && this._snapshotTick === this.tickCount) {
      return this._snapshot;
    }
    return this.buildSnapshot();
  }

  stepToTime(
    targetTimeSec: number,
    _maxMoveTicks?: number,
  ): StreamSnapshot {
    this.currentTimeSec = targetTimeSec;
    return this.getSnapshot();
  }

  // ── Live-specific: connect sequence sync ──

  private syncConnectSequence(data: Uint8Array): void {
    if (this.connectSynced || data.length < 1) return;
    this.connectSynced = true;
    const connectSeqBit = (data[0] >> 1) & 1;
    // The browser parser is a passive observer — it never sends packets
    // (the relay handles all outgoing UDP traffic). Set lastSendSeq very
    // high so the parser's ack validation (lastSendSeq < highestAck →
    // reject) never fires. Without this, the parser rejects any packet
    // where the server acks relay-sent sequences (e.g. auth events).
    this.packetParser.setConnectionProtocolState({
      lastSeqRecvdAtSend: new Array(32).fill(0),
      lastSeqRecvd: 0,
      highestAckedSeq: 0,
      lastSendSeq: 0x1fffffff,
      ackMask: 0,
      connectSequence: connectSeqBit,
      lastRecvAckAck: 0,
      connectionEstablished: true,
    });
  }

  // ── Live-specific: feed raw packet ──

  feedPacket(data: Uint8Array): void {
    this.syncConnectSequence(data);
    this.processPacket(data);
  }

  // ── Live-specific: auth event detection ──

  /**
   * Handle RemoteCommandEvents that require relay-side responses:
   * auth events, mission phase acknowledgments, etc.
   */
  private handleRelayCommands(parsedData: Record<string, unknown>): void {
    if (parsedData.type !== "RemoteCommandEvent") return;
    const rawFuncName = parsedData.funcName as string;
    if (!rawFuncName) return;
    const funcName = this.resolveNetString(rawFuncName);

    // T2csri auth events → forward to relay for crypto processing.
    const authCommands = [
      "t2csri_pokeClient",
      "t2csri_getChallengeChunk",
      "t2csri_decryptChallenge",
    ];
    if (authCommands.includes(funcName)) {
      const rawArgs = (parsedData.args as string[]) ?? [];
      const args = rawArgs
        .map((a) => this.resolveNetString(a))
        .filter((a) => a !== "");
      console.log(`[live] auth event: ${funcName}`, args);
      this.relay.sendAuthEvent(funcName, args);
      return;
    }

    // Mission download phase acknowledgments — the server won't proceed
    // to ghosting until the client responds to each phase.
    const rawArgs = (parsedData.args as string[]) ?? [];
    const resolvedArgs = rawArgs.map((a) => this.resolveNetString(a));
    if (funcName === "MissionStartPhase1") {
      const seq = resolvedArgs[0] ?? "";
      console.log(`[live] mission phase 1, seq=${seq}`);
      this.relay.sendCommand("MissionStartPhase1Done", [seq]);
    } else if (funcName === "MissionStartPhase2") {
      const seq = resolvedArgs[0] ?? "";
      console.log(`[live] mission phase 2 (datablocks), seq=${seq}`);
      this.relay.sendCommand("MissionStartPhase2Done", [seq]);
    } else if (funcName === "MissionStartPhase3") {
      const seq = resolvedArgs[0] ?? "";
      console.log(`[live] mission phase 3 (ghosting), seq=${seq}`);
      // Send an empty favorites list then acknowledge phase 3.
      this.relay.sendCommand("setClientFav", [""]);
      this.relay.sendCommand("MissionStartPhase3Done", [seq]);
    }
  }

  /** Respond to CRCChallengeEvent — required for Phase 2 to begin. */
  private handleCRCChallenge(parsedData: Record<string, unknown>): void {
    if (parsedData.type !== "CRCChallengeEvent") return;
    const seed = parsedData.crcValue as number;
    const field1 = parsedData.field1 as number;
    const field2 = parsedData.field2 as number;
    // field1 bit 0 = includeTextures (from $Host::CRCTextures)
    const includeTextures = (field1 & 1) !== 0;
    console.log(
      `[live] CRC challenge: seed=0x${(seed >>> 0).toString(16)} ` +
      `f1=0x${(field1 >>> 0).toString(16)} f2=0x${(field2 >>> 0).toString(16)} ` +
      `includeTextures=${includeTextures}`,
    );

    // Collect datablocks for relay-side CRC computation over game files.
    const dbMap = this.packetParser.getDataBlockDataMap();
    const datablocks: { objectId: number; className: string; shapeName: string }[] = [];
    if (dbMap) {
      for (const [id, block] of dbMap) {
        const className = this.dataBlockClassNames.get(id);
        if (!className) continue;
        const shapeName = resolveShapeName(className, block as Record<string, unknown>);
        datablocks.push({
          objectId: id,
          className,
          shapeName: shapeName ?? "",
        });
      }
    }
    console.log(`[live] CRC: sending ${datablocks.length} datablocks for computation`);
    this.relay.sendCRCCompute(seed, field2, datablocks, includeTextures);
  }

  /**
   * Respond to GhostingMessageEvent type 0 (GhostAlwaysDone).
   * The server sends this after activateGhosting(); the client must respond
   * with type 1 so the server sets mGhosting=true and begins sending ghosts.
   */
  private handleGhostingMessage(parsedData: Record<string, unknown>): void {
    if (parsedData.type !== "GhostingMessageEvent") return;
    const message = parsedData.message as number;
    const sequence = parsedData.sequence as number;
    const ghostCount = parsedData.ghostCount as number;
    console.log(
      `[live] GhostingMessageEvent: message=${message} sequence=${sequence} ghostCount=${ghostCount}`,
    );
    if (message === 0) {
      // GhostAlwaysDone → send type 1 acknowledgment
      console.log(`[live] Sending ghost ack (type 1) for sequence ${sequence}`);
      this.relay.sendGhostAck(sequence, ghostCount);
    }
  }

  /**
   * Server-side observer camera mode. In "fly" mode, trigger 0 (fire) would
   * make the server assign a team — so we must NEVER send fire in fly mode.
   * Jump (trigger 2) transitions between modes.
   */
  observerMode: "fly" | "follow" = "fly";

  /** Enter follow mode (from fly) or cycle to next player (in follow). */
  cycleObserveNext(): void {
    if (this.observerMode === "fly") {
      // Jump trigger enters observerFollow from observerFly
      console.log("[live] observer: fly → follow (jump trigger)");
      this.sendTrigger(2);
      this.observerMode = "follow";
    } else {
      // Fire trigger cycles to next player in observerFollow
      console.log("[live] observer: cycle next (fire trigger)");
      this.sendTrigger(0);
    }
  }

  /** Toggle between follow and free-fly observer modes. */
  toggleObserverMode(): void {
    if (this.observerMode === "fly") {
      // Jump trigger enters observerFollow from observerFly
      console.log("[live] observer: fly → follow (jump trigger)");
      this.sendTrigger(2);
      this.observerMode = "follow";
    } else {
      // Jump trigger returns to observerFly from observerFollow
      console.log("[live] observer: follow → fly (jump trigger)");
      this.sendTrigger(2);
      this.observerMode = "fly";
    }
  }

  private sendTrigger(index: number): void {
    const trigger: [boolean, boolean, boolean, boolean, boolean, boolean] =
      [false, false, false, false, false, false];
    trigger[index] = true;
    this.relay.sendMove({
      x: 0, y: 0, z: 0,
      yaw: 0, pitch: 0, roll: 0,
      trigger,
      freeLook: false,
    });
  }

  /** Get the player list (for observer cycling UI). */
  getPlayerList(): PlayerListEntry[] {
    const entries: PlayerListEntry[] = [];
    for (const [targetId, name] of this.targetNames) {
      const sg = this.targetTeams.get(targetId) ?? 0;
      entries.push({ targetId, name, sensorGroup: sg });
    }
    return entries;
  }

  // ── Packet processing ──

  private processPacket(data: Uint8Array): void {
    try {
      const rejectedBefore = this.packetParser.protocolRejected;
      const noDispatchBefore = this.packetParser.protocolNoDispatch;
      const parsed = this.packetParser.parsePacket(data);
      const wasRejected = this.packetParser.protocolRejected > rejectedBefore;
      const wasNoDispatch = this.packetParser.protocolNoDispatch > noDispatchBefore;

      if (wasRejected || wasNoDispatch) {
        console.warn(
          `[live] packet #${this.tickCount} ${wasRejected ? "REJECTED" : "no-dispatch"}: ${data.length} bytes` +
          ` (total rejected=${this.packetParser.protocolRejected}, noDispatch=${this.packetParser.protocolNoDispatch})`,
        );
      }

      const isEarlyPacket = this.tickCount < 20;
      const isMilestonePacket = this.tickCount % 100 === 0;
      const shouldLog = isEarlyPacket || isMilestonePacket;

      if (shouldLog) {
        console.log(
          `[live] packet #${this.tickCount}: ${parsed.events.length} events, ${parsed.ghosts.length} ghosts, ${data.length} bytes` +
          (parsed.gameState.controlObjectGhostIndex !== undefined
            ? `, control=${parsed.gameState.controlObjectGhostIndex}`
            : "") +
          (parsed.gameState.cameraFov !== undefined
            ? `, fov=${parsed.gameState.cameraFov}`
            : ""),
        );
      }

      // Control object state
      this.processControlObject(parsed.gameState);

      // Events
      for (const event of parsed.events) {
        if (event.parsedData) {
          this.handleRelayCommands(event.parsedData);
          this.handleCRCChallenge(event.parsedData);
          this.handleGhostingMessage(event.parsedData);
          const type = event.parsedData.type as string;

          // Log events in early packets
          if (isEarlyPacket) {
            if (type !== "NetStringEvent") {
              console.log(
                `[live] event: ${type}`,
                type === "RemoteCommandEvent"
                  ? { funcName: this.resolveNetString(event.parsedData.funcName as string ?? "") }
                  : type === "SimDataBlockEvent"
                    ? { id: event.parsedData.objectId, className: event.parsedData.dataBlockClassName }
                    : undefined,
              );
            }
          }

          // Track SimDataBlockEvent class names for CRC computation.
          if (type === "SimDataBlockEvent") {
            const dbId = event.parsedData.objectId as number | undefined;
            const dbClassName = event.parsedData.dataBlockClassName as string | undefined;
            if (dbId != null && dbClassName) {
              this.dataBlockClassNames.set(dbId, dbClassName);
            }
            if (shouldLog) {
              const dbData = event.parsedData.dataBlockData as Record<string, unknown> | undefined;
              const shapeName = resolveShapeName(dbClassName ?? "", dbData);
              console.log(
                `[live] datablock: id=${dbId} class=${dbClassName ?? "?"}` +
                (shapeName ? ` shape=${shapeName}` : ""),
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
              console.log(`[live] netString #${id} = "${value.length > 60 ? value.slice(0, 60) + "…" : value}"`);
            }
          }

          // Log target info
          if (type === "TargetInfoEvent") {
            const targetId = event.parsedData.targetId as number | undefined;
            const nameTag = event.parsedData.nameTag as number | undefined;
            if (targetId != null && nameTag != null) {
              const resolved = this.netStrings.get(nameTag);
              if (resolved) {
                const name = stripTaggedStringMarkup(resolved);
                console.log(`[live] target #${targetId}: "${name}" team=${event.parsedData.sensorGroup ?? "?"}`);
              }
            }
          }

          // Log sensor group changes
          if (type === "SetSensorGroupEvent") {
            const sg = event.parsedData.sensorGroup as number | undefined;
            if (sg != null) {
              console.log(`[live] sensor group changed: → ${sg}`);
            }
          }

          // Log sensor group colors
          if (type === "SensorGroupColorEvent") {
            const sg = event.parsedData.sensorGroup as number;
            const colors = event.parsedData.colors as Array<unknown> | undefined;
            if (colors) {
              console.log(
                `[live] sensor group colors: group=${sg}, ${colors.length} entries`,
              );
            }
          }
        }
      }

      // Ghosts
      for (const ghost of parsed.ghosts) {
        if (ghost.type === "create") {
          const pos = ghost.parsedData?.position as Vec3 | undefined;
          const hasPos = pos && typeof pos.x === "number" && typeof pos.y === "number" && typeof pos.z === "number";
          const className = this.resolveGhostClassName(ghost.index, ghost.classId);
          console.log(
            `[live] ghost create: #${ghost.index} ${className ?? "?"}` +
            (hasPos ? ` at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})` : "") +
            ` (${this.entities.size + 1} entities total)`,
          );
          if (!this._ready) {
            this._ready = true;
            this.onReady?.();
          }
        } else if (ghost.type === "delete") {
          const prevEntityId = this.entityIdByGhostIndex.get(ghost.index);
          const prevEntity = prevEntityId ? this.entities.get(prevEntityId) : undefined;
          if (this.tickCount < 50 || this.tickCount % 200 === 0) {
            console.log(
              `[live] ghost delete: #${ghost.index} ${prevEntity?.className ?? "?"}` +
              ` (${this.entities.size - 1} entities remaining)`,
            );
          }
        }
        this.processGhostUpdate(ghost);
      }

      this.tickCount++;
      this.advanceProjectiles();
      this.advanceItems();

      // Periodic status at milestones
      if (isMilestonePacket && this.tickCount > 1) {
        const dbMap = this.packetParser.getDataBlockDataMap();
        console.log(
          `[live] status @ tick ${this.tickCount}: ${this.entities.size} entities, ` +
          `${dbMap?.size ?? 0} datablocks, ` +
          `rejected=${this.packetParser.protocolRejected}, noDispatch=${this.packetParser.protocolNoDispatch}`,
        );
      }

      // Entity count milestones
      const entityCount = this.entities.size;
      if (
        this.tickCount === 1 ||
        (entityCount > 0 && entityCount % 25 === 0 && this.tickCount < 100)
      ) {
        const types = new Map<string, number>();
        for (const e of this.entities.values()) {
          types.set(e.type, (types.get(e.type) ?? 0) + 1);
        }
        const summary = [...types.entries()]
          .map(([t, c]) => `${t}=${c}`)
          .join(" ");
        console.log(
          `[live] entity count: ${entityCount} (${summary})`,
        );
      }

      this.updateCameraAndHud();

      // Log camera position for early packets
      if (this.tickCount <= 5 && this.camera) {
        const [cx, cy, cz] = this.camera.position;
        console.log(
          `[live] camera: mode=${this.camera.mode} pos=(${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)}) fov=${this.camera.fov}`,
        );
      }
    } catch (e) {
      const errorContext = {
        tickCount: this.tickCount,
        entityCount: this.entities.size,
        dataLength: data.length,
        controlGhost: this.latestControl.ghostIndex,
        connectSynced: this.connectSynced,
      };
      console.error("Failed to process live packet:", e, errorContext);
    }
  }

  // ── Build snapshot ──

  private buildSnapshot(): StreamSnapshot {
    const entities = this.buildEntityList();
    const timeSec = this.currentTimeSec;
    const { chatMessages, audioEvents } = this.buildTimeFilteredEvents(timeSec);
    const { weaponsHud, inventoryHud, backpackHud, teamScores } =
      this.buildHudState();

    // Default observer camera if none exists
    if (!this.camera) {
      this.camera = {
        time: timeSec,
        position: [0, 0, 200],
        rotation: [0, 0, 0, 1],
        fov: 90,
        mode: "observer",
      };
    }

    const snapshot: StreamSnapshot = {
      timeSec,
      exhausted: false,
      camera: this.camera,
      entities,
      controlPlayerGhostId: this.controlPlayerGhostId,
      playerSensorGroup: this.playerSensorGroup,
      status: this.lastStatus,
      chatMessages,
      audioEvents,
      weaponsHud,
      backpackHud,
      inventoryHud,
      teamScores,
    };

    this._snapshot = snapshot;
    this._snapshotTick = this.tickCount;
    return snapshot;
  }
}
