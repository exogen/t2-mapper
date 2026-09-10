import type { StreamEntity } from "./types";
import type {
  GameEntity,
  ForceFieldData,
  ShapeEntity,
  PlayerEntity,
  ForceFieldBareEntity,
  ExplosionEntity,
  TracerEntity,
  BeamEntity,
  LinkBeamEntity,
  ShockLanceEntity,
  SpriteEntity,
  FlareEntity,
  AudioEmitterEntity,
  CameraEntity,
  WayPointEntity,
  NoneEntity,
} from "../state/gameEntityTypes";
import type { SceneTSStatic } from "../scene/types";
import { fieldOpenFromState } from "./forceFieldState";

/** Update an existing render entity without allocating. Animation state is
 * read imperatively; return true only for changes React must commit (skins,
 * mounts, or a force field opening or being resized). */
export function updateGameEntityFromStream(
  renderEntity: GameEntity,
  stream: StreamEntity,
): boolean {
  // Shared fields (on PositionedBase, used by both Player and Shape).
  const e = renderEntity as unknown as Record<string, unknown>;
  let structural =
    e.mountObjectId !== stream.mountObjectId ||
    e.mountNode !== stream.mountNode ||
    e.skinName !== stream.skinName;
  e.mountObjectId = stream.mountObjectId;
  e.mountNode = stream.mountNode;
  e.skinName = stream.skinName;
  e.imageSlots = stream.imageSlots;
  e.threads = stream.threads;
  e.armAction = stream.armAction;
  e.targetRenderFlags = stream.targetRenderFlags;
  e.targetId = stream.targetId;
  e.iffColor = stream.iffColor;
  e.playerName = stream.playerName;
  e.teamId = stream.teamId;
  e.soundSlots = stream.soundSlots;
  // DamageMask updates mutate existing ghosts, including repairs. Both
  // appearance threads and death/spectate checks need the current values.
  e.health = stream.health;
  e.damageState = stream.damageState;
  e.fadeVal = stream.fadeVal;
  e.cloakLevel = stream.cloakLevel;

  // Type-specific fields.
  switch (renderEntity.renderType) {
    case "Player":
      if (e.skinPrefName !== stream.skinPrefName) structural = true;
      e.skinPrefName = stream.skinPrefName;
      e.falling = stream.falling;
      e.jetting = stream.jetting;
      e.headPitch = stream.headPitch;
      e.headYaw = stream.headYaw;
      break;
    case "Shape":
      e.wheels = stream.wheels;
      e.steeringYaw = stream.steeringYaw;
      e.frozen = stream.frozen;
      e.maxSteeringAngle = stream.maxSteeringAngle;
      e.turretAim = stream.turretAim;
      e.jetting = stream.jetting;
      e.thrustDirection = stream.thrustDirection;
      e.projectileAgeMS = stream.projectileAgeMS;
      break;
    case "Beam":
      // Sniper beam swing updates move the endpoint on the live ghost.
      if (stream.beamStart) e.beamStart = stream.beamStart;
      if (stream.beamEnd) e.beamEnd = stream.beamEnd;
      break;
    case "Tracer":
      // Live bolt orientation: a bouncing blaster bolt re-aims along
      // its reflected velocity each tick — a direction copied once at
      // entity creation would freeze the quad on the muzzle bearing.
      e.direction = stream.direction;
      break;
    case "LinkBeam":
      // ELF/repair beams re-anchor as the ghost updates its endpoints.
      e.linkSourceId = stream.linkSourceId;
      e.linkTargetId = stream.linkTargetId;
      break;
    case "ShockLance":
      // The shooter/target ids resolve once those ghosts exist.
      e.linkSourceId = stream.linkSourceId;
      e.linkTargetId = stream.linkTargetId;
      break;
    case "ForceFieldBare": {
      e.fieldAlpha = stream.forceFieldAlpha;
      const fieldOpen = fieldOpenFromState(stream.forceFieldState);
      if (e.fieldOpen !== fieldOpen) {
        e.fieldOpen = fieldOpen;
        structural = true;
      }
      // Servers retract an open field by zeroing its scale, so the box
      // dimensions change under the same identity.
      const dims = stream.forceFieldData?.dimensions;
      const data = e.forceFieldData as ForceFieldData | undefined;
      if (dims && data && data.dimensions !== dims) {
        e.forceFieldData = { ...data, dimensions: dims };
        structural = true;
      }
      break;
    }
  }
  return structural;
}

