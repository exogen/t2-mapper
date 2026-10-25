import type { ParsedData } from "t2-demo-parser";
import { threeForwardHeading } from "./streamHelpers";
import type { StreamEntity, StreamSnapshot } from "./types";

type Vec3 = readonly [number, number, number];

/**
 * The base scripts' serverPlay3D sounds, by AudioProfile file. Datablock
 * names never reach the client, so a script's sound is known by its file.
 */
export const SCRIPT_SOUNDS = {
  /**
   * SniperRifleImage::onFire (scripts/projectiles.cs), at the shooter, as
   * it creates the SniperProjectile. The rifle's Fire state has no
   * stateSound and the projectile plays none (SniperProjectile::onAdd
   * FUN_00641fd0 only spawns the impact), so this is the shot's only sound.
   */
  laserFire: "fx/weapons/sniper_fire",
  /**
   * HandInventory::onUse (scripts/weapons.cs) and FlareGrenade::onUse, at
   * the thrower's box center, where the grenade, mine or flare starts.
   */
  grenadeThrow: "fx/weapons/throw_grenade",
  /**
   * ItemData::onThrow (scripts/item.cs), at the item ShapeBase::throwObject
   * starts at the thrower's box center.
   */
  itemThrow: "fx/packs/packs.throwpack",
  /**
   * ItemData::onCollision (scripts/item.cs) and Ammo::onCollision
   * (scripts/weapTurretCode.cs), at the player picking the item up.
   */
  itemPickup: "fx/packs/packs.pickuppack",
  /**
   * deployMineCheck (scripts/weapTurretCode.cs), as a resting mine starts
   * its deploy thread.
   */
  mineDeploy: "fx/weapons/mine_deploy",
  /**
   * ShapeBaseImageData::onDeploy (scripts/deployables.cs) plays the pack
   * image's deploySound at the deployable it creates. This is
   * StationDeploySound, the inventory pack's.
   */
  stationDeploy: "fx/packs/inventory_deploy",
  /**
   * MotionSensorDeploySound, the motion sensor pack's deploySound.
   */
  motionSensorDeploy: "fx/powered/motion_sensor_activate",
  /**
   * SensorDeploySound, the pulse sensor pack's deploySound.
   */
  pulseSensorDeploy: "fx/powered/sensor_activate",
  /**
   * TurretDeploySound, both turret packs' deploySound.
   */
  turretDeploy: "fx/packs/turret_place",
} as const;

/**
 * Each deploy pack's deploySound, by the pack image's shape, which is how
 * the client knows the image. The field lives only in the scripts
 * (scripts/deployables.cs, the same in Classic).
 */
const DEPLOY_SOUNDS: ReadonlyMap<string, string> = new Map([
  ["pack_deploy_inventory.dts", SCRIPT_SOUNDS.stationDeploy],
  ["pack_deploy_sensor_motion.dts", SCRIPT_SOUNDS.motionSensorDeploy],
  ["pack_deploy_sensor_pulse.dts", SCRIPT_SOUNDS.pulseSensorDeploy],
  ["pack_deploy_turreto.dts", SCRIPT_SOUNDS.turretDeploy],
  ["pack_deploy_turreti.dts", SCRIPT_SOUNDS.turretDeploy],
]);

const RESTORABLE: ReadonlySet<string> = new Set(Object.values(SCRIPT_SOUNDS));

/**
 * Datablock references are readInt(11).
 */
const DATABLOCK_ID_LIMIT = 2048;

/**
 * A recorded sound shares its cause's packet, but on a starved connection
 * the cause's ghost update can trail it by over half a second. The laser's
 * sound sits at the shooter, 2-3.3 m from the muzzle, and an item whose
 * first ghost update comes a few ticks late has flown ~6 m.
 */
const MATCH_SEC = 0.75;
const MATCH_DISTANCE = 8;
const KEEP_SEC = MATCH_SEC;
/**
 * A few ticks: what one server tick sends can land in neighboring packets.
 */
const SAME_TICK_SEC = 0.1;

/**
 * A thrown item starts at the thrower's box center, moving. On a starved
 * connection its first ghost update can come after it flew 5-10 m, still
 * heading away from the thrower.
 */
const THROW_NEAR = 4;
const THROW_REACH = 10;
const THROW_SPEED = 0.5;
/**
 * A picked-up item touches the picker's box.
 */
const PICKUP_DISTANCE = 3.5;
/**
 * A picked-up item is opaque until it goes; a popped one fades out over
 * the second before (Item::schedulePop).
 */
