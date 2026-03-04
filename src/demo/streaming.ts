import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  DemoParser,
} from "t2-demo-parser";
import { Matrix4, Quaternion } from "three";
import { getTerrainHeightAt } from "../terrainHeight";
import type {
  ChatSegment,
  DemoChatMessage,
  DemoThreadState,
  DemoVisual,
  DemoRecording,
  DemoStreamCamera,
  DemoStreamEntity,
  DemoStreamSnapshot,
  DemoStreamingPlayback,
  InventoryHudSlot,
  TeamScore,
  WeaponImageDataBlockState,
  WeaponImageState,
  WeaponsHudSlot,
} from "./types";

type Vec3 = { x: number; y: number; z: number };

type RuntimeControlObject = {
  ghostIndex: number;
  data?: Record<string, unknown>;
  position?: Vec3;
};

type ControlObjectType = "camera" | "player";

interface MutableStreamEntity {
  id: string;
  ghostIndex: number;
  className: string;
  /** Move tick when this ghost instance first entered scope. */
  spawnTick: number;
  type: string;
  dataBlockId?: number;
  shapeHint?: string;
  dataBlock?: string;
  visual?: DemoVisual;
  direction?: [number, number, number];
  weaponShape?: string;
  playerName?: string;
  position?: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number];
  health?: number;
  energy?: number;
  maxEnergy?: number;
  /** Action animation index from ghost ActionMask. */
  actionAnim?: number;
  /** True when the action animation has reached its final frame. */
  actionAtEnd?: boolean;
  /** Torque DamageState: 0 = Enabled, 1 = Disabled (dead), 2 = Destroyed. */
  damageState?: number;
  targetId?: number;
  /** Physics type for per-tick simulation. */
  projectilePhysics?: "linear" | "ballistic" | "seeker";
  /** Computed velocity vector for simulation (Torque space). */
  simulatedVelocity?: [number, number, number];
  /** Datablock gravity modifier (ballistic only, default 1.0). */
  gravityMod?: number;
  /** Resolved explosion DTS shape name (e.g. "disc_explosion.dts"). */
  explosionShape?: string;
  /** Explosion lifetime in ticks from ExplosionData. */
  explosionLifetimeTicks?: number;
  /** Prevents duplicate explosion spawning. */
  hasExploded?: boolean;
  /** Marks ephemeral explosion entities. */
  isExplosion?: boolean;
  /** Auto-removal tick for explosion entities. */
  expiryTick?: number;
  /** Billboard toward camera (Torque's faceViewer). */
  faceViewer?: boolean;
  /** Numeric ID of the ExplosionData datablock (for particle effect resolution). */
  explosionDataBlockId?: number;
  /** Numeric ID of the ParticleEmitterData for in-flight trail particles. */
  maintainEmitterId?: number;
  /** Target's sensor group (team number). */
  sensorGroup?: number;
  /** DTS animation thread states from ghost ThreadMask data. */
  threads?: DemoThreadState[];
  /** Weapon image condition flags from ghost ImageMask data. */
  weaponImageState?: WeaponImageState;
  /** Weapon image state machine states from the ShapeBaseImageData datablock. */
  weaponImageStates?: WeaponImageDataBlockState[];
  /** Tracks the datablock ID for which weaponImageStates was parsed. */
  weaponImageStatesDbId?: number;
  /** Head pitch for blend animations, normalized [-1,1]. */
  headPitch?: number;
  /** Head yaw for blend animations (freelook), normalized [-1,1]. */
  headYaw?: number;
  /** Item physics simulation state (dropped weapons/items). */
  itemPhysics?: {
    velocity: [number, number, number];
    atRest: boolean;
    elasticity: number;
    friction: number;
    gravityMod: number;
  };
}

interface StreamState {
  moveTicks: number;
  /** Absolute yaw tracking, replicated from V12 engine with [0,2π] wrapping. */
  absoluteYaw: number;
  /** Absolute pitch tracking, replicated from V12 engine with clamping. */
  absolutePitch: number;
  lastAbsYaw: number;
  lastAbsPitch: number;
  lastControlType: ControlObjectType;
  isPiloting: boolean;
  lastCameraMode?: number;
  lastOrbitGhostIndex?: number;
  lastOrbitDistance?: number;
  exhausted: boolean;
  latestFov: number;
  latestControl: RuntimeControlObject;
  controlPlayerGhostId?: string;
  camera: DemoStreamCamera | null;
  entitiesById: Map<string, MutableStreamEntity>;
  entityIdByGhostIndex: Map<number, string>;
  lastStatus: { health: number; energy: number };
  nextExplosionId: number;
  /** The recording player's own sensor group (team). */
  playerSensorGroup: number;
  chatMessages: DemoChatMessage[];
  pendingAudioEvents: Array<{ profileId: number; position?: { x: number; y: number; z: number }; timeSec: number }>;
  /** Weapons HUD inventory state driven by RemoteCommandEvents. */
  weaponsHud: {
    /** Map from HUD slot index to ammo count (-1 = infinite). */
    slots: Map<number, number>;
    /** Currently active (selected) HUD slot index, or -1 if none. */
    activeIndex: number;
  };
  /** Backpack/pack HUD state. */
  backpackHud: {
    packIndex: number;
    active: boolean;
    text: string;
  };
  /** Inventory HUD state (grenades, mines, beacons, repair kits). */
  inventoryHud: {
    /** Map from display slot (0-3) to item count. */
    slots: Map<number, number>;
    activeSlot: number;
  };
  /** Team scores aggregated from the PLAYERLIST demoValues section. */
  teamScores: TeamScore[];
}

const TICK_DURATION_MS = 32;

/** Tribes 2 default IFF colors (sRGB 0-255). */
const IFF_GREEN = Object.freeze({ r: 0, g: 255, b: 0 });
const IFF_RED = Object.freeze({ r: 255, g: 0, b: 0 });

const vehicleClassNames = new Set([
  "FlyingVehicle",
  "HoverVehicle",
  "WheeledVehicle",
]);

const projectileClassNames = new Set([
  "BombProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "GrenadeProjectile",
  "LinearFlareProjectile",
  "LinearProjectile",
  "Projectile",
  "SeekerProjectile",
  "TracerProjectile",
]);

const linearProjectileClassNames = new Set([
  "LinearProjectile",
  "TracerProjectile",
  "LinearFlareProjectile",
  "Projectile",
]);

const ballisticProjectileClassNames = new Set([
  "GrenadeProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "BombProjectile",
]);

const seekerProjectileClassNames = new Set(["SeekerProjectile"]);

const deployableClassNames = new Set([
  "StaticShape",
  "ScopeAlwaysShape",
  "Turret",
  "BeaconObject",
  "ForceFieldBare",
]);

/**
 * Mission keeps authority for these classes during demo playback because we do
 * not yet render them from ghost data with full fidelity.
 */
const missionOwnedGhostClassNames = new Set([
  "TSStatic",
  "InteriorInstance",
  "TerrainBlock",
  "Sky",
  "Sun",
  "MissionArea",
  "PhysicalZone",
  "MissionMarker",
  "SpawnSphere",
  "VehicleBlocker",
  "Camera",
]);

const CameraMode_OrbitObject = 3;
const MAX_PITCH = Math.PI * 0.494;

const _rotMat = new Matrix4();
const _rotQuat = new Quaternion();

function extractMissionInfo(demoValues: string[]): {
  missionName: string | null;
  gameType: string | null;
} {
  let missionName: string | null = null;
  let gameType: string | null = null;

  for (let i = 0; i < demoValues.length; i++) {
    if (demoValues[i] !== "readplayerinfo") continue;
    const value = demoValues[i + 1];
    if (!value) continue;

    if (value.startsWith("2\t")) {
      const fields = value.split("\t");
      if (fields[4]) {
        missionName = fields[4];
      }
      continue;
    }

    if (value.startsWith("3\t")) {
      const fields = value.split("\t");
      if (fields[2]) {
        gameType = fields[2];
      }
    }
  }

  return { missionName, gameType };
}

/** Reverse lookup from $BackpackHudData bitmap names to table indices. */
const BACKPACK_BITMAP_TO_INDEX = new Map<string, number>([
  ["gui/hud_new_packammo", 0],
  ["gui/hud_new_packcloak", 1],
  ["gui/hud_new_packenergy", 2],
  ["gui/hud_new_packrepair", 3],
  ["gui/hud_new_packsatchel", 4],
  ["gui/hud_new_packshield", 5],
  ["gui/hud_new_packinventory", 6],
  ["gui/hud_new_packmotionsens", 7],
  ["gui/hud_new_packradar", 8],
  ["gui/hud_new_packturretout", 9],
  ["gui/hud_new_packturretin", 10],
  ["gui/hud_new_packsensjam", 11],
  ["gui/hud_new_packturret", 12], // barrel packs (12-17) share icon
  ["gui/hud_satchel_unarmed", 18],
]);

function backpackBitmapToIndex(bitmap: string): number {
  // Try exact match first, then case-insensitive.
  const lower = bitmap.toLowerCase();
  for (const [key, val] of BACKPACK_BITMAP_TO_INDEX) {
    if (key === lower) return val;
  }
  return -1;
}

