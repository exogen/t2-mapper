import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  DemoParser,
} from "t2-demo-parser";
import { ghostToSceneObject } from "../scene";
import {
  toEntityType,
  allocateEntityId,
  TICK_DURATION_MS,
} from "./entityClassification";
import {
  clamp,
  MAX_PITCH,
  isValidPosition,
  stripTaggedStringMarkup,
  detectControlObjectType,
  parseColorSegments,
  backpackBitmapToIndex,
  torqueQuatHeading,
  torqueQuatPitch,
  torqueQuatToThreeJS,
} from "./streamHelpers";
import type { Vec3 } from "./streamHelpers";
import type {
  StreamRecording,
  StreamSnapshot,
  TeamScore,
  PlayerRosterEntry,
  WeaponsHudSlot,
  InventoryHudSlot,
  BackpackHudState,
} from "./types";
import { StreamEngine, type MutableEntity } from "./StreamEngine";

interface DemoMissionInfo {
  /** Mission display name from readplayerinfo row 2 (e.g. "S5-WoodyMyrk"). */
  missionDisplayName: string | null;
  /** Mission type display name from readplayerinfo row 3 (e.g. "Capture the Flag"). */
  missionType: string | null;
  /** Game class name from the SCORE header (e.g. "CTFGame"). */
  gameClassName: string | null;
  /** Server display name from readplayerinfo row 2. */
  serverDisplayName: string | null;
  /** Mod name from readplayerinfo row 3 (e.g. "classic"). */
  mod: string | null;
  /** Name of the player who recorded the demo (from readplayerinfo row 1). */
  recorderName: string | null;
  /** Recording date string from readplayerinfo row 2 (e.g. "May-4-2025 10:37PM"). */
  recordingDate: string | null;
  /** Client ID of the recorder. */
  recorderClientId: number | null;
}

function extractMissionInfo(demoValues: string[]): DemoMissionInfo {
  let missionDisplayName: string | null = null;
  let missionType: string | null = null;
  let gameClassName: string | null = null;
  let serverDisplayName: string | null = null;
  let mod: string | null = null;
  let recorderName: string | null = null;
  let recorderClientId: number = NaN;
  let recordingDate: string | null = null;

  for (let i = 0; i < demoValues.length; i++) {
    // SCORE header: "visible\tgameClassName\tobjCount"
    const scoreFields = demoValues[i].split("\t");
    if (scoreFields.length >= 3 && scoreFields[1]?.endsWith("Game")) {
      gameClassName = scoreFields[1];
    }

    if (demoValues[i] !== "readplayerinfo") continue;
    const value = demoValues[i + 1];
    if (!value) continue;

    if (value.startsWith("1\t")) {
      // Row 1: "1\tclientId\trecorderName\tteamName\tguid"
      const fields = value.split("\t");
      if (fields[1]) recorderClientId = parseInt(fields[1], 10);
      if (fields[2]) recorderName = stripTaggedStringMarkup(fields[2]).trim();
      continue;
    }

    if (value.startsWith("2\t")) {
      // Row 2: "2\tserverName\taddress\tdate\tmissionDisplayName"
      const fields = value.split("\t");
      if (fields[1]) serverDisplayName = fields[1];
      if (fields[3]) recordingDate = fields[3];
      if (fields[4]) missionDisplayName = fields[4];
      continue;
    }

    if (value.startsWith("3\t")) {
      // Row 3: "3\tmod\tmissionTypeDisplayName\t..."
      const fields = value.split("\t");
      if (fields[1]) mod = fields[1];
      if (fields[2]) missionType = fields[2];
    }
  }

  return {
    missionDisplayName,
    missionType,
    gameClassName,
    serverDisplayName,
    mod,
    recorderName,
    recorderClientId: Number.isFinite(recorderClientId)
      ? recorderClientId
      : null,
    recordingDate,
  };
}

interface ParsedDemoValues {
  weaponsHud: { slots: Map<number, number>; activeIndex: number } | null;
  backpackHud: { packIndex: number; active: boolean; text: string } | null;
  inventoryHud: {
    slots: Map<number, number>;
    activeSlot: number;
  } | null;
  teamScores: TeamScore[];
  playerRoster: Map<
    number,
    {
      name: string;
      teamId: number;
      score: number;
      ping: number;
      packetLoss: number;
    }
  >;
  chatMessages: string[];
  /** Value from clockHud.getTime() — minutes passed to setTime(). */
  clockTimeMin: number | null;
  gravity: number;
}

/**
 * Parse the $DemoValue[] array to extract initial HUD state.
 *
 * Sections are written sequentially by saveDemoSettings/getState in
 * recordings.cs: MISC, PLAYERLIST, RETICLE, BACKPACK, WEAPON, INVENTORY,
 * SCORE, CLOCK, CHAT, GRAVITY.
 */