const PICKUP_OPAQUE_SEC = 0.3;
/**
 * A pack deploys where the player's eye ray meets a surface, within its
 * maxDeployDis: 3-6.5 m from the eye and 0-27° off the view on recordings.
 */
const DEPLOY_REACH = 8;
const DEPLOY_ANGLE = (30 * Math.PI) / 180;
/**
 * An armor's box center and eye sit about this far above its origin.
 */
const PLAYER_BOX_CENTER_Z = 1.2;
const PLAYER_EYE_Z = 2;
/**
 * All armors' maxLookAngle, for a head turned in freelook.
 */
const MAX_LOOK_ANGLE = 1.5;
/**
 * A longer gap, or time going backward, is a seek.
 */
const SEEK_SEC = 1;

export interface ScriptSound {
  timeSec: number;
  /**
   * Torque space.
   */
  position: Vec3;
}

export interface RestoredSound extends ScriptSound {
  /**
   * The AudioProfile's file, lower case and without .wav.
   */
  file: string;
}

/**
 * An AudioProfile filename as SCRIPT_SOUNDS names it: lower case, without
 * .wav.
 */
export function normalizeAudioFile(filename: string): string {
  return filename.toLowerCase().replace(/\.wav$/, "");
}

/**
 * The id of an AudioProfile datablock that plays `file`.
 */
export function findAudioProfileId(
  getDb: (id: number) => ParsedData | undefined,
  file: string,
): number | undefined {
  for (let id = 0; id < DATABLOCK_ID_LIMIT; id++) {
    const filename = getDb(id)?.filename;
    if (typeof filename === "string" && normalizeAudioFile(filename) === file)
      return id;
  }
  return undefined;
}

/**
 * Plays one sound per cause of a serverPlay3D sound. GameConnection::play3D
 * (FUN_005fd010) sends the event only to a connection whose control object
 * is within the profile's maxDistance of it, so a recording holds the sound
 * only near its recorder: a relay's parked camera hears 12 of a demo's 358
 * laser shots. A recorded sound plays as recorded, and a cause the
 * recording shows without one has its sound restored, as the server would
 * have sent it to a listener nearby.
 */
export class ScriptSoundPairing {
  private recorded: ScriptSound[] = [];
  private restored: ScriptSound[] = [];

  /**
   * Whether a recorded sound should play: not when its cause already had
   * the sound restored.
   */
  playRecorded(sound: ScriptSound): boolean {
    return !pair(sound, this.restored, this.recorded);
  }

  /**
   * Whether a cause needs its sound restored: not when the recording
   * already played it.
   */
  restore(cause: ScriptSound): boolean {
    return !pair(cause, this.recorded, this.restored);
  }

  reset(): void {
    this.recorded.length = 0;
    this.restored.length = 0;
  }
}

interface Tracked {
  type: string;
  position?: Vec3;
  dataBlockId?: number;
  isStaticItem?: boolean;
  /**
   * When an item was last fully opaque.
   */
  opaqueSec: number;
  playingThreads: number;
  /**
   * A player's backpack image shape, lower case.
   */
  pack?: string;
}

/**
 * Where a player's eye ray deploys from.
 */
interface Facing {
  origin: Vec3;
  yaw: number;
}

/**
 * A deploy pack that came off, waiting for its deployable, and where its
 * carrier faced then: they may turn before a late deployable's ghost.
 */
interface DroppedPack {
  timeSec: number;
  pack: string;
  facing: Facing;
}

/**
 * Finds the causes of the base scripts' serverPlay3D sounds in successive
 * snapshots and restores the sounds a recording lacks (ScriptSoundPairing):
 * laser shots, thrown grenades, mines, flares and items, pickups, mines
 * arming, and deployables placed. Seeks start over without sounding what
 * the jump skipped.
 */
export class ScriptSoundTracker {
  private seen = new Map<string, Tracked>();
  private timeSec: number | null = null;
  private pairings = new Map<string, ScriptSoundPairing>();
  /**
   * Deploy packs that came off and deployables that appeared, unmatched.
   */
  private droppedPacks: DroppedPack[] = [];
  private newDeployables: ScriptSound[] = [];

  /**
   * Whether a recorded sound should play. Sounds this tracker restores are
   * paired with their causes, so each plays once.
   */
  playRecorded(filename: string, sound: ScriptSound): boolean {
    const file = normalizeAudioFile(filename);
    if (!RESTORABLE.has(file)) return true;
    return this.pairing(file).playRecorded(sound);
  }