/** Common fields extracted from a StreamEntity for positioned game entities. */
function positionedBase(entity: StreamEntity, spawnTime?: number) {
  return {
    id: entity.id,
    className: entity.className ?? entity.type,
    ghostIndex: entity.ghostIndex,
    dataBlockId: entity.dataBlockId,
    shapeHint: entity.shapeHint,
    dataBlock: entity.dataBlock,
    skinName: entity.skinName,
    spawnTime: entity.spawnTimeSec ?? spawnTime,
    position: entity.position,
    rotation: entity.rotation,
    scale: entity.scale,
    velocity: entity.velocity,
    mountObjectId: entity.mountObjectId,
    mountNode: entity.mountNode,
    imageSlots: entity.imageSlots,
    threads: entity.threads,
    armAction: entity.armAction,
    damageState: entity.damageState,
    fadeVal: entity.fadeVal,
    cloakLevel: entity.cloakLevel,
    turretAim: entity.turretAim,
    targetRenderFlags: entity.targetRenderFlags,
    targetId: entity.targetId,
    iffColor: entity.iffColor,
    playerName: entity.playerName,
    teamId: entity.teamId,
    soundSlots: entity.soundSlots,
    health: entity.health,
    energy: entity.energy,
    actionAnim: entity.actionAnim,
    actionAtEnd: entity.actionAtEnd,
    keyframes: [
      {
        time: spawnTime ?? 0,
        position: entity.position ?? ([0, 0, 0] as [number, number, number]),
        rotation:
          entity.rotation ?? ([0, 0, 0, 1] as [number, number, number, number]),
      },
    ],
  };
}