function parseDemoValues(demoValues: string[]): ParsedDemoValues {
  const result: ParsedDemoValues = {
    weaponsHud: null,
    backpackHud: null,
    inventoryHud: null,
    teamScores: [],
    playerRoster: new Map(),
    chatMessages: [],
    clockTimeMin: null,
    gravity: -20,
  };
  if (!demoValues.length) return result;

  let idx = 0;
  const next = () => {
    const v = demoValues[idx++];
    return v === "<BLANK>" ? "" : (v ?? "");
  };

  // MISC: 1 value
  next();

  // PLAYERLIST: count + count entries
  if (idx >= demoValues.length) return result;
  const playerCount = parseInt(next(), 10) || 0;
  const playerCountByTeam = new Map<number, number>();
  for (let i = 0; i < playerCount; i++) {
    const fields = next().split("\t");
    const name = stripTaggedStringMarkup(fields[0] ?? "").trim();
    const clientId = parseInt(fields[2], 10);
    const teamId = parseInt(fields[4], 10);
    const score = parseInt(fields[5], 10) || 0;
    const ping = parseInt(fields[6], 10) || 0;
    const packetLoss = parseInt(fields[7], 10) || 0;
    if (!isNaN(clientId) && !isNaN(teamId)) {
      result.playerRoster.set(clientId, {
        name,
        teamId,
        score,
        ping,
        packetLoss,
      });
    }
    if (!isNaN(teamId) && teamId > 0) {
      playerCountByTeam.set(teamId, (playerCountByTeam.get(teamId) ?? 0) + 1);
    }
  }

  // RETICLE: 1 value
  if (idx >= demoValues.length) return result;
  next();

  // BACKPACK: 1 value (bitmap TAB visible TAB text TAB textVisible TAB pack)
  if (idx >= demoValues.length) return result;
  {
    const backpackVal = next();
    const fields = backpackVal.split("\t");
    const bitmap = fields[0] ?? "";
    const visible = fields[1] === "1" || fields[1] === "true";
    const text = fields[2] ?? "";
    const pack = fields[4] === "1" || fields[4] === "true";
    if (visible && bitmap) {
      const packIndex = backpackBitmapToIndex(bitmap);
      result.backpackHud = { packIndex, active: pack, text };
    }
  }

  // WEAPON: header + count bitmap entries + slotCount slot entries
  if (idx >= demoValues.length) return result;
  const weaponHeader = next().split("\t");
  const weaponCount = parseInt(weaponHeader[4], 10) || 0;
  const weaponSlotCount = parseInt(weaponHeader[5], 10) || 0;
  const weaponActive = parseInt(weaponHeader[6], 10);

  for (let i = 0; i < weaponCount; i++) next();

  const slots = new Map<number, number>();
  for (let i = 0; i < weaponSlotCount; i++) {
    const fields = next().split("\t");
    const slotId = parseInt(fields[0], 10);
    const ammo = parseInt(fields[1], 10);
    if (!isNaN(slotId)) {
      slots.set(slotId, isNaN(ammo) ? -1 : ammo);
    }
  }
  result.weaponsHud = {
    slots,
    activeIndex: isNaN(weaponActive) ? -1 : weaponActive,
  };

  // INVENTORY: header + count bitmap entries + slotCount slot entries
  if (idx >= demoValues.length) return result;
  const invHeader = next().split("\t");
  const invCount = parseInt(invHeader[4], 10) || 0;
  const invSlotCount = parseInt(invHeader[5], 10) || 0;
  const invActive = parseInt(invHeader[6], 10);
  for (let i = 0; i < invCount; i++) next();
  {
    const invSlots = new Map<number, number>();
    for (let i = 0; i < invSlotCount; i++) {
      const fields = next().split("\t");
      const slotId = parseInt(fields[0], 10);
      const count = parseInt(fields[1], 10);
      if (!isNaN(slotId) && !isNaN(count) && count > 0) {
        invSlots.set(slotId, count);
      }
    }
    if (invSlots.size > 0) {
      result.inventoryHud = {
        slots: invSlots,
        activeSlot: isNaN(invActive) ? -1 : invActive,
      };
    }
  }

  // SCORE: header (visible TAB gameType TAB objCount) + objCount entries.
  if (idx >= demoValues.length) return result;
  const scoreHeader = next().split("\t");
  const gameType = scoreHeader[1] ?? "";
  const objCount = parseInt(scoreHeader[2], 10) || 0;
  const scoreObjs: string[] = [];
  for (let i = 0; i < objCount; i++) scoreObjs.push(next());

  if (gameType === "CTFGame" && objCount >= 8) {
    for (let t = 0; t < 2; t++) {
      const base = t * 4;
      const teamId = t + 1;
      result.teamScores.push({
        teamId,
        name: scoreObjs[base] ?? "",
        score: parseInt(scoreObjs[base + 1], 10) || 0,
        playerCount: playerCountByTeam.get(teamId) ?? 0,
      });
    }
  } else if (gameType === "TR2Game" && objCount >= 4) {
    for (let t = 0; t < 2; t++) {
      const base = t * 2;
      const teamId = t + 1;
      result.teamScores.push({
        teamId,
        name: scoreObjs[base + 1] ?? "",
        score: parseInt(scoreObjs[base], 10) || 0,
        playerCount: playerCountByTeam.get(teamId) ?? 0,
      });
    }
  }

  // CLOCK: 1 value — "isVisible\tremainingMinutes"
  if (idx >= demoValues.length) return result;
  {
    const clockFields = next().split("\t");
    const timeMin = parseFloat(clockFields[1] ?? "");
    if (Number.isFinite(timeMin)) {
      result.clockTimeMin = timeMin;
    }
  }

  // CHAT: always 10 entries
  for (let i = 0; i < 10; i++) {
    if (idx >= demoValues.length) break;
    const line = next();
    if (line) {
      result.chatMessages.push(line);
    }
  }

  // GRAVITY: 1 value
  if (idx < demoValues.length) {
    const g = parseFloat(next());
    if (Number.isFinite(g)) {
      result.gravity = g;
    }
  }

  return result;
}