  /**
   * The restored sounds whose causes `snapshot` shows since the last one.
   */
  update(
    snapshot: StreamSnapshot,
    getDb: (id: number) => ParsedData | undefined,
  ): RestoredSound[] {
    const timeSec = snapshot.timeSec;
    const continuous =
      this.timeSec != null &&
      timeSec >= this.timeSec &&
      timeSec - this.timeSec <= SEEK_SEC;
    this.timeSec = timeSec;
    if (!continuous) {
      this.droppedPacks.length = 0;
      this.newDeployables.length = 0;
    }
    prunePending(this.droppedPacks, timeSec);
    prunePending(this.newDeployables, timeSec);

    const out: RestoredSound[] = [];
    const current = new Map<string, StreamEntity>();
    const players: StreamEntity[] = [];
    for (const entity of snapshot.entities) {
      current.set(entity.id, entity);
      if (entity.type === "Player" && entity.position) players.push(entity);
    }
    const next = new Map<string, Tracked>();
    // Players first, so a deploy pack put down this tick is known when its
    // deployable appears.
    const ordered = [
      ...players,
      ...snapshot.entities.filter((entity) => !players.includes(entity)),
    ];
    for (const entity of ordered) {
      const before = this.seen.get(entity.id);
      const data =
        entity.dataBlockId != null ? getDb(entity.dataBlockId) : undefined;
      if (continuous) {
        if (before) this.changed(before, entity, data, timeSec, out);
        else this.created(entity, data, current, players, timeSec, out);
      }
      next.set(entity.id, track(entity, before, timeSec));
    }
    if (continuous) {
      for (const [id, before] of this.seen) {
        if (!current.has(id))
          this.removed(before, getDb, players, timeSec, out);
      }
    }
    this.seen = next;
    return out;
  }

  reset(): void {
    this.seen.clear();
    this.timeSec = null;
    this.droppedPacks.length = 0;
    this.newDeployables.length = 0;
    for (const pairing of this.pairings.values()) pairing.reset();
  }

  private created(
    entity: StreamEntity,
    data: ParsedData | undefined,
    current: Map<string, StreamEntity>,
    players: StreamEntity[],
    timeSec: number,
    out: RestoredSound[],
  ): void {
    const spawnSec = entity.spawnTimeSec ?? timeSec;
    // Only players' rifles and flare grenades fire these. An unnamed
    // shooter just wasn't ghosted to the recorder.
    const source = entity.linkSourceId
      ? current.get(entity.linkSourceId)
      : undefined;
    const playerShot = !source || source.type === "Player";
    if (entity.className === "SniperProjectile") {
      // The muzzle, unlike a ghost's position, is exact for the shot.
      if (playerShot && entity.beamStart)
        this.restore(SCRIPT_SOUNDS.laserFire, spawnSec, entity.beamStart, out);
      return;
    }
    if (entity.className === "FlareProjectile") {
      if (playerShot && entity.position)
        this.restore(
          SCRIPT_SOUNDS.grenadeThrow,
          spawnSec,
          entity.position,
          out,
        );
      return;
    }
    if (entity.type === "Item") {
      // Flags are the invincible items, and Flag::onThrow plays nothing.
      // Static items appear on respawn.
      if (
        !entity.position ||
        entity.isStaticItem ||
        data?.isInvincible === true ||
        !entity.velocity ||
        Math.hypot(...entity.velocity) < THROW_SPEED
      )
        return;
      const at = throwPosition(players, entity.position, entity.velocity);
      if (!at) return;
      // Which items HandInventory::onUse throws is script-only (their
      // ItemData's thrownItem field); the ones that explode are grenades and
      // mines, though a camera grenade only sticks.
      this.restore(
        data?.explosion != null
          ? SCRIPT_SOUNDS.grenadeThrow
          : SCRIPT_SOUNDS.itemThrow,
        spawnSec,
        at,
        out,
      );
      return;
    }
    // ShapeBaseImageData::onDeploy makes a StaticShape or a Turret; beacons
    // and the like appear on their own.
    if (
      (entity.className === "StaticShape" || entity.className === "Turret") &&
      entity.position
    ) {
      const [x, y, z] = entity.position;
      const deployable = { timeSec: spawnSec, position: [x, y, z] as const };
      const pack = this.takeDeployerPack(players, entity.position);
      if (pack) this.restoreDeploy(pack, deployable, out);
      else this.newDeployables.push(deployable);
    }
  }