/** Convert a StreamEntity to a GameEntity for the entity store. */
export function streamEntityToGameEntity(
  entity: StreamEntity,
  spawnTime?: number,
): GameEntity {
  // Scene infrastructure — routed from sceneData
  if (entity.sceneData) {
    const base = {
      id: entity.id,
      className: entity.className ?? entity.type,
      ghostIndex: entity.ghostIndex,
      dataBlockId: entity.dataBlockId,
      shapeHint: entity.shapeHint,
      spawnTime,
    };
    switch (entity.sceneData.className) {
      case "TerrainBlock":
        return {
          ...base,
          renderType: "TerrainBlock",
          terrainData: entity.sceneData,
        };
      case "InteriorInstance":
        return {
          ...base,
          renderType: "InteriorInstance",
          interiorData: entity.sceneData,
        };
      case "Sky":
        return { ...base, renderType: "Sky", skyData: entity.sceneData };
      case "Sun":
        return { ...base, renderType: "Sun", sunData: entity.sceneData };
      case "WaterBlock":
        return {
          ...base,
          renderType: "WaterBlock",
          waterData: entity.sceneData,
        };
      case "MissionArea":
        return {
          ...base,
          renderType: "MissionArea",
          missionAreaData: entity.sceneData,
        };
      case "TSStatic":
        // TSStatic is rendered as a shape — extract shapeName from scene data.
        return {
          ...positionedBase(entity, spawnTime),
          renderType: "Shape",
          shapeName: (entity.sceneData as SceneTSStatic).shapeName,
          shapeType: "TSStatic",
          dataBlock: entity.dataBlock,
        } satisfies ShapeEntity;
    }
  }

  // Projectile visuals
  switch (entity.visual?.kind) {
    case "tracer":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "Tracer",
        visual: entity.visual,
        dataBlock: entity.dataBlock,
        direction: entity.direction,
      } satisfies TracerEntity;
    case "sprite":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "Sprite",
        visual: entity.visual,
      } satisfies SpriteEntity;
    case "flare":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "Flare",
        visual: entity.visual,
      } satisfies FlareEntity;
    case "linkBeam":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "LinkBeam",
        visual: entity.visual,
        linkSourceId: entity.linkSourceId,
        linkTargetId: entity.linkTargetId,
      } satisfies LinkBeamEntity;
    case "shockLance": {
      if (!entity.beamStart || !entity.beamEnd) break;
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "ShockLance",
        visual: entity.visual,
        beamStart: entity.beamStart,
        beamEnd: entity.beamEnd,
        beamHit: entity.beamHit ?? false,
        linkSourceId: entity.linkSourceId,
        linkTargetId: entity.linkTargetId,
      } satisfies ShockLanceEntity;
    }
    case "beam": {
      const start = entity.beamStart ?? entity.position;
      const end = entity.beamEnd ?? entity.beamStart ?? entity.position;
      if (!start || !end) break;
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "Beam",
        visual: entity.visual,
        beamStart: start,
        beamEnd: end,
      } satisfies BeamEntity;
    }
  }

  switch (entity.className) {
    case "Player":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "Player",
        shapeName: entity.dataBlock,
        skinPrefName: entity.skinPrefName,
        falling: entity.falling,
        jetting: entity.jetting,
        headPitch: entity.headPitch,
        headYaw: entity.headYaw,
      } satisfies PlayerEntity;

    case "Explosion":
      // Only render a shape if the datablock specifies one; particle-only explosions
      // (e.g. BlasterExplosion) still exist as entities for ParticleEffects.
      if (entity.dataBlock) {
        return {
          // The engine's explode() time, so the shape's thread starts where
          // the engine's did rather than when the component mounted.
          ...positionedBase(entity, entity.spawnTimeSec ?? spawnTime),
          renderType: "Explosion",
          shapeName: entity.dataBlock,
          dataBlock: entity.dataBlock,
          explosionDataBlockId: entity.explosionDataBlockId,
          faceViewer: entity.faceViewer,
          lifetimeMS: entity.explosionLifetimeMS,
          startAgeMS: entity.explosionStartAgeMS,
        } satisfies ExplosionEntity;
      }
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "None",
      } satisfies NoneEntity;

    case "ForceFieldBare":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "ForceFieldBare",
        fieldOpen: fieldOpenFromState(entity.forceFieldState),
        fieldAlpha: entity.forceFieldAlpha,
        forceFieldData: entity.forceFieldData
          ? {
              textures: entity.forceFieldData.textures,
              color: entity.forceFieldData.color,
              powerOffColor: entity.forceFieldData.powerOffColor,
              baseTranslucency: entity.forceFieldData.baseTranslucency,
              powerOffTranslucency: entity.forceFieldData.powerOffTranslucency,
              numFrames: entity.forceFieldData.textures.length,
              framesPerSec: entity.forceFieldData.framesPerSec,
              scrollSpeed: entity.forceFieldData.scrollSpeed,
              umapping: entity.forceFieldData.umapping,
              vmapping: entity.forceFieldData.vmapping,
              dimensions: entity.forceFieldData.dimensions,
            }
          : undefined,
      } satisfies ForceFieldBareEntity;

    case "AudioEmitter":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "AudioEmitter",
        audioFileName: entity.audioFileName,
        audioVolume: entity.audioVolume,
        audioIs3D: entity.audioIs3D,
        audioIsLooping: entity.audioIsLooping ?? true,
        audioMinDistance: entity.audioMinDistance,
        audioMaxDistance: entity.audioMaxDistance,
        audioMinLoopGap: entity.audioMinLoopGap,
        audioMaxLoopGap: entity.audioMaxLoopGap,
      } satisfies AudioEmitterEntity;

    case "WayPoint":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "WayPoint",
        label: entity.label,
      } satisfies WayPointEntity;

    // Non-rendered objects: editor-only markers, AI objectives, vehicle blockers.
    // MissionMarker::onAdd only calls addToScene when gEditingMission is true.
    // AIObjective and VehicleBlocker are server-side logic objects with no visuals.
    // Lightning and Precipitation are weather: the engine draws bolts and
    // drops, never a shape, and their ghost scale is the storm's volume
    // (512 × 512 × 300 on Stonehenge), which a placeholder must not inherit.
    case "AIObjective":
    case "Lightning":
    case "MissionMarker":
    case "PhysicalZone":
    case "Precipitation":
    case "SpawnSphere":
    case "VehicleBlocker":
      return {
        id: entity.id,
        className: entity.className ?? entity.type,
        ghostIndex: entity.ghostIndex,
        dataBlockId: entity.dataBlockId,
        shapeHint: entity.shapeHint,
        spawnTime,
        renderType: "None",
      } satisfies NoneEntity;

    case "Camera":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "Camera",
      } satisfies CameraEntity;

    default:
      // Default: generic DTS shape
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "Shape",
        shapeName: entity.dataBlock,
        shapeType:
          entity.className === "Turret"
            ? "Turret"
            : entity.className === "Item"
              ? "Item"
              : "StaticShape",
        wheels: entity.wheels,
        steeringYaw: entity.steeringYaw,
        frozen: entity.frozen,
        maxSteeringAngle: entity.maxSteeringAngle,
        jetting: entity.jetting,
        thrustDirection: entity.thrustDirection,
        lightType: entity.lightType,
        lightColor: entity.lightColor,
        lightTime: entity.lightTime,
        lightRadius: entity.lightRadius,
        lightDelayMS: entity.lightDelayMS,
        lightOnlyStatic: entity.lightOnlyStatic,
        lightAnchor: entity.lightAnchor,
        isStaticItem: entity.isStaticItem,
        projectileAgeMS: entity.projectileAgeMS,
        projectileActivateDelayMS: entity.projectileActivateDelayMS,
      } satisfies ShapeEntity;
  }
}