class StreamingPlayback extends StreamEngine {
  private readonly parser: DemoParser;
  private readonly initialBlock: {
    dataBlocks: Map<
      number,
      { className: string; data: Record<string, unknown> }
    >;
    initialGhosts: Array<{
      index: number;
      type: "create" | "update" | "delete";
      classId?: number;
      parsedData?: Record<string, unknown>;
    }>;
    controlObjectGhostIndex: number;
    controlObjectData?: Record<string, unknown>;
    targetEntries: Array<{
      targetId: number;
      name?: string;
      skin?: string;
      skinPref?: string;
      sensorGroup: number;
      targetData: number;
    }>;
    sensorGroupColors: Array<{
      group: number;
      targetGroup: number;
      r: number;
      g: number;
      b: number;
    }>;
    taggedStrings: Map<number, string>;
    initialEvents: Array<{
      classId: number;
      parsedData?: Record<string, unknown>;
    }>;
    demoValues: string[];
    firstPerson: boolean;
  };
  // Demo-specific: move delta tracking for V12-style camera rotation
  private moveTicks = 0;
  private absoluteYaw = 0;
  private absolutePitch = 0;
  private lastAbsYaw = 0;
  private lastAbsPitch = 0;
  private exhausted = false;

  // Generation counters for derived-array caching in buildSnapshot().
  private _teamScoresGen = 0;
  private _rosterGen = 0;
  private _weaponsHudGen = 0;
  private _inventoryHudGen = 0;

  // Cached snapshot
  private _cachedSnapshot: StreamSnapshot | null = null;
  private _cachedSnapshotTick = -1;
  private _cachedSnapshotGen = -1;

  // Cached derived arrays
  private _snap: {
    teamScoresGen: number;
    rosterGen: number;
    teamScores: TeamScore[];
    playerRoster: PlayerRosterEntry[];
    weaponsHudGen: number;
    weaponsHud: { slots: WeaponsHudSlot[]; activeIndex: number };
    inventoryHudGen: number;
    inventoryHud: { slots: InventoryHudSlot[]; activeSlot: number };
    backpackPackIndex: number;
    backpackActive: boolean;
    backpackText: string;
    backpackHud: BackpackHudState | null;
  } | null = null;

  constructor(parser: DemoParser) {
    super();
    this.parser = parser;
    this.registry = parser.getRegistry();
    this.ghostTracker = parser.getGhostTracker();
    const initial = parser.initialBlock;
    this.initialBlock = {
      dataBlocks: initial.dataBlocks,
      initialGhosts: initial.initialGhosts,
      controlObjectGhostIndex: initial.controlObjectGhostIndex,
      controlObjectData: initial.controlObjectData,
      targetEntries: initial.targetEntries,
      sensorGroupColors: initial.sensorGroupColors,
      taggedStrings: initial.taggedStrings,
      initialEvents: initial.initialEvents,
      demoValues: initial.demoValues,
      firstPerson: initial.firstPerson,
    };

    this.reset();
  }

  // ── StreamEngine abstract implementations ──

  getDataBlockData(dataBlockId: number): Record<string, unknown> | undefined {
    const initialBlock = this.initialBlock.dataBlocks.get(dataBlockId);
    if (initialBlock?.data) {
      return initialBlock.data;
    }
    const packetParser = this.parser.getPacketParser() as unknown as {
      dataBlockDataMap?: Map<number, Record<string, unknown>>;
    };
    return packetParser.dataBlockDataMap?.get(dataBlockId);
  }