  /**
   * The deploy pack, on or just off, of the nearest player who faced
   * `position` within reach. A pack that came off deploys once.
   */
  private takeDeployerPack(
    players: StreamEntity[],
    position: Vec3,
  ): string | undefined {
    let pack: string | undefined;
    let droppedIndex = -1;
    let best = DEPLOY_REACH;
    for (const player of players) {
      const shape = packShape(player);
      const view = facing(player);
      if (!shape || !view || !DEPLOY_SOUNDS.has(shape)) continue;
      const distance = facingDistance(view, position);
      if (distance <= best) {
        best = distance;
        pack = shape;
        droppedIndex = -1;
      }
    }
    this.droppedPacks.forEach((dropped, index) => {
      const distance = facingDistance(dropped.facing, position);
      if (distance <= best) {
        best = distance;
        pack = dropped.pack;
        droppedIndex = index;
      }
    });
    if (droppedIndex >= 0) this.droppedPacks.splice(droppedIndex, 1);
    return pack;
  }

  private changed(
    before: Tracked,
    entity: StreamEntity,
    data: ParsedData | undefined,
    timeSec: number,
    out: RestoredSound[],
  ): void {
    if (
      entity.type === "Item" &&
      data?.explosion != null &&
      entity.position &&
      playingThreads(entity) > before.playingThreads
    ) {
      this.restore(SCRIPT_SOUNDS.mineDeploy, timeSec, entity.position, out);
      return;
    }
    if (
      entity.type === "Player" &&
      before.pack &&
      before.pack !== packShape(entity) &&
      DEPLOY_SOUNDS.has(before.pack)
    ) {
      // The pack comes off a tick after its deployable appears, though a
      // sensor pack can stay on for a few seconds or for the next sensor.
      const view = facing(entity);
      if (!view) return;
      const index = this.newDeployables.findIndex(
        (deployable) =>
          facingDistance(view, deployable.position) <= DEPLOY_REACH,
      );
      if (index >= 0)
        this.restoreDeploy(
          before.pack,
          this.newDeployables.splice(index, 1)[0],
          out,
        );
      else this.droppedPacks.push({ timeSec, pack: before.pack, facing: view });
    }
  }

  private removed(
    before: Tracked,
    getDb: (id: number) => ParsedData | undefined,
    players: StreamEntity[],
    timeSec: number,
    out: RestoredSound[],
  ): void {
    if (before.type !== "Item" || !before.position) return;
    const data =
      before.dataBlockId != null ? getDb(before.dataBlockId) : undefined;
    // Flags have their own pickup, and grenades and mines never get
    // picked up. A popped item fades out first.
    if (
      data?.isInvincible === true ||
      data?.explosion != null ||
      timeSec - before.opaqueSec > PICKUP_OPAQUE_SEC
    )
      return;
    const picker = nearestPicker(players, before.position);
    // RepairPatch::onCollision plays its own sound through a sound slot.
    if (
      !picker?.position ||
      picker.soundSlots?.some(
        (slot) => slot.playing && slot.changedAtSec >= timeSec - SAME_TICK_SEC,
      )
    )
      return;
    this.restore(SCRIPT_SOUNDS.itemPickup, timeSec, picker.position, out);
  }

  private restoreDeploy(
    pack: string,
    deployable: ScriptSound,
    out: RestoredSound[],
  ): void {
    const file = DEPLOY_SOUNDS.get(pack);
    if (file) this.restore(file, deployable.timeSec, deployable.position, out);
  }

  private restore(
    file: string,
    timeSec: number,
    position: Vec3,
    out: RestoredSound[],
  ): void {
    // Entity positions are live arrays; the pairing keeps this one a while.
    const sound = {
      timeSec,
      position: [position[0], position[1], position[2]] as const,
    };
    if (this.pairing(file).restore(sound)) out.push({ file, ...sound });
  }

  private pairing(file: string): ScriptSoundPairing {
    let pairing = this.pairings.get(file);
    if (!pairing) {
      pairing = new ScriptSoundPairing();
      this.pairings.set(file, pairing);
    }
    return pairing;
  }
}

/**
 * What a later snapshot compares against, reusing the entity's last record:
 * a snapshot shares position arrays the engine goes on to update.
 */
function track(
  entity: StreamEntity,
  before: Tracked | undefined,
  timeSec: number,
): Tracked {
  const tracked = before ?? {
    type: entity.type,
    opaqueSec: -Infinity,
    playingThreads: 0,
  };
  tracked.type = entity.type;
  if (entity.position) {
    const position = (tracked.position ??= [0, 0, 0]) as [
      number,
      number,
      number,
    ];
    position[0] = entity.position[0];
    position[1] = entity.position[1];
    position[2] = entity.position[2];
  } else tracked.position = undefined;
  tracked.dataBlockId = entity.dataBlockId;
  tracked.isStaticItem = entity.isStaticItem;
  if ((entity.fadeVal ?? 1) >= 1) tracked.opaqueSec = timeSec;
  tracked.playingThreads = playingThreads(entity);
  tracked.pack = packShape(entity);
  return tracked;
}