interface ParsedDemoValues {
  weaponsHud: { slots: Map<number, number>; activeIndex: number } | null;
  backpackHud: { packIndex: number; active: boolean; text: string } | null;
  inventoryHud: {
    slots: Map<number, number>;
    activeSlot: number;
  } | null;
  teamScores: TeamScore[];
  chatMessages: string[];
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
    chatMessages: [],
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
  // Fields per player: name(0) guid(1) clientId(2) targetId(3) teamId(4)
  //   score(5) ping(6) packetLoss(7) ... (16 fields total)
  if (idx >= demoValues.length) return result;
  const playerCount = parseInt(next(), 10) || 0;
  const playerCountByTeam = new Map<number, number>();
  for (let i = 0; i < playerCount; i++) {
    const fields = next().split("\t");
    const teamId = parseInt(fields[4], 10);
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
  // Skip bitmap entries (we use our own icon mapping).
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
  // The objects are the objectiveHud controls serialized via getValue().
  // Their order and meaning depend on the gameType.
  if (idx >= demoValues.length) return result;
  const scoreHeader = next().split("\t");
  const gameType = scoreHeader[1] ?? "";
  const objCount = parseInt(scoreHeader[2], 10) || 0;
  const scoreObjs: string[] = [];
  for (let i = 0; i < objCount; i++) scoreObjs.push(next());

  // Extract team names and objective scores from the SCORE section based on
  // game type. Combine with player counts from PLAYERLIST.
  if (gameType === "CTFGame" && objCount >= 8) {
    // CTFGame objectiveHud layout (per setupObjHud in objectiveHud.cs):
    //   for each team (1..2): teamName, teamScore, flagLabel, flagLocation
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
    // TR2Game objectiveHud layout (per setupObjHud in objectiveHud.cs):
    //   for each team (1..2): teamScore, teamName
    //   then: carrierName, carrierHealth
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

  // CLOCK: 1 value
  if (idx >= demoValues.length) return result;
  next();

  // CHAT: always 10 entries
  for (let i = 0; i < 10; i++) {
    if (idx >= demoValues.length) break;
    const line = next();
    if (line) {
      result.chatMessages.push(line);
    }
  }

  // GRAVITY: 1 value — skip

  return result;
}

function isValidPosition(
  pos: { x: number; y: number; z: number } | undefined | null,
): pos is { x: number; y: number; z: number } {
  return (
    pos != null &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y) &&
    Number.isFinite(pos.z)
  );
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function yawPitchToQuaternion(
  yaw: number,
  pitch: number,
): [number, number, number, number] {
  const sx = Math.sin(pitch);
  const cx = Math.cos(pitch);
  const sz = Math.sin(yaw);
  const cz = Math.cos(yaw);

  _rotMat.set(
    -sz,
    cz * sx,
    -cz * cx,
    0,
    0,
    cx,
    sx,
    0,
    cz,
    sz * sx,
    -sz * cx,
    0,
    0,
    0,
    0,
    1,
  );

  _rotQuat.setFromRotationMatrix(_rotMat);
  return [_rotQuat.x, _rotQuat.y, _rotQuat.z, _rotQuat.w];
}

function playerYawToQuaternion(rotZ: number): [number, number, number, number] {
  const halfAngle = -rotZ / 2;
  return [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)];
}

function torqueQuatToThreeJS(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): [number, number, number, number] | null {
  if (
    !Number.isFinite(q.x) ||
    !Number.isFinite(q.y) ||
    !Number.isFinite(q.z) ||
    !Number.isFinite(q.w)
  ) {
    return null;
  }

  // Match mission axis-angle conversion: axis swizzle (x,y,z)->(y,z,x)
  // and inverted rotation direction (negated imaginary components).
  const x = -q.y;
  const y = -q.z;
  const z = -q.x;
  const w = q.w;

  const lenSq = x * x + y * y + z * z + w * w;
  if (lenSq <= 1e-12) {
    return null;
  }

  const invLen = 1 / Math.sqrt(lenSq);
  return [x * invLen, y * invLen, z * invLen, w * invLen];
}

function shouldRenderGhostEntity(entity: MutableStreamEntity): boolean {
  if (entity.spawnTick > 0) return true;
  return !missionOwnedGhostClassNames.has(entity.className);
}

function stripTaggedStringMarkup(s: string): string {
  let stripped = "";
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 0x20) {
      stripped += s[i];
    }
  }
  return stripped;
}

/**
 * Byte-to-fontColors-index remap table from the Torque V12 renderer (dgl.cc).
 *
 * TorqueScript `\cN` escapes are encoded via `collapseRemap` in scan.l,
 * producing byte values that skip \t (0x9), \n (0xa), and \r (0xd):
 *   \c0→0x2, \c1→0x3, \c2→0x4, \c3→0x5, \c4→0x6,
 *   \c5→0x7, \c6→0x8, \c7→0xb, \c8→0xc, \c9→0xe
 *
 * The renderer remaps those bytes back to fontColors[0–9]:
 *   byte 0x2→0, 0x3→1, 0x4→2, 0x5→3, 0x6→4,
 *   0x7→5, 0x8→6, 0xb→7, 0xc→8, 0xe→9
 */
const BYTE_TO_COLOR_INDEX: Record<number, number> = {
  0x2: 0,
  0x3: 1,
  0x4: 2,
  0x5: 3,
  0x6: 4,
  0x7: 5,
  0x8: 6,
  0xb: 7,
  0xc: 8,
  0xe: 9,
};

/** Special bytes: \cr = 0xf (reset), \cp = 0x10 (push), \co = 0x11 (pop). */
const BYTE_COLOR_RESET = 0x0f;
const BYTE_COLOR_PUSH = 0x10;
const BYTE_COLOR_POP = 0x11;

/**
 * Extract the leading Torque \c color index (0–9) from a tagged string.
 * Raw bytes are remapped from the collapseRemap encoding to fontColors indices.
 */
function detectColorCode(s: string): number | undefined {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const colorIndex = BYTE_TO_COLOR_INDEX[code];
    if (colorIndex !== undefined) return colorIndex;
    if (code >= 0x20) return undefined;
  }
  return undefined;
}

/**
 * Parse a raw Torque HudMessageVector line into colored segments.
 * Handles tagged string markup (\cp=0x10 push / \co=0x11 pop regions for
 * player names), color code switches (remapped byte values), and \cr=0x0f
 * color reset.
 */
function parseColorSegments(raw: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  let currentColor = 0;
  let currentText = "";
  let inTaggedString = false;

  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);

    if (code === BYTE_COLOR_PUSH) {
      // \cp — push color / start of tagged string region.
      inTaggedString = true;
      continue;
    }
    if (code === BYTE_COLOR_POP) {
      // \co — pop color / end of tagged string region.
      inTaggedString = false;
      continue;
    }

    if (inTaggedString) {
      // Inside tagged string: only keep printable chars, skip markup bytes.
      if (code >= 0x20) {
        currentText += raw[i];
      }
      continue;
    }

    // Outside tagged string.
    const colorIndex = BYTE_TO_COLOR_INDEX[code];
    if (colorIndex !== undefined) {
      // Color code switch.
      if (currentText) {
        segments.push({ text: currentText, colorCode: currentColor });
        currentText = "";
      }
      currentColor = colorIndex;
    } else if (code === BYTE_COLOR_RESET) {
      // \cr — reset to default color.
      if (currentText) {
        segments.push({ text: currentText, colorCode: currentColor });
        currentText = "";
      }
      currentColor = 0;
    } else if (code >= 0x20) {
      currentText += raw[i];
    }
  }

  if (currentText) {
    segments.push({ text: currentText, colorCode: currentColor });
  }
  return segments;
}

/** Extract an embedded `~w<path>` sound tag from a message string. */
function extractWavTag(text: string): { text: string; wavPath: string | null } {
  const idx = text.indexOf("~w");
  if (idx === -1) return { text, wavPath: null };
  return {
    text: text.substring(0, idx),
    wavPath: text.substring(idx + 2),
  };
}

function toEntityType(className: string): string {
  if (className === "Player") return "Player";
  if (vehicleClassNames.has(className)) return "Vehicle";
  if (className === "Item") return "Item";
  if (projectileClassNames.has(className)) return "Projectile";
  if (deployableClassNames.has(className)) return "Deployable";
  return "Ghost";
}

function toEntityId(className: string, ghostIndex: number): string {
  if (className === "Player") return `player_${ghostIndex}`;
  if (vehicleClassNames.has(className)) return `vehicle_${ghostIndex}`;
  if (className === "Item") return `item_${ghostIndex}`;
  if (projectileClassNames.has(className)) return `projectile_${ghostIndex}`;
  if (deployableClassNames.has(className)) return `deployable_${ghostIndex}`;
  return `ghost_${ghostIndex}`;
}

function isQuatLike(value: unknown): value is {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    typeof (value as { z?: unknown }).z === "number" &&
    typeof (value as { w?: unknown }).w === "number"
  );
}

function isVec3Like(
  value: unknown,
): value is { x: number; y: number; z: number } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    typeof (value as { z?: unknown }).z === "number"
  );
}