  private _shapeConstructorCache: Map<string, string[]> | null = null;

  getShapeConstructorSequences(shapeName: string): string[] | undefined {
    if (!this._shapeConstructorCache) {
      this._shapeConstructorCache = new Map();
      for (const [, db] of this.initialBlock.dataBlocks) {
        if (db.className !== "TSShapeConstructor" || !db.data) continue;
        const shape = db.data.shape as string | undefined;
        const seqs = db.data.sequences as string[] | undefined;
        if (shape && seqs) {
          this._shapeConstructorCache.set(shape.toLowerCase(), seqs);
        }
      }
    }
    return this._shapeConstructorCache.get(shapeName.toLowerCase());
  }

  protected getTimeSec(): number {
    return this.moveTicks * (TICK_DURATION_MS / 1000);
  }

  protected getCameraYawPitch(_data: Record<string, unknown> | undefined): {
    yaw: number;
    pitch: number;
  } {
    // Move-derived angles are valid when the control object is a Player
    // (including when piloting a vehicle — moves still drive the camera).
    const hasMoves = this.lastControlType === "player";
    const yaw = hasMoves ? this.absoluteYaw : this.lastAbsYaw;
    const pitch = hasMoves ? this.absolutePitch : this.lastAbsPitch;

    if (hasMoves) {
      this.lastAbsYaw = yaw;
      this.lastAbsPitch = pitch;
    }

    return { yaw, pitch };
  }

  protected getControlPlayerHeadPitch(_pitch: number): number {
    return clamp(this.absolutePitch / MAX_PITCH, -1, 1);
  }

  // ── Generation counter hooks ──

  protected onTeamScoresChanged(): void {
    this._teamScoresGen++;
  }

  protected onRosterChanged(): void {
    this._rosterGen++;
  }

  protected onWeaponsHudChanged(): void {
    this._weaponsHudGen++;
  }

  protected onInventoryHudChanged(): void {
    this._inventoryHudGen++;
  }

  // ── StreamingPlayback interface ──