/**
 * ShapeBase thread state 0 is play.
 */
function playingThreads(entity: StreamEntity): number {
  let count = 0;
  for (const thread of entity.threads ?? []) if (thread.state === 0) count++;
  return count;
}

/**
 * Slot 2 is $BackpackSlot.
 */
function packShape(entity: StreamEntity): string | undefined {
  return entity.imageSlots?.[2]?.shapeName.toLowerCase();
}

/**
 * Where an item at `position` moving at `velocity` was just thrown from,
 * the thrower's box center the scripts play the sound at: the item itself
 * when it is still there, or the nearest box center it flies away from.
 */
function throwPosition(
  players: StreamEntity[],
  position: Vec3,
  velocity: Vec3,
): Vec3 | undefined {
  let at: Vec3 | undefined;
  let best = THROW_REACH;
  for (const player of players) {
    const origin = player.position!;
    const center: Vec3 = [
      origin[0],
      origin[1],
      origin[2] + PLAYER_BOX_CENTER_Z,
    ];
    const dx = position[0] - center[0];
    const dy = position[1] - center[1];
    const dz = position[2] - center[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= THROW_NEAR) return position;
    if (
      distance <= best &&
      dx * velocity[0] + dy * velocity[1] + dz * velocity[2] > 0
    ) {
      best = distance;
      at = center;
    }
  }
  return at;
}

/**
 * The player able to pick up an item at `position`: the nearest, by box
 * center, alive and on foot, as ItemData::onCollision requires.
 */
function nearestPicker(
  players: StreamEntity[],
  position: Vec3,
): StreamEntity | undefined {
  let nearest: StreamEntity | undefined;
  let best = PICKUP_DISTANCE;
  for (const player of players) {
    if ((player.damageState ?? 0) !== 0 || player.mountObjectId) continue;
    const origin = player.position!;
    const distance = Math.hypot(
      origin[0] - position[0],
      origin[1] - position[1],
      origin[2] + PLAYER_BOX_CENTER_Z - position[2],
    );
    if (distance <= best) {
      best = distance;
      nearest = player;
    }
  }
  return nearest;
}

function facing(player: StreamEntity): Facing | undefined {
  const origin = player.position;
  const rotation = player.rotation;
  if (!origin || !rotation) return undefined;
  const yaw =
    threeForwardHeading({
      x: rotation[0],
      y: rotation[1],
      z: rotation[2],
      w: rotation[3],
    }) +
    (player.headYaw ?? 0) * MAX_LOOK_ANGLE;
  return { origin: [origin[0], origin[1], origin[2]], yaw };
}

/**
 * How far `position` is from a player's eye, or Infinity when it lies
 * outside the cone the player's eye ray deploys into.
 */
function facingDistance(view: Facing, position: Vec3): number {
  const dx = position[0] - view.origin[0];
  const dy = position[1] - view.origin[1];
  // Torque yaw 0 faces +y, turning toward +x.
  const off = Math.atan2(dx, dy) - view.yaw;
  if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > DEPLOY_ANGLE)
    return Infinity;
  return Math.hypot(dx, dy, position[2] - view.origin[2] - PLAYER_EYE_Z);
}

function prunePending(pending: { timeSec: number }[], timeSec: number): void {
  let kept = 0;
  for (const entry of pending) {
    if (timeSec - entry.timeSec <= KEEP_SEC) pending[kept++] = entry;
  }
  pending.length = kept;
}

/**
 * Take the nearest of `others` matching `sound`, or keep `sound` in `own`
 * for a match that comes later.
 */
function pair(
  sound: ScriptSound,
  others: ScriptSound[],
  own: ScriptSound[],
): boolean {
  prune(others, sound.timeSec);
  prune(own, sound.timeSec);
  let index = -1;
  let best = MATCH_DISTANCE;
  others.forEach((other, i) => {
    const distance = Math.hypot(
      other.position[0] - sound.position[0],
      other.position[1] - sound.position[1],
      other.position[2] - sound.position[2],
    );
    if (
      Math.abs(other.timeSec - sound.timeSec) <= MATCH_SEC &&
      distance <= best
    ) {
      best = distance;
      index = i;
    }
  });
  if (index >= 0) {
    others.splice(index, 1);
    return true;
  }
  own.push(sound);
  return false;
}

/**
 * Seeks move the clock either way.
 */
function prune(sounds: ScriptSound[], timeSec: number): void {
  let kept = 0;
  for (const sound of sounds) {
    if (Math.abs(sound.timeSec - timeSec) <= KEEP_SEC) sounds[kept++] = sound;
  }
  sounds.length = kept;
}