function toShapeNameFromDataBlock(
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) return undefined;
  const candidates = [
    data.shapeName,
    data.projectileShapeName,
    data.shapeFileName,
    data.shapeFile,
    data.model,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function getNumberField(
  data: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Extract the weapon image state machine states from a ShapeBaseImageData
 * datablock. The parser emits a dense array (skipping unnamed states), but
 * the transition indices reference original positions 0-30.
 *
 * CRITICAL: The parser's field names for transitions are MISALIGNED with
 * the actual engine packing order. The V12 engine packs transitions as:
 *   loaded[0], loaded[1], ammo[0], ammo[1], target[0], target[1],
 *   wet[0], wet[1], trigger[0], trigger[1], timeout
 * But the parser named the first two "transitionOnAmmo/transitionOnNoAmmo"
 * when they're actually loaded[0]/loaded[1]. Every field is shifted by 2.
 *
 * Additionally, the engine writes `value+1` (to encode -1 as 0) but the
 * parser reads the raw value without subtracting 1. So the raw sentinel
 * for "no transition" is 0, and all state indices are off by +1.
 */
function parseWeaponImageStates(
  blockData: Record<string, unknown>,
): WeaponImageDataBlockState[] | undefined {
  const rawStates = blockData.states as
    | Array<Record<string, unknown>>
    | undefined;
  if (!Array.isArray(rawStates) || rawStates.length === 0) return undefined;

  return rawStates.map((s) => {
    // Subtract 1 to reverse the engine's +1 offset. Raw 0 → -1 (no transition).
    const remap = (v: unknown): number => {
      const n = v as number;
      if (n == null) return -1;
      return n - 1;
    };

    // Remap parser field names to actual engine field meanings.
    // Parser reads 11 values in order, but names them wrong:
    //   Parser field            → Actual engine field
    //   transitionOnAmmo        → loaded[0] (notLoaded)
    //   transitionOnNoAmmo      → loaded[1] (loaded)
    //   transitionOnTarget      → ammo[0]   (noAmmo)
    //   transitionOnNoTarget    → ammo[1]   (ammo)
    //   transitionOnWet         → target[0] (noTarget)
    //   transitionOnNotWet      → target[1] (target)
    //   transitionOnTriggerUp   → wet[0]    (notWet)
    //   transitionOnTriggerDown → wet[1]    (wet)
    //   transitionOnTimeout     → trigger[0](triggerUp)
    //   transitionGeneric0In    → trigger[1](triggerDown)
    //   transitionGeneric0Out   → timeout
    return {
      name: (s.name as string) ?? "",
      transitionOnNotLoaded: remap(s.transitionOnAmmo),
      transitionOnLoaded: remap(s.transitionOnNoAmmo),
      transitionOnNoAmmo: remap(s.transitionOnTarget),
      transitionOnAmmo: remap(s.transitionOnNoTarget),
      transitionOnNoTarget: remap(s.transitionOnWet),
      transitionOnTarget: remap(s.transitionOnNotWet),
      transitionOnNotWet: remap(s.transitionOnTriggerUp),
      transitionOnWet: remap(s.transitionOnTriggerDown),
      transitionOnTriggerUp: remap(s.transitionOnTimeout),
      transitionOnTriggerDown: remap(s.transitionGeneric0In),
      transitionOnTimeout: remap(s.transitionGeneric0Out),
      timeoutValue: s.timeoutValue as number | undefined,
      waitForTimeout: (s.waitForTimeout as boolean) ?? false,
      fire: (s.fire as boolean) ?? false,
      sequence: s.sequence as number | undefined,
      spin: (s.spin as number) ?? 0,
      direction: (s.direction as boolean) ?? true,
      scaleAnimation: (s.scaleAnimation as boolean) ?? false,
      loaded: (s.loaded as number) ?? 0,
      soundDataBlockId: (s.sound as number) ?? -1,
    };
  });
}

function getStringField(
  data: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function getBooleanField(
  data: Record<string, unknown> | undefined,
  keys: readonly string[],
): boolean | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function resolveTracerVisual(
  className: string,
  data: Record<string, unknown> | undefined,
): DemoVisual | undefined {
  if (!data) return undefined;

  const texture =
    getStringField(data, ["tracerTex0", "textureName0", "texture0"]) ?? "";
  const hasTracerHints =
    className === "TracerProjectile" ||
    (texture.length > 0 && getNumberField(data, ["tracerLength"]) != null);
  if (!hasTracerHints || !texture) return undefined;

  const crossTexture = getStringField(data, [
    "tracerTex1",
    "textureName1",
    "texture1",
  ]);

  // t2-demo-parser vends TracerProjectileData fields with some legacy names.
  // Accept both canonical script names and parser-specific aliases.
  const tracerLength = getNumberField(data, ["tracerLength"]) ?? 10;
  const canonicalTracerWidth = getNumberField(data, ["tracerWidth"]);
  const aliasTracerWidth = getNumberField(data, ["tracerAlpha"]);
  const tracerWidth =
    canonicalTracerWidth != null &&
    (getNumberField(data, ["crossViewAng"]) != null ||
      canonicalTracerWidth <= 0.7)
      ? canonicalTracerWidth
      : (aliasTracerWidth ?? canonicalTracerWidth ?? 0.5);
  const crossViewAng =
    getNumberField(data, ["crossViewAng", "crossViewFraction"]) ??
    // Parser alias fallback: "tracerWidth" may actually contain crossViewAng.
    (typeof data.tracerWidth === "number" && data.tracerWidth > 0.7
      ? data.tracerWidth
      : 0.98);
  const crossSize =
    getNumberField(data, ["crossSize", "muzzleVelocity"]) ?? 0.45;
  const renderCross =
    getBooleanField(data, ["renderCross", "proximityRadius"]) ?? true;

  return {
    kind: "tracer",
    texture,
    crossTexture,
    tracerLength,
    tracerWidth,
    crossViewAng,
    crossSize,
    renderCross,
  };
}

/**
 * Resolve a billboard-sprite visual for flare-style projectiles
 * (LinearFlareProjectile, FlareProjectile). These render as camera-facing
 * quads in the engine rather than 3D models.
 */
function resolveSpriteVisual(
  className: string,
  data: Record<string, unknown> | undefined,
): DemoVisual | undefined {
  if (!data) return undefined;

  if (className === "LinearFlareProjectile") {
    // Parser fields: flareTexture (flareModTexture in script),
    // smokeTexture (flareBaseTexture in script — the circular glow).
    const texture = getStringField(data, ["smokeTexture", "flareTexture"]);
    if (!texture) return undefined;
    const color = data.flareColor as
      | { r: number; g: number; b: number }
      | undefined;
    const size = getNumberField(data, ["size"]) ?? 0.5;
    return {
      kind: "sprite",
      texture,
      color: color
        ? { r: color.r, g: color.g, b: color.b }
        : { r: 1, g: 1, b: 1 },
      size,
    };
  }

  if (className === "FlareProjectile") {
    const texture = getStringField(data, ["flareTexture"]);
    if (!texture) return undefined;
    const size = getNumberField(data, ["size"]) ?? 4.0;
    return {
      kind: "sprite",
      texture,
      color: { r: 1, g: 0.9, b: 0.5 },
      size,
    };
  }

  return undefined;
}

function detectControlObjectType(
  data: Record<string, unknown> | undefined,
): ControlObjectType | null {
  if (!data) return null;
  if (typeof data.cameraMode === "number") return "camera";
  if (typeof data.rotationZ === "number") return "player";
  return null;
}

class StreamingPlayback implements DemoStreamingPlayback {
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
      sensorGroup: number;
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
  };
  private readonly registry;
  private readonly netStrings = new Map<number, string>();
  private readonly targetNames = new Map<number, string>();
  private readonly targetTeams = new Map<number, number>();
  /** IFF color map: for the viewer's sensorGroup, map target sensorGroup → RGB. */
  private readonly sensorGroupColors = new Map<
    number,
    Map<number, { r: number; g: number; b: number }>
  >();
  private state: StreamState;

  constructor(parser: DemoParser) {
    this.parser = parser;
    this.registry = parser.getRegistry();
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
    };

    this.state = {
      moveTicks: 0,
      absoluteYaw: 0,
      absolutePitch: 0,
      lastAbsYaw: 0,
      lastAbsPitch: 0,
      lastControlType: "player",
      isPiloting: false,
      lastOrbitDistance: undefined,
      exhausted: false,
      latestFov: 100,
      latestControl: {
        ghostIndex: initial.controlObjectGhostIndex,
        data: initial.controlObjectData,
        position: isValidPosition(initial.controlObjectData?.position as Vec3)
          ? (initial.controlObjectData?.position as Vec3)
          : undefined,
      },
      camera: null,
      entitiesById: new Map(),
      entityIdByGhostIndex: new Map(),
      lastStatus: { health: 1, energy: 1 },
      nextExplosionId: 0,
      playerSensorGroup: 0,
      chatMessages: [],
      pendingAudioEvents: [],
      weaponsHud: { slots: new Map(), activeIndex: -1 },
      backpackHud: { packIndex: -1, active: false, text: "" },
      inventoryHud: { slots: new Map(), activeSlot: -1 },
      teamScores: [],
    };

    this.reset();
  }

  reset(): void {
    this.parser.reset();

    this.netStrings.clear();
    this.targetNames.clear();
    this.targetTeams.clear();
    this.sensorGroupColors.clear();
    this.state.entitiesById.clear();
    this.state.entityIdByGhostIndex.clear();

    for (const [id, value] of this.initialBlock.taggedStrings) {
      this.netStrings.set(id, value);
    }
    for (const entry of this.initialBlock.targetEntries) {
      if (entry.name) {
        this.targetNames.set(
          entry.targetId,
          stripTaggedStringMarkup(entry.name),
        );
      }
      this.targetTeams.set(entry.targetId, entry.sensorGroup);
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

    this.state.playerSensorGroup = 0;
    this.state.chatMessages = [];
    this.state.pendingAudioEvents = [];
    this.state.weaponsHud = { slots: new Map(), activeIndex: -1 };
    this.state.backpackHud = { packIndex: -1, active: false, text: "" };
    this.state.inventoryHud = { slots: new Map(), activeSlot: -1 };
    this.state.teamScores = [];
    this.state.moveTicks = 0;
    this.state.absoluteYaw = 0;
    this.state.absolutePitch = 0;
    this.state.lastAbsYaw = 0;
    this.state.lastAbsPitch = 0;
    this.state.lastControlType =
      detectControlObjectType(this.initialBlock.controlObjectData) ?? "player";
    this.state.isPiloting =
      this.state.lastControlType === "player"
        ? !!(
            this.initialBlock.controlObjectData?.pilot ||
            this.initialBlock.controlObjectData?.controlObjectGhost != null
          )
        : false;
    this.state.lastCameraMode =
      this.state.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.cameraMode === "number"
        ? this.initialBlock.controlObjectData.cameraMode
        : undefined;
    this.state.lastOrbitGhostIndex =
      this.state.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.orbitObjectGhostIndex ===
        "number"
        ? this.initialBlock.controlObjectData.orbitObjectGhostIndex
        : undefined;
    if (this.state.lastControlType === "camera") {
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
        this.state.lastOrbitDistance = Math.max(0, maxOrbit - minOrbit);
      } else if (typeof curOrbit === "number" && Number.isFinite(curOrbit)) {
        this.state.lastOrbitDistance = Math.max(0, curOrbit);
      } else {
        this.state.lastOrbitDistance = undefined;
      }
    } else {
      this.state.lastOrbitDistance = undefined;
    }
    const initialAbsRot = this.getAbsoluteRotation(
      this.initialBlock.controlObjectData,
    );
    if (initialAbsRot) {
      this.state.absoluteYaw = initialAbsRot.yaw;
      this.state.absolutePitch = initialAbsRot.pitch;
      this.state.lastAbsYaw = initialAbsRot.yaw;
      this.state.lastAbsPitch = initialAbsRot.pitch;
    }
    this.state.exhausted = false;
    this.state.latestFov = 100;
    this.state.latestControl = {
      ghostIndex: this.initialBlock.controlObjectGhostIndex,
      data: this.initialBlock.controlObjectData,
      position: isValidPosition(
        this.initialBlock.controlObjectData?.position as Vec3,
      )
        ? (this.initialBlock.controlObjectData?.position as Vec3)
        : undefined,
    };
    this.state.controlPlayerGhostId =
      this.state.lastControlType === "player" &&
      this.initialBlock.controlObjectGhostIndex >= 0
        ? `player_${this.initialBlock.controlObjectGhostIndex}`
        : undefined;
    this.state.camera = null;
    this.state.lastStatus = { health: 1, energy: 1 };
    this.state.nextExplosionId = 0;

    for (const ghost of this.initialBlock.initialGhosts) {
      if (ghost.type !== "create" || ghost.classId == null) continue;
      const className =
        this.registry.getGhostParser(ghost.classId)?.name ??
        `ghost_${ghost.classId}`;
      const id = toEntityId(className, ghost.index);
      const entity: MutableStreamEntity = {
        id,
        ghostIndex: ghost.index,
        className,
        spawnTick: 0,
        type: toEntityType(className),
        rotation: [0, 0, 0, 1],
      };
      this.applyGhostData(entity, ghost.parsedData);
      this.state.entitiesById.set(id, entity);
      this.state.entityIdByGhostIndex.set(ghost.index, id);
    }

    // Derive playerSensorGroup from the control player entity if not yet set
    // (the SetSensorGroupEvent may not have arrived in the initial block).
    if (
      this.state.playerSensorGroup === 0 &&
      this.state.lastControlType === "player" &&
      this.state.latestControl.ghostIndex >= 0
    ) {
      const ctrlId = this.state.entityIdByGhostIndex.get(
        this.state.latestControl.ghostIndex,
      );
      const ctrlEntity = ctrlId
        ? this.state.entitiesById.get(ctrlId)
        : undefined;
      if (ctrlEntity?.sensorGroup != null && ctrlEntity.sensorGroup > 0) {
        this.state.playerSensorGroup = ctrlEntity.sensorGroup;
      }
    }

    // Process initial events (guaranteed events pending in the connection's
    // event queue at recording start).
    for (const evt of this.initialBlock.initialEvents) {
      const eventName = this.registry.getEventParser(evt.classId)?.name;
      if (eventName === "SetSensorGroupEvent" && evt.parsedData) {
        const sg = evt.parsedData.sensorGroup as number | undefined;
        if (sg != null) this.state.playerSensorGroup = sg;
      } else if (eventName === "RemoteCommandEvent" && evt.parsedData) {
        const funcName = this.resolveNetString(
          evt.parsedData.funcName as string,
        );
        const args = evt.parsedData.args as string[];
        this.handleHudRemoteCommand(funcName, args);
      }
    }

    // Seed HUD state from demoValues (the $DemoValue console variable
    // snapshot captured at recording start by saveDemoSettings/getState).
    const parsed = parseDemoValues(this.initialBlock.demoValues);
    if (parsed.weaponsHud) {
      this.state.weaponsHud.slots = parsed.weaponsHud.slots;
      this.state.weaponsHud.activeIndex = parsed.weaponsHud.activeIndex;
    }
    if (parsed.backpackHud) {
      this.state.backpackHud.packIndex = parsed.backpackHud.packIndex;
      this.state.backpackHud.active = parsed.backpackHud.active;
      this.state.backpackHud.text = parsed.backpackHud.text;
    }
    if (parsed.inventoryHud) {
      this.state.inventoryHud.slots = parsed.inventoryHud.slots;
      this.state.inventoryHud.activeSlot = parsed.inventoryHud.activeSlot;
    }
    this.state.teamScores = parsed.teamScores;
    // Seed chat messages at time 0 so they appear at start and fade naturally.
    // Raw lines from HudMessageVector contain Torque control chars: collapsed
    // color bytes (0x02–0x0e via collapseRemap), tagged string markup
    // (\x10/\x11 for player names), and color reset (\x0f).
    for (const rawLine of parsed.chatMessages) {
      const segments = parseColorSegments(rawLine);
      if (!segments.length) continue;
      const fullText = segments.map((s) => s.text).join("");
      if (!fullText.trim()) continue;
      // Determine overall color and kind from the first segment.
      const primaryColor = segments[0].colorCode;
      // Player chat lines use \c3 (team green, byte 0x05) or \c4 (global
      // cyan, byte 0x06). Canned chat (voicebinds) may start with a c0
      // "[VGS] " prefix before the colored name. Detect player chat by
      // looking for a ": " separator and a chat color in any segment.
      const hasChatColor = segments.some(
        (s) => s.colorCode === 3 || s.colorCode === 4
      );
      const isPlayerChat = hasChatColor && fullText.includes(": ");
      if (isPlayerChat) {
        const colonIdx = fullText.indexOf(": ");
        this.state.chatMessages.push({
          timeSec: 0,
          sender: fullText.slice(0, colonIdx),
          text: fullText.slice(colonIdx + 2),
          kind: "chat",
          colorCode: primaryColor,
          segments,
        });
      } else {
        this.state.chatMessages.push({
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

  getSnapshot(): DemoStreamSnapshot {
    return this.buildSnapshot();
  }

  getEffectShapes(): string[] {
    const shapes = new Set<string>();
    for (const [, block] of this.initialBlock.dataBlocks) {
      const explosionId = block.data?.explosion as number | undefined;
      if (explosionId == null) continue;
      const expBlock = this.getDataBlockData(explosionId);
      const shape = expBlock?.dtsFileName as string | undefined;
      if (shape) shapes.add(shape);
    }
    return [...shapes];
  }

  stepToTime(
    targetTimeSec: number,
    maxMoveTicks = Number.POSITIVE_INFINITY,
  ): DemoStreamSnapshot {
    const safeTargetSec = Number.isFinite(targetTimeSec)
      ? Math.max(0, targetTimeSec)
      : 0;
    const targetTicks = Math.floor((safeTargetSec * 1000) / TICK_DURATION_MS);

    if (targetTicks < this.state.moveTicks) {
      this.reset();
    }

    let movesProcessed = 0;
    while (
      !this.state.exhausted &&
      this.state.moveTicks < targetTicks &&
      movesProcessed < maxMoveTicks
    ) {
      if (!this.stepOneMoveTick()) {
        break;
      }
      movesProcessed += 1;
    }

    return this.buildSnapshot();
  }

  private stepOneMoveTick(): boolean {
    while (true) {
      const block = this.parser.nextBlock();
      if (!block) {
        this.state.exhausted = true;
        return false;
      }

      this.handleBlock(block);

      if (block.type === BlockTypeMove) {
        this.state.moveTicks += 1;
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
      const controlData = packet.gameState.controlObjectData;
      const prevControl = this.state.latestControl;
      const nextGhostIndex =
        typeof packet.gameState.controlObjectGhostIndex === "number"
          ? packet.gameState.controlObjectGhostIndex
          : prevControl.ghostIndex;
      const compressionPoint = packet.gameState.compressionPoint;
      const controlPosition = isValidPosition(controlData?.position as Vec3)
        ? (controlData?.position as Vec3)
        : isValidPosition(compressionPoint)
          ? compressionPoint
          : prevControl.position;

      this.state.latestControl = {
        ghostIndex: nextGhostIndex,
        data: controlData,
        position: controlPosition,
      };

      // When the control object changes, try to derive playerSensorGroup
      // from the new ghost's already-known sensorGroup.
      if (nextGhostIndex !== prevControl.ghostIndex) {
        const entityId = this.state.entityIdByGhostIndex.get(nextGhostIndex);
        const entity = entityId
          ? this.state.entitiesById.get(entityId)
          : undefined;
        if (entity?.sensorGroup != null && entity.sensorGroup > 0) {
          this.state.playerSensorGroup = entity.sensorGroup;
        }
      }

      if (controlData) {
        const detected = detectControlObjectType(controlData);
        if (detected) {
          this.state.lastControlType = detected;
        }

        if (this.state.lastControlType === "player") {
          this.state.isPiloting = !!(
            controlData.pilot || controlData.controlObjectGhost != null
          );
        } else {
          this.state.isPiloting = false;
          if (typeof controlData.cameraMode === "number") {
            this.state.lastCameraMode = controlData.cameraMode;
            if (controlData.cameraMode === CameraMode_OrbitObject) {
              if (typeof controlData.orbitObjectGhostIndex === "number") {
                this.state.lastOrbitGhostIndex =
                  controlData.orbitObjectGhostIndex;
              }
              const minOrbit = controlData.minOrbitDist as number | undefined;
              const maxOrbit = controlData.maxOrbitDist as number | undefined;
              const curOrbit = controlData.curOrbitDist as number | undefined;
              if (
                typeof minOrbit === "number" &&
                typeof maxOrbit === "number" &&
                Number.isFinite(minOrbit) &&
                Number.isFinite(maxOrbit)
              ) {
                this.state.lastOrbitDistance = Math.max(0, maxOrbit - minOrbit);
              } else if (
                typeof curOrbit === "number" &&
                Number.isFinite(curOrbit)
              ) {
                this.state.lastOrbitDistance = Math.max(0, curOrbit);
              }
            } else {
              this.state.lastOrbitGhostIndex = undefined;
              this.state.lastOrbitDistance = undefined;
            }
          }
        }

        // Apply ghost rotation to absolute tracking. This must happen before
        // the next move delta so that our tracking stays calibrated to V12.
        const absRot = this.getAbsoluteRotation(controlData);
        if (absRot) {
          this.state.absoluteYaw = absRot.yaw;
          this.state.absolutePitch = absRot.pitch;
          this.state.lastAbsYaw = absRot.yaw;
          this.state.lastAbsPitch = absRot.pitch;
        }
      }

      for (const evt of packet.events) {
        const eventName = this.registry.getEventParser(evt.classId)?.name;
        if (eventName === "NetStringEvent" && evt.parsedData) {
          const id = evt.parsedData.id as number | undefined;
          const value = evt.parsedData.value as string | undefined;
          if (id != null && typeof value === "string") {
            this.netStrings.set(id, value);
          }
          continue;
        }

        if (eventName === "TargetInfoEvent" && evt.parsedData) {
          const targetId = evt.parsedData.targetId as number | undefined;
          const nameTag = evt.parsedData.nameTag as number | undefined;
          if (targetId != null && nameTag != null) {
            const resolved = this.netStrings.get(nameTag);
            if (resolved) {
              this.targetNames.set(targetId, stripTaggedStringMarkup(resolved));
            }
          }
          const sensorGroup = evt.parsedData.sensorGroup as number | undefined;
          if (targetId != null && sensorGroup != null) {
            this.targetTeams.set(targetId, sensorGroup);
          }
        } else if (eventName === "SetSensorGroupEvent" && evt.parsedData) {
          const sg = evt.parsedData.sensorGroup as number | undefined;
          if (sg != null) this.state.playerSensorGroup = sg;
        } else if (eventName === "SensorGroupColorEvent" && evt.parsedData) {
          const sg = evt.parsedData.sensorGroup as number;
          const colors = evt.parsedData.colors as
            | Array<{
                index: number;
                r?: number;
                g?: number;
                b?: number;
                default?: boolean;
              }>
            | undefined;
          if (colors) {
            let map = this.sensorGroupColors.get(sg);
            if (!map) {
              map = new Map();
              this.sensorGroupColors.set(sg, map);
            }
            for (const c of colors) {
              if (c.default) {
                map.delete(c.index);
              } else {
                map.set(c.index, {
                  r: c.r ?? 0,
                  g: c.g ?? 0,
                  b: c.b ?? 0,
                });
              }
            }
          }
        } else if (eventName === "RemoteCommandEvent" && evt.parsedData) {
          const funcName = this.resolveNetString(
            evt.parsedData.funcName as string,
          );
          const args = evt.parsedData.args as string[];
          const timeSec = this.state.moveTicks * (TICK_DURATION_MS / 1000);

          if (funcName === "ChatMessage" && args.length >= 4) {
            // ChatMessage args: 0=clientId, 1=voice, 2=pitch,
            // 3=template (e.g. '\c3%1: %2'), 4+=substitution args.
            // Detect team (\c3) vs global (\c4) from the template's
            // leading color code before it's stripped.
            const rawTemplate = this.resolveNetString(args[3]);
            const colorCode = detectColorCode(rawTemplate);
            // Extract sender name from args[4] (%1) and message from
            // the formatted text. args[0] is the client object ID, not
            // the player name.
            const sender = args[4]
              ? stripTaggedStringMarkup(this.resolveNetString(args[4]))
              : "";
            const rawText = this.formatRemoteArgs(args[3], args.slice(4));
            if (rawText) {
              // The formatted text is "Name: message"; extract just the
              // message portion since we already have the sender name.
              const colonIdx = rawText.indexOf(": ");
              const text = colonIdx >= 0 ? rawText.slice(colonIdx + 2) : rawText;
              const { text: displayText, wavPath } = extractWavTag(text);
              let soundPath: string | undefined;
              let soundPitch: number | undefined;
              if (wavPath) {
                const voice = this.resolveNetString(args[1]);
                if (voice) {
                  soundPath = `voice/${voice}/${wavPath}.wav`;
                } else {
                  soundPath = wavPath;
                }
                const pitchStr = this.resolveNetString(args[2]);
                if (pitchStr) {
                  const p = parseFloat(pitchStr);
                  if (Number.isFinite(p)) {
                    soundPitch = Math.max(0.5, Math.min(2.0, p));
                  }
                }
              }
              const cc = colorCode ?? 0;
              this.pushChatMessage({
                timeSec,
                sender,
                text: displayText,
                kind: "chat",
                colorCode: cc,
                segments: [
                  {
                    text: sender ? `${sender}: ${displayText}` : displayText,
                    colorCode: cc,
                  },
                ],
                soundPath,
                soundPitch,
              });
            }
          } else if (
            funcName === "CannedChatMessage" &&
            args.length >= 6
          ) {
            // CannedChatMessage args (from cannedChatMessageClient):
            //   0: sender (client ID), 1: msgString (template with %1/%2),
            //   2: name, 3: string (voice text, may contain ~w),
            //   4: keys (e.g. "VGS"), 5: voiceTag, 6: voicePitch
            // The template uses %1=name, %2=string. The ~w tag is typically
            // embedded in args[3], so it only appears after substitution.
            const cannedColorCode = detectColorCode(
              this.resolveNetString(args[1]),
            );
            const name = stripTaggedStringMarkup(
              this.resolveNetString(args[2]),
            );
            const keys = stripTaggedStringMarkup(
              this.resolveNetString(args[4]),
            );
            const sender = name;
            // Substitute %1/%2 in the template, then extract ~w.
            const rawText = this.formatRemoteArgs(args[1], args.slice(2));
            if (rawText) {
              const { wavPath } = extractWavTag(rawText);
              // Build display text from the individual resolved components
              // rather than the template (which includes "name: " redundantly
              // with the separate sender field).
              const voiceLine = extractWavTag(
                stripTaggedStringMarkup(this.resolveNetString(args[3])),
              ).text;
              const text = voiceLine;

              let soundPath: string | undefined;
              let soundPitch: number | undefined;
              if (wavPath) {
                const voice = this.resolveNetString(args[5]);
                if (voice) {
                  soundPath = `voice/${voice}/${wavPath}.wav`;
                } else {
                  soundPath = wavPath;
                }
                if (args[6]) {
                  const p = parseFloat(this.resolveNetString(args[6]));
                  if (Number.isFinite(p)) {
                    soundPitch = Math.max(0.5, Math.min(2.0, p));
                  }
                }
              }
              const cc = cannedColorCode ?? 0;
              const cannedSegments: ChatSegment[] = [];
              if (keys) {
                cannedSegments.push({
                  text: `[${keys}] `,
                  colorCode: 0,
                });
              }
              cannedSegments.push({
                text: sender ? `${sender}: ${text}` : text,
                colorCode: cc,
              });
              this.pushChatMessage({
                timeSec,
                sender,
                text,
                kind: "chat",
                colorCode: cc,
                segments: cannedSegments,
                soundPath,
                soundPitch,
              });
            }
          } else if (funcName === "ServerMessage" && args.length >= 2) {
            const rawTemplate = this.resolveNetString(args[1]);
            const serverColorCode = detectColorCode(rawTemplate);
            const rawText = this.formatRemoteArgs(args[1], args.slice(2));
            if (rawText) {
              const { text, wavPath } = extractWavTag(rawText);
              const scc = serverColorCode ?? 0;
              this.pushChatMessage({
                timeSec,
                sender: "",
                text,
                kind: "server",
                colorCode: scc,
                segments: [{ text, colorCode: scc }],
                soundPath: wavPath ?? undefined,
              });
            }
          } else {
            this.handleHudRemoteCommand(funcName, args);
          }
        } else if (
          (eventName === "Sim3DAudioEvent" ||
            eventName === "Sim2DAudioEvent") &&
          evt.parsedData
        ) {
          const profileId = evt.parsedData.profileId as number;
          if (typeof profileId === "number") {
            const timeSec = this.state.moveTicks * (TICK_DURATION_MS / 1000);
            const position =
              eventName === "Sim3DAudioEvent"
                ? (evt.parsedData.position as
                    | { x: number; y: number; z: number }
                    | undefined)
                : undefined;
            this.state.pendingAudioEvents.push({ profileId, position, timeSec });
            if (this.state.pendingAudioEvents.length > 100) {
              this.state.pendingAudioEvents.splice(
                0,
                this.state.pendingAudioEvents.length - 100,
              );
            }
          }
        }
      }

      for (const ghost of packet.ghosts) {
        this.applyPacketGhost(ghost);
      }

      return;
    }

    if (block.type === BlockTypeInfo && this.isInfoData(block.parsed)) {
      if (Number.isFinite(block.parsed.value2)) {
        this.state.latestFov = block.parsed.value2;
      }
      return;
    }

    if (block.type === BlockTypeMove && this.isMoveData(block.parsed)) {
      // Replicate V12 Player::updateMove(): apply delta then wrap/clamp.
      this.state.absoluteYaw += block.parsed.yaw ?? 0;
      // V12 wraps yaw to [0, 2π] each tick.
      const TWO_PI = Math.PI * 2;
      this.state.absoluteYaw =
        ((this.state.absoluteYaw % TWO_PI) + TWO_PI) % TWO_PI;
      // V12 clamps pitch to [minLookAngle, maxLookAngle] each tick.
      this.state.absolutePitch = clamp(
        this.state.absolutePitch + (block.parsed.pitch ?? 0),
        -MAX_PITCH,
        MAX_PITCH,
      );
    }
  }

  private applyPacketGhost(ghost: {
    index: number;
    type: "create" | "update" | "delete";
    classId?: number;
    parsedData?: Record<string, unknown>;
  }): void {
    const ghostIndex = ghost.index;
    const prevEntityId = this.state.entityIdByGhostIndex.get(ghostIndex);

    // When a projectile entity is being removed (ghost delete, ghost index
    // reuse, or same-class index reuse), spawn an explosion at its last known
    // position if it hasn't already exploded. The Torque engine's KillGhost
    // mechanism silently drops pending ExplosionMask data when a ghost goes
    // out of scope, so explosion positions almost never arrive in the demo
    // stream. The original client compensated with client-side raycast
    // collision detection in processTick(); we approximate by triggering the
    // explosion when the ghost disappears.
    if (prevEntityId) {
      const prevEntity = this.state.entitiesById.get(prevEntityId);
      if (
        prevEntity &&
        prevEntity.type === "Projectile" &&
        !prevEntity.hasExploded &&
        prevEntity.explosionShape &&
        prevEntity.position &&
        // Ghost is being deleted or its index is being reassigned to a new
        // ghost (either a different class or a fresh create of the same class).
        (ghost.type === "delete" || ghost.type === "create")
      ) {
        this.spawnExplosion(prevEntity, [...prevEntity.position] as [
          number,
          number,
          number,
        ]);
      }
    }

    if (ghost.type === "delete") {
      if (prevEntityId) {
        this.state.entitiesById.delete(prevEntityId);
        this.state.entityIdByGhostIndex.delete(ghostIndex);
      }
      return;
    }

    const className = this.resolveGhostClassName(ghostIndex, ghost.classId);
    if (!className) {
      return;
    }

    const entityId = toEntityId(className, ghostIndex);
    if (prevEntityId && prevEntityId !== entityId) {
      this.state.entitiesById.delete(prevEntityId);
    }

    let entity: MutableStreamEntity;
    const existingEntity = this.state.entitiesById.get(entityId);
    if (existingEntity && ghost.type === "create") {
      // Same-class ghost index reuse: reset the entity for the new ghost
      // to avoid stale fields (hasExploded, explosionShape, etc.) from the
      // previous occupant leaking into the new one.
      existingEntity.spawnTick = this.state.moveTicks;
      existingEntity.rotation = [0, 0, 0, 1];
      existingEntity.hasExploded = undefined;
      existingEntity.explosionShape = undefined;
      existingEntity.explosionLifetimeTicks = undefined;
      existingEntity.faceViewer = undefined;
      existingEntity.simulatedVelocity = undefined;
      existingEntity.projectilePhysics = undefined;
      existingEntity.gravityMod = undefined;
      existingEntity.direction = undefined;
      existingEntity.velocity = undefined;
      existingEntity.position = undefined;
      existingEntity.dataBlock = undefined;
      existingEntity.dataBlockId = undefined;
      existingEntity.shapeHint = undefined;
      existingEntity.visual = undefined;
      entity = existingEntity;
    } else if (existingEntity) {
      entity = existingEntity;
    } else {
      entity = {
        id: entityId,
        ghostIndex,
        className,
        spawnTick: this.state.moveTicks,
        type: toEntityType(className),
        rotation: [0, 0, 0, 1],
      };
      this.state.entitiesById.set(entityId, entity);
    }

    entity.ghostIndex = ghostIndex;
    entity.className = className;
    entity.type = toEntityType(className);
    this.state.entityIdByGhostIndex.set(ghostIndex, entityId);
    this.applyGhostData(entity, ghost.parsedData);
  }

  private resolveGhostClassName(
    ghostIndex: number,
    classId: number | undefined,
  ): string | undefined {
    if (typeof classId === "number") {
      const fromClassId = this.registry.getGhostParser(classId)?.name;
      if (fromClassId) {
        return fromClassId;
      }
    }

    const entityId = this.state.entityIdByGhostIndex.get(ghostIndex);
    if (entityId) {
      const entity = this.state.entitiesById.get(entityId);
      if (entity?.className) {
        return entity.className;
      }
    }

    const trackerGhost = this.parser.getGhostTracker().getGhost(ghostIndex);
    if (trackerGhost?.className) {
      return trackerGhost.className;
    }

    return undefined;
  }

  private resolveEntityIdForGhostIndex(ghostIndex: number): string | undefined {
    const byMap = this.state.entityIdByGhostIndex.get(ghostIndex);
    if (byMap) {
      return byMap;
    }
    const trackerGhost = this.parser.getGhostTracker().getGhost(ghostIndex);
    if (trackerGhost) {
      return toEntityId(trackerGhost.className, ghostIndex);
    }
    return undefined;
  }

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

  private resolveExplosionInfo(projDataBlockId: number):
    | {
        shape: string;
        faceViewer: boolean;
        lifetimeTicks: number;
        explosionDataBlockId: number;
      }
    | undefined {
    const projBlock = this.getDataBlockData(projDataBlockId);
    const explosionId = projBlock?.explosion as number | undefined;
    if (explosionId == null) return undefined;
    const expBlock = this.getDataBlockData(explosionId);
    if (!expBlock) return undefined;
    const shape = expBlock.dtsFileName as string | undefined;
    if (!shape) return undefined;
    // The parser's lifetimeMS field is actually in ticks (32ms each), not ms.
    const lifetimeTicks = (expBlock.lifetimeMS as number | undefined) ?? 31;
    return {
      shape,
      faceViewer: expBlock.faceViewer !== false && expBlock.faceViewer !== 0,
      lifetimeTicks,
      explosionDataBlockId: explosionId,
    };
  }

  private applyGhostData(
    entity: MutableStreamEntity,
    rawData: Record<string, unknown> | undefined,
  ): void {
    if (!rawData) return;

    const data = rawData;

    const dataBlockId = data.dataBlockId as number | undefined;
    if (dataBlockId != null) {
      entity.dataBlockId = dataBlockId;
      const blockData = this.getDataBlockData(dataBlockId);
      const shapeName = toShapeNameFromDataBlock(blockData);
      entity.visual =
        resolveTracerVisual(entity.className, blockData) ??
        resolveSpriteVisual(entity.className, blockData);
      if (typeof shapeName === "string") {
        entity.shapeHint = shapeName;
        entity.dataBlock = shapeName;
      }
      if (
        entity.type === "Player" &&
        typeof blockData?.maxEnergy === "number"
      ) {
        entity.maxEnergy = blockData.maxEnergy;
      }

      // Classify projectile physics and extract simulation parameters.
      if (entity.type === "Projectile") {
        if (linearProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "linear";
        } else if (ballisticProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "ballistic";
          entity.gravityMod = getNumberField(blockData, ["gravityMod"]) ?? 1.0;
        } else if (seekerProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "seeker";
        }
      }

      // Resolve explosion shape info for projectiles (once per entity).
      if (entity.type === "Projectile" && !entity.explosionShape) {
        const info = this.resolveExplosionInfo(dataBlockId);
        if (info) {
          entity.explosionShape = info.shape;
          entity.faceViewer = info.faceViewer;
          entity.explosionLifetimeTicks = info.lifetimeTicks;
          entity.explosionDataBlockId = info.explosionDataBlockId;
        }
      }

      // Resolve trail particle emitter for projectiles (once per entity).
      if (entity.type === "Projectile" && entity.maintainEmitterId == null) {
        const trailEmitterId = blockData?.baseEmitter as number | null;
        if (typeof trailEmitterId === "number" && trailEmitterId > 0) {
          entity.maintainEmitterId = trailEmitterId;
        }
      }
    }

    if (entity.type === "Player") {
      const images = data.images as
        | Array<{
            index?: number;
            dataBlockId?: number;
            triggerDown?: boolean;
            ammo?: boolean;
            loaded?: boolean;
            target?: boolean;
            wet?: boolean;
            fireCount?: number;
          }>
        | undefined;
      if (Array.isArray(images) && images.length > 0) {
        // Find slot 0 (weapon) — the array is compact and only includes dirty
        // slots, so images[0] may be a backpack or other non-weapon slot.
        const weaponImage = images.find((img) => img.index === 0);
        if (weaponImage?.dataBlockId && weaponImage.dataBlockId > 0) {
          const blockData = this.getDataBlockData(weaponImage.dataBlockId);
          const weaponShape = toShapeNameFromDataBlock(blockData);
          if (weaponShape) {
            const mountPoint = blockData?.mountPoint as number | undefined;
            if (
              (mountPoint == null || mountPoint <= 0) &&
              !/pack_/i.test(weaponShape)
            ) {
              entity.weaponShape = weaponShape;
            }
          }

          // Extract weapon image condition flags for the weapon state machine.
          // Ghost updates are partial — only changed fields are present. Merge
          // with the previous state so unchanged flags aren't reset to defaults.
          const prev = entity.weaponImageState;
          entity.weaponImageState = {
            dataBlockId: weaponImage.dataBlockId,
            triggerDown: weaponImage.triggerDown ?? prev?.triggerDown ?? false,
            ammo: weaponImage.ammo ?? prev?.ammo ?? true,
            loaded: weaponImage.loaded ?? prev?.loaded ?? true,
            target: weaponImage.target ?? prev?.target ?? false,
            wet: weaponImage.wet ?? prev?.wet ?? false,
            fireCount: weaponImage.fireCount ?? prev?.fireCount ?? 0,
          };

          // Cache the weapon datablock states array (only reparse on weapon change).
          if (
            blockData &&
            entity.weaponImageStatesDbId !== weaponImage.dataBlockId
          ) {
            entity.weaponImageStates = parseWeaponImageStates(blockData);
            entity.weaponImageStatesDbId = weaponImage.dataBlockId;
          }
        } else if (weaponImage && !weaponImage.dataBlockId) {
          // Server explicitly unmounted the weapon (dataBlockId = 0), e.g. on
          // player death. Clear the weapon so it stops rendering.
          entity.weaponShape = undefined;
          entity.weaponImageState = undefined;
          entity.weaponImageStates = undefined;
        }
      }
    }

    const position = isValidPosition(data.position as Vec3)
      ? (data.position as Vec3)
      : isValidPosition(data.initialPosition as Vec3)
        ? (data.initialPosition as Vec3)
        : isValidPosition(data.explodePosition as Vec3)
          ? (data.explodePosition as Vec3)
          : isValidPosition(data.endPoint as Vec3)
            ? (data.endPoint as Vec3)
            : isValidPosition(
                  (data.transform as { position?: Vec3 } | undefined)?.position,
                )
              ? ((data.transform as { position: Vec3 }).position as Vec3)
              : undefined;
    if (position) {
      entity.position = [position.x, position.y, position.z];
    }

    const direction = isVec3Like(data.direction) ? data.direction : undefined;
    if (direction) {
      entity.direction = [direction.x, direction.y, direction.z];
    }

    if (entity.type === "Player" && typeof data.rotationZ === "number") {
      entity.rotation = playerYawToQuaternion(data.rotationZ);
    }

    // Non-control players: headX/headZ are normalized [-1,1] from ghost data.
    if (entity.type === "Player") {
      if (typeof data.headX === "number") {
        entity.headPitch = data.headX;
      }
      if (typeof data.headZ === "number") {
        entity.headYaw = data.headZ;
      }
    }

    if (isQuatLike(data.angPosition)) {
      const converted = torqueQuatToThreeJS(data.angPosition);
      if (converted) {
        entity.rotation = converted;
      }
    } else if (
      isQuatLike(
        (data.transform as { rotation?: unknown } | undefined)?.rotation,
      )
    ) {
      const converted = torqueQuatToThreeJS(
        (
          data.transform as {
            rotation: { x: number; y: number; z: number; w: number };
          }
        ).rotation,
      );
      if (converted) {
        entity.rotation = converted;
      }
    } else if (
      entity.type === "Item" &&
      typeof (data.rotation as { angle?: unknown } | undefined)?.angle ===
        "number"
    ) {
      const rot = data.rotation as { angle: number; zSign?: number };
      entity.rotation = playerYawToQuaternion((rot.zSign ?? 1) * rot.angle);
    } else if (entity.type === "Projectile") {
      const vec =
        (data.velocity as Vec3 | undefined) ??
        (data.direction as Vec3 | undefined) ??
        (isValidPosition(data.initialPosition as Vec3) &&
        isValidPosition(data.endPos as Vec3)
          ? {
              x: (data.endPos as Vec3).x - (data.initialPosition as Vec3).x,
              y: (data.endPos as Vec3).y - (data.initialPosition as Vec3).y,
              z: (data.endPos as Vec3).z - (data.initialPosition as Vec3).z,
            }
          : undefined);
      if (isVec3Like(vec) && (vec.x !== 0 || vec.y !== 0)) {
        entity.rotation = playerYawToQuaternion(Math.atan2(vec.x, vec.y));
      }
    }

    if (isVec3Like(data.velocity)) {
      entity.velocity = [data.velocity.x, data.velocity.y, data.velocity.z];
      if (!entity.direction) {
        entity.direction = [data.velocity.x, data.velocity.y, data.velocity.z];
      }
    }

    // Item physics: simulate dropped items falling under gravity and bouncing.
    if (entity.type === "Item") {
      const atRest = data.atRest as boolean | undefined;
      if (atRest === true) {
        // Server says item is at rest — stop simulating.
        entity.itemPhysics = undefined;
      } else if (atRest === false && isVec3Like(data.velocity)) {
        // Item is moving — initialize or update physics simulation.
        const blockData =
          entity.dataBlockId != null
            ? this.getDataBlockData(entity.dataBlockId)
            : undefined;
        entity.itemPhysics = {
          velocity: [data.velocity.x, data.velocity.y, data.velocity.z],
          atRest: false,
          elasticity: getNumberField(blockData, ["elasticity"]) ?? 0.2,
          friction: getNumberField(blockData, ["friction"]) ?? 0.6,
          gravityMod: getNumberField(blockData, ["gravityMod"]) ?? 1.0,
        };
      } else if (position && !isVec3Like(data.velocity)) {
        // Server snapped position without velocity — stop simulating.
        entity.itemPhysics = undefined;
      }
    }

    // Compute simulatedVelocity for projectile physics.
    if (entity.projectilePhysics) {
      if (entity.projectilePhysics === "linear") {
        // Linear projectiles transmit direction + dryVelocity from datablock,
        // plus optional inherited velocity (excessDir * excessVel).
        const blockData =
          entity.dataBlockId != null
            ? this.getDataBlockData(entity.dataBlockId)
            : undefined;
        const dryVelocity =
          getNumberField(blockData, [
            "dryVelocity",
            "muzzleVelocity",
            "bulletVelocity",
          ]) ?? 80;
        const dir = entity.direction ?? [0, 1, 0];
        let vx = dir[0] * dryVelocity;
        let vy = dir[1] * dryVelocity;
        let vz = dir[2] * dryVelocity;
        // Add inherited velocity from firing object.
        const excessVel = data.excessVel as number | undefined;
        const excessDir = data.excessDir as Vec3 | undefined;
        if (
          typeof excessVel === "number" &&
          excessVel > 0 &&
          isVec3Like(excessDir)
        ) {
          vx += excessDir.x * excessVel;
          vy += excessDir.y * excessVel;
          vz += excessDir.z * excessVel;
        }
        entity.simulatedVelocity = [vx, vy, vz];
      } else if (entity.velocity) {
        // Ballistic and seeker: use the transmitted velocity directly.
        entity.simulatedVelocity = [
          entity.velocity[0],
          entity.velocity[1],
          entity.velocity[2],
        ];
      }

      // Fast-forward by currTick: the initial position is the firing point
      // and currTick tells us how many ticks have already elapsed.
      const currTick = data.currTick as number | undefined;
      if (
        typeof currTick === "number" &&
        currTick > 0 &&
        entity.simulatedVelocity &&
        entity.position
      ) {
        const dt = (TICK_DURATION_MS / 1000) * currTick;
        const v = entity.simulatedVelocity;
        entity.position[0] += v[0] * dt;
        entity.position[1] += v[1] * dt;
        entity.position[2] += v[2] * dt;
        // For ballistic projectiles, also apply gravity during fast-forward.
        if (entity.projectilePhysics === "ballistic") {
          const g = 9.81 * (entity.gravityMod ?? 1);
          // v.z changes linearly, position.z changes quadratically.
          entity.position[2] -= 0.5 * g * dt * dt;
          v[2] -= g * dt;
        }
      }
    }

    // Detect projectile explosion. LinearProjectile/SeekerProjectile send
    // `explodePosition`; GrenadeProjectile/BombProjectile send `explodePoint`.
    // LinearProjectile initial creates of already-exploded projectiles also
    // set `hidden: true` alongside `explodePosition`.
    const explodePos = isValidPosition(data.explodePosition as Vec3)
      ? (data.explodePosition as Vec3)
      : isValidPosition(data.explodePoint as Vec3)
        ? (data.explodePoint as Vec3)
        : undefined;
    if (
      entity.type === "Projectile" &&
      !entity.hasExploded &&
      explodePos &&
      entity.explosionShape
    ) {
      this.spawnExplosion(entity, [explodePos.x, explodePos.y, explodePos.z]);
    }

    if (typeof data.damageLevel === "number") {
      entity.health = clamp(1 - data.damageLevel, 0, 1);
    }
    if (typeof data.damageState === "number") {
      entity.damageState = data.damageState;
    }

    if (typeof data.action === "number") {
      entity.actionAnim = data.action;
      entity.actionAtEnd = !!data.actionAtEnd;
    }

    if (Array.isArray(data.threads)) {
      // Ghost ThreadMask updates are differential — only changed (and active)
      // slots are included. Merge with existing state so unchanged slots
      // (like a clamped deploy or looping power) aren't lost.
      const incoming = data.threads as DemoThreadState[];
      if (entity.threads) {
        const merged = [...entity.threads];
        for (const t of incoming) {
          const existingIdx = merged.findIndex((m) => m.index === t.index);
          if (existingIdx >= 0) {
            merged[existingIdx] = t;
          } else {
            merged.push(t);
          }
        }
        entity.threads = merged;
      } else {
        entity.threads = incoming;
      }
    }

    if (typeof data.energy === "number") {
      entity.energy = clamp(data.energy, 0, 1);
    }

    if (typeof data.targetId === "number") {
      entity.targetId = data.targetId;
      const playerName = this.targetNames.get(data.targetId);
      if (playerName) {
        entity.playerName = playerName;
      }
      const team = this.targetTeams.get(data.targetId);
      if (team != null) {
        entity.sensorGroup = team;
        // If this is the control player, update the viewer's sensor group.
        if (
          entity.ghostIndex === this.state.latestControl.ghostIndex &&
          this.state.lastControlType === "player"
        ) {
          this.state.playerSensorGroup = team;
        }
      }
    }

    // SoundMask: ghost-level playAudio() calls (e.g. station activation).
    // Convert playing sounds to pending audio events so they play through the
    // same pipeline as Sim3DAudioEvent.
    const sounds = data.sounds as
      | Array<{ index: number; playing: boolean; profileId?: number }>
      | undefined;
    if (Array.isArray(sounds)) {
      const timeSec = this.state.moveTicks * (TICK_DURATION_MS / 1000);
      for (const s of sounds) {
        if (s.playing && typeof s.profileId === "number") {
          const pos = entity.position;
          this.state.pendingAudioEvents.push({
            profileId: s.profileId,
            position: pos
              ? { x: pos[0], y: pos[1], z: pos[2] }
              : undefined,
            timeSec,
          });
        }
      }
    }
  }

  private advanceProjectiles(): void {
    const dt = TICK_DURATION_MS / 1000;
    for (const entity of this.state.entitiesById.values()) {
      if (!entity.simulatedVelocity || !entity.position) continue;
      const v = entity.simulatedVelocity;
      const p = entity.position;

      if (entity.projectilePhysics === "ballistic") {
        const g = 9.81 * (entity.gravityMod ?? 1);
        v[2] -= g * dt;
      }

      p[0] += v[0] * dt;
      p[1] += v[1] * dt;
      p[2] += v[2] * dt;

      // Update rotation to face velocity direction.
      if (v[0] !== 0 || v[1] !== 0) {
        entity.rotation = playerYawToQuaternion(Math.atan2(v[0], v[1]));
      }
    }
  }

  private advanceItems(): void {
    const dt = TICK_DURATION_MS / 1000; // 0.032
    for (const entity of this.state.entitiesById.values()) {
      const phys = entity.itemPhysics;
      if (!phys || phys.atRest || !entity.position) continue;
      const v = phys.velocity;
      const p = entity.position;

      // Gravity: Tribes 2 uses -20 m/s² (Torque Z-up).
      v[2] += -20 * phys.gravityMod * dt;

      // Move
      p[0] += v[0] * dt;
      p[1] += v[1] * dt;
      p[2] += v[2] * dt;

      // Terrain collision (flat normal approximation: [0, 0, 1])
      const groundZ = getTerrainHeightAt(p[0], p[1]);
      if (groundZ != null && p[2] < groundZ) {
        p[2] = groundZ;
        const bd = Math.abs(v[2]); // normal impact speed
        v[2] = bd * phys.elasticity; // reflect with restitution
        // Friction: reduce horizontal speed proportional to impact
        const friction = bd * phys.friction;
        const hSpeed = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
        if (hSpeed > 0) {
          const scale = Math.max(0, 1 - friction / hSpeed);
          v[0] *= scale;
          v[1] *= scale;
        }
        // At-rest check
        const speed = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (speed < 0.15) {
          v[0] = v[1] = v[2] = 0;
          phys.atRest = true;
        }
      }
    }
  }

  /** Create a synthetic explosion entity from a projectile. */
  private spawnExplosion(
    entity: MutableStreamEntity,
    position: [number, number, number],
  ): void {
    entity.hasExploded = true;
    const fxId = `fx_${this.state.nextExplosionId++}`;
    const lifetimeTicks = entity.explosionLifetimeTicks ?? 31;
    const fxEntity: MutableStreamEntity = {
      id: fxId,
      ghostIndex: -1,
      className: "Explosion",
      spawnTick: this.state.moveTicks,
      type: "Explosion",
      dataBlock: entity.explosionShape,
      explosionDataBlockId: entity.explosionDataBlockId,
      position,
      rotation: [0, 0, 0, 1],
      isExplosion: true,
      faceViewer: entity.faceViewer !== false,
      expiryTick: this.state.moveTicks + lifetimeTicks,
    };
    this.state.entitiesById.set(fxId, fxEntity);
    // Stop the projectile — the explosion takes over visually.
    entity.position = undefined;
    entity.simulatedVelocity = undefined;
  }

  private removeExpiredExplosions(): void {
    for (const [id, entity] of this.state.entitiesById) {
      if (
        entity.isExplosion &&
        entity.expiryTick != null &&
        this.state.moveTicks >= entity.expiryTick
      ) {
        this.state.entitiesById.delete(id);
      }
    }
  }

  private updateCameraAndHud(): void {
    const control = this.state.latestControl;
    const timeSec = this.state.moveTicks * (TICK_DURATION_MS / 1000);
    const data = control.data;
    const controlType = this.state.lastControlType;

    if (control.position) {
      const hasMoves = !this.state.isPiloting && controlType === "player";
      // Use absolute tracking (with V12-style clamp/wrap) when we have moves,
      // otherwise fall back to the last ghost-provided rotation.
      let yaw = hasMoves ? this.state.absoluteYaw : this.state.lastAbsYaw;
      let pitch = hasMoves ? this.state.absolutePitch : this.state.lastAbsPitch;

      if (hasMoves) {
        this.state.lastAbsYaw = yaw;
        this.state.lastAbsPitch = pitch;
      }

      this.state.camera = {
        time: timeSec,
        position: [control.position.x, control.position.y, control.position.z],
        rotation: yawPitchToQuaternion(
          yaw,
          clamp(pitch, -MAX_PITCH, MAX_PITCH),
        ),
        fov: this.state.latestFov,
        mode: "observer",
        yaw,
        pitch,
      };

      if (controlType === "camera") {
        const cameraMode =
          typeof data?.cameraMode === "number"
            ? data.cameraMode
            : this.state.lastCameraMode;
        if (cameraMode === CameraMode_OrbitObject) {
          this.state.camera.mode = "third-person";
          if (typeof this.state.lastOrbitDistance === "number") {
            this.state.camera.orbitDistance = this.state.lastOrbitDistance;
          }
          const orbitIndex =
            typeof data?.orbitObjectGhostIndex === "number"
              ? (data.orbitObjectGhostIndex as number)
              : this.state.lastOrbitGhostIndex;
          if (typeof orbitIndex === "number" && orbitIndex >= 0) {
            this.state.camera.orbitTargetId =
              this.resolveEntityIdForGhostIndex(orbitIndex);
          }
        } else {
          this.state.camera.mode = "observer";
        }
      } else {
        this.state.camera.mode = "first-person";
        if (control.ghostIndex >= 0) {
          this.state.controlPlayerGhostId = `player_${control.ghostIndex}`;
        }
        if (this.state.controlPlayerGhostId) {
          this.state.camera.controlEntityId = this.state.controlPlayerGhostId;
        }
      }

      // Sync the control player ghost entity's position from the control
      // object data. During demo playback, the control object's state is
      // transmitted through a dedicated channel separate from ghost updates,
      // so the ghost entity's position would otherwise remain stale.
      if (
        controlType === "player" &&
        !this.state.isPiloting &&
        this.state.controlPlayerGhostId &&
        control.position
      ) {
        const ghostEntity = this.state.entitiesById.get(
          this.state.controlPlayerGhostId,
        );
        if (ghostEntity) {
          ghostEntity.position = [
            control.position.x,
            control.position.y,
            control.position.z,
          ];
          ghostEntity.rotation = playerYawToQuaternion(yaw);
          // Control player: derive headPitch from absolutePitch (ghost data
          // skips headX/headZ for the control object).
          ghostEntity.headPitch = clamp(
            this.state.absolutePitch / MAX_PITCH,
            -1,
            1,
          );
        }
      }
    } else if (this.state.camera) {
      this.state.camera = {
        ...this.state.camera,
        time: timeSec,
        fov: this.state.latestFov,
      };
    }

    const status = { health: 1, energy: 1 };
    if (this.state.camera?.mode === "first-person") {
      const controlGhostId = this.state.controlPlayerGhostId;
      const ghostEntity = controlGhostId
        ? this.state.entitiesById.get(controlGhostId)
        : undefined;
      status.health = ghostEntity?.health ?? 1;

      const coEnergyLevel = data?.energyLevel;
      if (typeof coEnergyLevel === "number") {
        const maxEnergy = ghostEntity?.maxEnergy ?? 60;
        if (maxEnergy > 0) {
          status.energy = clamp(coEnergyLevel / maxEnergy, 0, 1);
        }
      } else {
        status.energy = ghostEntity?.energy ?? 1;
      }
    } else if (
      this.state.camera?.mode === "third-person" &&
      this.state.camera.orbitTargetId
    ) {
      const orbitEntity = this.state.entitiesById.get(
        this.state.camera.orbitTargetId,
      );
      status.health = orbitEntity?.health ?? 1;
      status.energy = orbitEntity?.energy ?? 1;
    }

    this.state.lastStatus = status;
  }

  private pushChatMessage(msg: DemoChatMessage): void {
    this.state.chatMessages.push(msg);
    if (this.state.chatMessages.length > 200) {
      this.state.chatMessages.splice(0, this.state.chatMessages.length - 200);
    }
  }

  private handleHudRemoteCommand(funcName: string, args: string[]): void {
    // ── Weapons HUD ──
    if (funcName === "setWeaponsHudItem" && args.length >= 3) {
      const slot = parseInt(args[0], 10);
      const ammo = parseInt(args[1], 10);
      const add = args[2] === "1" || args[2] === "true";
      if (!isNaN(slot)) {
        if (add) {
          this.state.weaponsHud.slots.set(slot, isNaN(ammo) ? -1 : ammo);
        } else {
          this.state.weaponsHud.slots.delete(slot);
        }
      }
    } else if (funcName === "setWeaponsHudAmmo" && args.length >= 2) {
      const slot = parseInt(args[0], 10);
      const ammo = parseInt(args[1], 10);
      if (!isNaN(slot)) {
        // Treat ammo updates as implicit inventory presence — the
        // initial setWeaponsHudItem may have been sent before recording.
        this.state.weaponsHud.slots.set(slot, isNaN(ammo) ? -1 : ammo);
      }
    } else if (funcName === "setWeaponsHudActive" && args.length >= 1) {
      const slot = parseInt(args[0], 10);
      this.state.weaponsHud.activeIndex = isNaN(slot) ? -1 : slot;
      // Treat activation as implicit inventory presence.
      if (!isNaN(slot) && slot >= 0) {
        if (!this.state.weaponsHud.slots.has(slot)) {
          this.state.weaponsHud.slots.set(slot, -1);
        }
      }
    } else if (funcName === "setWeaponsHudClearAll") {
      this.state.weaponsHud.slots.clear();
      this.state.weaponsHud.activeIndex = -1;

      // ── Backpack HUD ──
    } else if (funcName === "setBackpackHudItem" && args.length >= 2) {
      const num = parseInt(args[0], 10);
      const add = args[1] === "1" || args[1] === "true";
      if (add && !isNaN(num)) {
        this.state.backpackHud.packIndex = num;
        this.state.backpackHud.active = false;
        this.state.backpackHud.text = "";
      } else {
        this.state.backpackHud.packIndex = -1;
        this.state.backpackHud.active = false;
        this.state.backpackHud.text = "";
      }
    } else if (funcName === "setSatchelArmed") {
      this.state.backpackHud.active = true;
    } else if (
      funcName === "setCloakIconOn" ||
      funcName === "setRepairPackIconOn" ||
      funcName === "setShieldIconOn" ||
      funcName === "setSenJamIconOn"
    ) {
      this.state.backpackHud.active = true;
    } else if (
      funcName === "setCloakIconOff" ||
      funcName === "setRepairPackIconOff" ||
      funcName === "setShieldIconOff" ||
      funcName === "setSenJamIconOff"
    ) {
      this.state.backpackHud.active = false;
    } else if (funcName === "updatePackText" && args.length >= 1) {
      this.state.backpackHud.text = args[0] ?? "";

      // ── Inventory HUD (grenades, mines, beacons, repair kits) ──
    } else if (funcName === "setInventoryHudItem" && args.length >= 3) {
      const slot = parseInt(args[0], 10);
      const amount = parseInt(args[1], 10);
      const add = args[2] === "1" || args[2] === "true";
      if (!isNaN(slot)) {
        if (add && !isNaN(amount)) {
          this.state.inventoryHud.slots.set(slot, amount);
        } else {
          this.state.inventoryHud.slots.delete(slot);
        }
      }
    } else if (funcName === "setInventoryHudAmount" && args.length >= 2) {
      const slot = parseInt(args[0], 10);
      const amount = parseInt(args[1], 10);
      if (!isNaN(slot) && !isNaN(amount)) {
        this.state.inventoryHud.slots.set(slot, amount);
      }
    } else if (funcName === "setInventoryHudClearAll") {
      this.state.inventoryHud.slots.clear();
      this.state.inventoryHud.activeSlot = -1;
    }
  }

  private buildSnapshot(): DemoStreamSnapshot {
    const entities: DemoStreamEntity[] = [];
    for (const entity of this.state.entitiesById.values()) {
      if (!shouldRenderGhostEntity(entity)) {
        continue;
      }
      entities.push({
        id: entity.id,
        type: entity.type,
        visual: entity.visual,
        direction: entity.direction,
        ghostIndex: entity.ghostIndex,
        className: entity.className,
        dataBlockId: entity.dataBlockId,
        shapeHint: entity.shapeHint,
        dataBlock: entity.dataBlock,
        weaponShape: entity.weaponShape,
        playerName: entity.playerName,
        iffColor:
          entity.type === "Player" && entity.sensorGroup != null
            ? this.resolveIffColor(entity.sensorGroup)
            : undefined,
        // Only clone position for entities whose position is mutated in-place
        // by advanceProjectiles() or advanceItems(). Other entities get new
        // arrays from applyGhostData(), so the old reference stays valid.
        position:
          entity.position &&
          (entity.simulatedVelocity ||
            (entity.itemPhysics && !entity.itemPhysics.atRest))
            ? ([...entity.position] as [number, number, number])
            : entity.position,
        // Rotation is always replaced (never mutated in-place), so no clone.
        rotation: entity.rotation,
        velocity: entity.velocity,
        health: entity.health,
        energy: entity.energy,
        actionAnim: entity.actionAnim,
        actionAtEnd: entity.actionAtEnd,
        damageState: entity.damageState,
        faceViewer: entity.faceViewer,
        threads: entity.threads,
        explosionDataBlockId: entity.explosionDataBlockId,
        maintainEmitterId: entity.maintainEmitterId,
        weaponImageState: entity.weaponImageState,
        weaponImageStates: entity.weaponImageStates,
        headPitch: entity.headPitch,
        headYaw: entity.headYaw,
      });
    }

    const timeSec = this.state.moveTicks * (TICK_DURATION_MS / 1000);
    return {
      timeSec,
      exhausted: this.state.exhausted,
      camera: this.state.camera,
      entities,
      controlPlayerGhostId: this.state.controlPlayerGhostId,
      playerSensorGroup: this.state.playerSensorGroup,
      status: this.state.lastStatus,
      chatMessages: this.state.chatMessages.filter(
        (m) => m.timeSec > timeSec - 15,
      ),
      audioEvents: this.state.pendingAudioEvents.filter(
        (e) => e.timeSec > timeSec - 0.5 && e.timeSec <= timeSec,
      ),
      weaponsHud: {
        slots: Array.from(this.state.weaponsHud.slots.entries()).map(
          ([index, ammo]): WeaponsHudSlot => ({ index, ammo }),
        ),
        activeIndex: this.state.weaponsHud.activeIndex,
      },
      backpackHud:
        this.state.backpackHud.packIndex >= 0
          ? { ...this.state.backpackHud }
          : null,
      inventoryHud: {
        slots: Array.from(this.state.inventoryHud.slots.entries()).map(
          ([slot, count]): InventoryHudSlot => ({ slot, count }),
        ),
        activeSlot: this.state.inventoryHud.activeSlot,
      },
      teamScores: this.state.teamScores,
    };
  }

  private resolveIffColor(
    targetSensorGroup: number,
  ): { r: number; g: number; b: number } | undefined {
    if (this.state.playerSensorGroup === 0) return undefined;
    const colorMap = this.sensorGroupColors.get(this.state.playerSensorGroup);
    if (colorMap) {
      const color = colorMap.get(targetSensorGroup);
      if (color) return color;
    }
    // Tribes 2 defaults: same team = green, different team = red.
    if (targetSensorGroup === this.state.playerSensorGroup) return IFF_GREEN;
    if (targetSensorGroup !== 0) return IFF_RED;
    return undefined;
  }

  private getAbsoluteRotation(
    data: Record<string, unknown> | undefined,
  ): { yaw: number; pitch: number } | null {
    if (!data) return null;

    if (typeof data.rotationZ === "number" && typeof data.headX === "number") {
      return { yaw: data.rotationZ, pitch: data.headX };
    }

    if (typeof data.rotZ === "number" && typeof data.rotX === "number") {
      return { yaw: data.rotZ, pitch: data.rotX };
    }

    return null;
  }

  private isPacketData(parsed: unknown): parsed is {
    gameState: {
      controlObjectGhostIndex?: number;
      controlObjectData?: Record<string, unknown>;
      compressionPoint?: Vec3;
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

  private isInfoData(parsed: unknown): parsed is { value2: number } {
    return (
      !!parsed &&
      typeof parsed === "object" &&
      "value2" in parsed &&
      typeof (parsed as { value2?: unknown }).value2 === "number"
    );
  }

  /** Resolve a string that may contain a tagged string reference (`\x01<id>`). */
  private resolveNetString(s: string): string {
    if (s.length >= 2 && s.charCodeAt(0) === 1) {
      const id = parseInt(s.slice(1), 10);
      if (Number.isFinite(id)) {
        return this.netStrings.get(id) ?? s;
      }
    }
    return s;
  }

  /** Apply Torque `%N` format substitution and strip markup. */
  private formatRemoteArgs(template: string, args: string[]): string {
    let resolved = this.resolveNetString(template);
    for (let i = 0; i < args.length; i++) {
      const placeholder = `%${i + 1}`;
      if (resolved.includes(placeholder)) {
        resolved = resolved.replaceAll(
          placeholder,
          stripTaggedStringMarkup(this.resolveNetString(args[i])),
        );
      }
    }
    return stripTaggedStringMarkup(resolved);
  }
}

export async function createDemoStreamingRecording(
  data: ArrayBuffer,
): Promise<DemoRecording> {
  const parser = new DemoParser(new Uint8Array(data));
  const { header, initialBlock } = await parser.load();
  const { missionName: infoMissionName, gameType } = extractMissionInfo(
    initialBlock.demoValues,
  );

  return {
    duration: header.demoLengthMs / 1000,
    missionName: infoMissionName ?? initialBlock.missionName ?? null,
    gameType,
    streamingPlayback: new StreamingPlayback(parser),
  };
}