  reset(): void {
    this.parser.reset();
    // parser.reset() creates a fresh GhostTracker internally — refresh our
    // reference so resolveGhostClassName doesn't use the stale one.
    this.ghostTracker = this.parser.getGhostTracker();
    this._cachedSnapshot = null;
    this._cachedSnapshotTick = -1;
    this._cachedSnapshotGen = -1;
    this._snap = null;

    this.resetSharedState();

    // Seed net strings from initial block
    for (const [id, value] of this.initialBlock.taggedStrings) {
      this.netStrings.set(id, value);
    }
    for (const entry of this.initialBlock.targetEntries) {
      if (entry.name) {
        this.targetNames.set(
          entry.targetId,
          stripTaggedStringMarkup(entry.name).trim(),
        );
      }
      if (entry.skin) this.targetSkins.set(entry.targetId, entry.skin);
      if (entry.skinPref)
        this.targetSkinPrefs.set(entry.targetId, entry.skinPref);
      this.targetTeams.set(entry.targetId, entry.sensorGroup);
      this.targetRenderFlags.set(entry.targetId, entry.targetData);
    }
    // Seed IFF color table from the initial block.
    for (const c of this.initialBlock.sensorGroupColors) {
      let map = this.sensorGroupColors.get(c.group);
      if (!map) {
        map = new Map();
        this.sensorGroupColors.set(c.group, map);
      }
      map.set(c.targetGroup, { r: c.r, g: c.g, b: c.b });
    }

    // Demo-specific state
    this.moveTicks = 0;
    this.absoluteYaw = 0;
    this.absolutePitch = 0;
    this.lastAbsYaw = 0;
    this.lastAbsPitch = 0;
    this.firstPerson = this.initialBlock.firstPerson;
    this.lastControlType =
      detectControlObjectType(this.initialBlock.controlObjectData) ?? "player";
    this.isPiloting =
      this.lastControlType === "player"
        ? !!(
            this.initialBlock.controlObjectData?.pilot ||
            this.initialBlock.controlObjectData?.controlObjectGhost != null
          )
        : false;
    this.lastPilotGhostIndex =
      this.isPiloting &&
      typeof this.initialBlock.controlObjectData?.controlObjectGhost ===
        "number"
        ? this.initialBlock.controlObjectData.controlObjectGhost
        : undefined;
    if (this.isPiloting) {
      const nested = this.initialBlock.controlObjectData?.controlObjectData as
        | Record<string, unknown>
        | undefined;
      const ang = nested?.angPosition as
        | { x: number; y: number; z: number; w: number }
        | undefined;
      if (ang && typeof ang.w === "number") {
        this.lastVehicleHeading = torqueQuatHeading(ang);
        this.lastVehiclePitch = torqueQuatPitch(ang);
        const threeQ = torqueQuatToThreeJS(ang);
        if (threeQ) {
          const [qx, qy, qz, qw] = threeQ;
          const fx = 1 - 2 * (qy * qy + qz * qz);
          const fy = 2 * (qx * qy + qz * qw);
          const fz = 2 * (qx * qz - qy * qw);
          this.lastVehicleOrbitDir = [-fx, -fy, -fz];
        }
      }
    }
    this.lastCameraMode =
      this.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.cameraMode === "number"
        ? this.initialBlock.controlObjectData.cameraMode
        : undefined;
    this.lastOrbitGhostIndex =
      this.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.orbitObjectGhostIndex ===
        "number"
        ? this.initialBlock.controlObjectData.orbitObjectGhostIndex
        : undefined;
    if (this.lastControlType === "camera") {
      const minOrbit = this.initialBlock.controlObjectData?.minOrbitDist as
        | number
        | undefined;
      const maxOrbit = this.initialBlock.controlObjectData?.maxOrbitDist as
        | number
        | undefined;
      const curOrbit = this.initialBlock.controlObjectData?.curOrbitDist as
        | number
        | undefined;
      if (
        typeof minOrbit === "number" &&
        typeof maxOrbit === "number" &&
        Number.isFinite(minOrbit) &&
        Number.isFinite(maxOrbit)
      ) {
        this.lastOrbitDistance = Math.max(0, maxOrbit - minOrbit);
      } else if (typeof curOrbit === "number" && Number.isFinite(curOrbit)) {
        this.lastOrbitDistance = Math.max(0, curOrbit);
      } else {
        this.lastOrbitDistance = undefined;
      }
    } else {
      this.lastOrbitDistance = undefined;
    }
    const initialAbsRot = this.getAbsoluteRotation(
      this.initialBlock.controlObjectData,
    );
    if (initialAbsRot) {
      this.absoluteYaw = initialAbsRot.yaw;
      this.absolutePitch = initialAbsRot.pitch;
      this.lastAbsYaw = initialAbsRot.yaw;
      this.lastAbsPitch = initialAbsRot.pitch;
    }
    this.exhausted = false;
    this.latestFov = 100;
    this.latestControl = {
      ghostIndex: this.initialBlock.controlObjectGhostIndex,
      data: this.initialBlock.controlObjectData,
      position: isValidPosition(
        this.initialBlock.controlObjectData?.position as Vec3,
      )
        ? (this.initialBlock.controlObjectData?.position as Vec3)
        : undefined,
    };
    for (const ghost of this.initialBlock.initialGhosts) {
      if (ghost.type !== "create" || ghost.classId == null) continue;
      const className = this.registry.getGhostParser(ghost.classId)?.name;
      if (!className) {
        throw new Error(
          `No ghost parser for classId ${ghost.classId} (ghost index ${ghost.index})`,
        );
      }
      const id = allocateEntityId();
      this.entityIdByGhostIndex.set(ghost.index, id);
      const entity: MutableEntity = {
        id,
        ghostIndex: ghost.index,
        className,
        spawnTick: 0,
        type: toEntityType(className),
        rotation: [0, 0, 0, 1],
      };
      this.applyGhostData(entity, ghost.parsedData);
      if (ghost.parsedData) {
        const sceneObj = ghostToSceneObject(
          className,
          ghost.index,
          ghost.parsedData as Record<string, unknown>,
        );
        if (sceneObj) entity.sceneData = sceneObj;
      }
      this.entities.set(id, entity);
      this.entityIdByGhostIndex.set(ghost.index, id);
    }

    // Resolve control player entity ID from the ghost index map.
    this.controlPlayerGhostId =
      this.lastControlType === "player" &&
      this.initialBlock.controlObjectGhostIndex >= 0
        ? this.entityIdByGhostIndex.get(
            this.initialBlock.controlObjectGhostIndex,
          )
        : undefined;

    // Derive playerSensorGroup from the control player entity
    if (
      this.playerSensorGroup === 0 &&
      this.lastControlType === "player" &&
      this.latestControl.ghostIndex >= 0
    ) {
      const ctrlId = this.entityIdByGhostIndex.get(
        this.latestControl.ghostIndex,
      );
      const ctrlEntity = ctrlId ? this.entities.get(ctrlId) : undefined;
      if (ctrlEntity?.sensorGroup != null && ctrlEntity.sensorGroup > 0) {
        this.playerSensorGroup = ctrlEntity.sensorGroup;
      }
    }

    // Process initial events
    for (const evt of this.initialBlock.initialEvents) {
      const eventName = this.registry.getEventParser(evt.classId)?.name;
      if (eventName === "SetSensorGroupEvent" && evt.parsedData) {
        const sg = evt.parsedData.sensorGroup as number | undefined;
        if (sg != null) this.playerSensorGroup = sg;
      } else if (eventName === "RemoteCommandEvent" && evt.parsedData) {
        const funcName = this.resolveNetString(
          evt.parsedData.funcName as string,
        );
        const args = evt.parsedData.args as string[];
        if (funcName === "ServerMessage") {
          this.handleServerMessage(args);
        }
        this.handleHudRemoteCommand(funcName, args);
      }
    }

    // Seed HUD state from demoValues
    const parsed = parseDemoValues(this.initialBlock.demoValues);
    if (parsed.weaponsHud) {
      this.weaponsHud.slots = parsed.weaponsHud.slots;
      this.weaponsHud.activeIndex = parsed.weaponsHud.activeIndex;
    }
    if (parsed.backpackHud) {
      this.backpackHud.packIndex = parsed.backpackHud.packIndex;
      this.backpackHud.active = parsed.backpackHud.active;
      this.backpackHud.text = parsed.backpackHud.text;
    }
    if (parsed.inventoryHud) {
      this.inventoryHud.slots = parsed.inventoryHud.slots;
      this.inventoryHud.activeSlot = parsed.inventoryHud.activeSlot;
    }
    this.teamScores = parsed.teamScores;
    this.playerRoster = new Map(parsed.playerRoster);
    if (parsed.clockTimeMin != null) {
      // Reproduce clockHud.setTime(getTime()) at demo start (timeSec=0).
      this.clockAnchorStreamSec = 0;
      this.clockDurationMs = parsed.clockTimeMin * 60 * 1000;
    }
    // Seed chat messages from demoValues
    for (const rawLine of parsed.chatMessages) {
      const segments = parseColorSegments(rawLine);
      if (!segments.length) continue;
      const fullText = segments.map((s) => s.text).join("");
      if (!fullText.trim()) continue;
      const primaryColor = segments[0].colorCode;
      const hasChatColor = segments.some(
        (s) => s.colorCode === 3 || s.colorCode === 4,
      );
      const isPlayerChat = hasChatColor && fullText.includes(": ");
      if (isPlayerChat) {
        const colonIdx = fullText.indexOf(": ");
        this.pushChatMessage({
          timeSec: 0,
          sender: fullText.slice(0, colonIdx),
          text: fullText.slice(colonIdx + 2),
          kind: "chat",
          colorCode: primaryColor,
          segments,
        });
      } else {
        this.pushChatMessage({
          timeSec: 0,
          sender: "",
          text: fullText,
          kind: "server",
          colorCode: primaryColor,
          segments,
        });
      }
    }

    this.updateCameraAndHud();
  }

  getSnapshot(): StreamSnapshot {
    if (
      this._cachedSnapshot &&
      this._cachedSnapshotTick === this.moveTicks &&
      this._cachedSnapshotGen === this.entityGeneration
    ) {
      return this._cachedSnapshot;
    }
    const snapshot = this.buildSnapshot();
    this._cachedSnapshot = snapshot;
    this._cachedSnapshotTick = this.moveTicks;
    this._cachedSnapshotGen = this.entityGeneration;
    return snapshot;
  }

  getEffectShapes(): string[] {
    const shapes = new Set<string>();
    const collectShapesFromExplosion = (expBlock: Record<string, unknown>) => {
      const shape = expBlock.dtsFileName as string | undefined;
      if (shape) shapes.add(shape);
      const subExplosions = expBlock.subExplosions as
        | (number | null)[]
        | undefined;
      if (Array.isArray(subExplosions)) {
        for (const subId of subExplosions) {
          if (subId == null) continue;
          const subBlock = this.getDataBlockData(subId);
          if (subBlock?.dtsFileName) {
            shapes.add(subBlock.dtsFileName as string);
          }
        }
      }
    };
    for (const [, block] of this.initialBlock.dataBlocks) {
      const explosionId = block.data?.explosion as number | undefined;
      if (explosionId == null) continue;
      const expBlock = this.getDataBlockData(explosionId);
      if (expBlock) collectShapesFromExplosion(expBlock);
    }
    return [...shapes];
  }

  stepToTime(
    targetTimeSec: number,
    maxMoveTicks = Number.POSITIVE_INFINITY,
  ): StreamSnapshot {
    const safeTargetSec = Number.isFinite(targetTimeSec)
      ? Math.max(0, targetTimeSec)
      : 0;
    const targetTicks = Math.floor((safeTargetSec * 1000) / TICK_DURATION_MS);

    let didReset = false;
    if (targetTicks < this.moveTicks) {
      this.reset();
      didReset = true;
    }

    const wasExhausted = this.exhausted;
    let movesProcessed = 0;
    while (
      !this.exhausted &&
      this.moveTicks < targetTicks &&
      movesProcessed < maxMoveTicks
    ) {
      if (!this.stepOneMoveTick()) {
        break;
      }
      movesProcessed += 1;
    }

    if (
      movesProcessed === 0 &&
      !didReset &&
      wasExhausted === this.exhausted &&
      this._cachedSnapshot &&
      this._cachedSnapshotTick === this.moveTicks &&
      this._cachedSnapshotGen === this.entityGeneration
    ) {
      return this._cachedSnapshot;
    }

    const snapshot = this.buildSnapshot();
    this._cachedSnapshot = snapshot;
    this._cachedSnapshotTick = this.moveTicks;
    return snapshot;
  }

  // ── Demo block processing ──

  private stepOneMoveTick(): boolean {
    while (true) {
      const block = this.parser.nextBlock();
      if (!block) {
        this.exhausted = true;
        return false;
      }

      this.handleBlock(block);

      if (block.type === BlockTypeMove) {
        this.moveTicks += 1;
        this.tickCount = this.moveTicks;
        this.advanceProjectiles();
        this.advanceItems();
        this.removeExpiredExplosions();
        this.updateCameraAndHud();
        return true;
      }
    }
  }

  private handleBlock(block: { type: number; parsed?: unknown }): void {
    if (block.type === BlockTypePacket && this.isPacketData(block.parsed)) {
      const packet = block.parsed;

      // Process control object
      this.processControlObject(packet.gameState);

      // Apply ghost rotation to absolute tracking. This must happen before
      // the next move delta so that our tracking stays calibrated to V12.
      // During piloting, rotationZ/headX are relative to the vehicle (reset
      // to 0 on mount). We still accept the reset so move deltas accumulate
      // from the correct base; the vehicle heading offset is added later in
      // updateCameraAndHud.
      const controlData = packet.gameState.controlObjectData;
      if (controlData) {
        const absRot = this.getAbsoluteRotation(controlData);
        if (absRot) {
          this.absoluteYaw = absRot.yaw;
          this.absolutePitch = absRot.pitch;
          this.lastAbsYaw = absRot.yaw;
          this.lastAbsPitch = absRot.pitch;
        }
      }

      for (const evt of packet.events) {
        const eventName = this.registry.getEventParser(evt.classId)?.name;
        this.processEvent(evt, eventName);
      }

      for (const ghost of packet.ghosts) {
        this.processGhostUpdate(ghost);
      }

      return;
    }

    if (block.type === BlockTypeInfo && this.isInfoData(block.parsed)) {
      // InfoBlock: value1 byte 0 = $firstPerson flag, value2 = FOV.
      // Verified against Tribes2.exe GameConnection::handleRecordedBlock.
      this.firstPerson = (block.parsed.value1 & 0xff) !== 0;
      if (Number.isFinite(block.parsed.value2)) {
        this.latestFov = block.parsed.value2;
      }
      return;
    }

    if (block.type === BlockTypeMove && this.isMoveData(block.parsed)) {
      // Replicate V12 Player::updateMove(): apply delta then wrap/clamp.
      this.absoluteYaw += block.parsed.yaw ?? 0;
      const TWO_PI = Math.PI * 2;
      this.absoluteYaw = ((this.absoluteYaw % TWO_PI) + TWO_PI) % TWO_PI;
      this.absolutePitch = clamp(
        this.absolutePitch + (block.parsed.pitch ?? 0),
        -MAX_PITCH,
        MAX_PITCH,
      );

      // The control player's ghost skips MoveMask (the server knows the client
      // predicts its own state). Derive jetting from the move's trigger[3],
      // matching Tribes2.exe Player::updateMove: mJetting = trigger[3] &&
      // energy >= minJetEnergy && state == MoveState && !disableMove.
      const triggers = (block.parsed as { trigger?: boolean[] }).trigger;
      if (triggers && this.controlPlayerGhostId) {
        const entity = this.entities.get(this.controlPlayerGhostId);
        if (entity) {
          entity.jetting = !!triggers[3];
        }
      }
    }
  }

  // ── Build snapshot (with generation-counter caching) ──

  private buildSnapshot(): StreamSnapshot {
    const entities = this.buildEntityList();
    const timeSec = this.getTimeSec();
    const prev = this._snap;

    const { chatMessages, audioEvents } = this.buildTimeFilteredEvents(timeSec);

    const weaponsHud =
      prev && prev.weaponsHudGen === this._weaponsHudGen
        ? prev.weaponsHud
        : {
            slots: Array.from(this.weaponsHud.slots.entries()).map(
              ([index, ammo]): WeaponsHudSlot => ({ index, ammo }),
            ),
            activeIndex: this.weaponsHud.activeIndex,
          };

    const inventoryHud =
      prev && prev.inventoryHudGen === this._inventoryHudGen
        ? prev.inventoryHud
        : {
            slots: Array.from(this.inventoryHud.slots.entries()).map(
              ([slot, count]): InventoryHudSlot => ({ slot, count }),
            ),
            activeSlot: this.inventoryHud.activeSlot,
          };

    const backpackHud =
      prev &&
      prev.backpackPackIndex === this.backpackHud.packIndex &&
      prev.backpackActive === this.backpackHud.active &&
      prev.backpackText === this.backpackHud.text
        ? prev.backpackHud
        : this.backpackHud.packIndex >= 0
          ? { ...this.backpackHud }
          : null;

    let teamScores: TeamScore[];
    let playerRoster: PlayerRosterEntry[];
    if (
      prev &&
      prev.teamScoresGen === this._teamScoresGen &&
      prev.rosterGen === this._rosterGen
    ) {
      teamScores = prev.teamScores;
      playerRoster = prev.playerRoster;
    } else {
      teamScores = this.teamScores.map((ts) => ({ ...ts }));
      const teamCounts = new Map<number, number>();
      for (const { teamId } of this.playerRoster.values()) {
        if (teamId > 0) {
          teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
        }
      }
      for (const ts of teamScores) {
        ts.playerCount = teamCounts.get(ts.teamId) ?? 0;
      }
      playerRoster = [];
      for (const [clientId, entry] of this.playerRoster) {
        playerRoster.push({ clientId, ...entry });
      }
    }

    this._snap = {
      teamScoresGen: this._teamScoresGen,
      rosterGen: this._rosterGen,
      teamScores,
      playerRoster,
      weaponsHudGen: this._weaponsHudGen,
      weaponsHud,
      inventoryHudGen: this._inventoryHudGen,
      inventoryHud,
      backpackPackIndex: this.backpackHud.packIndex,
      backpackActive: this.backpackHud.active,
      backpackText: this.backpackHud.text,
      backpackHud,
    };

    return {
      timeSec,
      exhausted: this.exhausted,
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
      playerRoster,
      connectedClientId: this.connectedClientId,
      matchClockMs: this.computeMatchClockMs(timeSec),
    };
  }

  // ── Type guards ──

  private isPacketData(parsed: unknown): parsed is {
    gameState: {
      controlObjectGhostIndex?: number;
      controlObjectData?: Record<string, unknown>;
      compressionPoint?: Vec3;
      cameraFov?: number;
    };
    events: Array<{
      classId: number;
      parsedData?: Record<string, unknown>;
    }>;
    ghosts: Array<{
      index: number;
      type: "create" | "update" | "delete";
      classId?: number;
      parsedData?: Record<string, unknown>;
    }>;
  } {
    return (
      !!parsed &&
      typeof parsed === "object" &&
      "gameState" in parsed &&
      "events" in parsed &&
      "ghosts" in parsed
    );
  }

  private isMoveData(
    parsed: unknown,
  ): parsed is { yaw?: number; pitch?: number } {
    return !!parsed && typeof parsed === "object" && "yaw" in parsed;
  }

  private isInfoData(
    parsed: unknown,
  ): parsed is { value1: number; value2: number } {
    return (
      !!parsed &&
      typeof parsed === "object" &&
      "value1" in parsed &&
      typeof (parsed as { value1?: unknown }).value1 === "number" &&
      "value2" in parsed &&
      typeof (parsed as { value2?: unknown }).value2 === "number"
    );
  }
}

export async function createDemoStreamingRecording(
  data: ArrayBuffer,
): Promise<StreamRecording> {
  const parser = new DemoParser(new Uint8Array(data));
  const { header, initialBlock } = await parser.load();
  const info = extractMissionInfo(initialBlock.demoValues);
  const playback = new StreamingPlayback(parser);

  // Seed StreamEngine's mission info fields from the initial block so they're
  // available immediately (before any server messages arrive during playback).
  playback.missionDisplayName = info.missionDisplayName;
  playback.missionTypeDisplayName = info.missionType;
  playback.gameClassName = info.gameClassName;
  playback.serverDisplayName = info.serverDisplayName;
  playback.connectedPlayerName = info.recorderName;
  playback.connectedClientId = info.recorderClientId;

  return {
    source: "demo",
    duration: header.demoLengthMs / 1000,
    missionName: initialBlock.missionName ?? null,
    gameType: info.missionType,
    serverDisplayName: info.serverDisplayName,
    recorderName: info.recorderName,
    recordingDate: info.recordingDate,
    streamingPlayback: playback,
  };
}
