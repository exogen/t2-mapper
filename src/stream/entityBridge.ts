import type { StreamEntity } from "./types";
import type {
  GameEntity,
  ShapeEntity,
  PlayerEntity,
  ForceFieldBareEntity,
  ExplosionEntity,
  TracerEntity,
  BeamEntity,
  LinkBeamEntity,
  SpriteEntity,
  AudioEmitterEntity,
  CameraEntity,
  WayPointEntity,
  NoneEntity,
} from "../state/gameEntityTypes";
import type { SceneTSStatic } from "../scene/types";

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
    spawnTime,
    position: entity.position,
    rotation: entity.rotation,
    velocity: entity.velocity,
    mountObjectId: entity.mountObjectId,
    mountNode: entity.mountNode,
    imageSlots: entity.imageSlots,
    threads: entity.threads,
    armAction: entity.armAction,
    damageState: entity.damageState,
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
    case "linkBeam":
      return {
        ...positionedBase(entity, spawnTime),
        renderType: "LinkBeam",
        visual: entity.visual,
        linkSourceId: entity.linkSourceId,
        linkTargetId: entity.linkTargetId,
      } satisfies LinkBeamEntity;
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
        weaponImageState: entity.weaponImageState,
        weaponImageStates: entity.weaponImageStates,
        headPitch: entity.headPitch,
        headYaw: entity.headYaw,
      } satisfies PlayerEntity;

    case "Explosion":
      // Only render a shape if the datablock specifies one; particle-only explosions
      // (e.g. BlasterExplosion) still exist as entities for ParticleEffects.
      if (entity.dataBlock) {
        return {
          ...positionedBase(entity, spawnTime),
          renderType: "Explosion",
          shapeName: entity.dataBlock,
          dataBlock: entity.dataBlock,
          explosionDataBlockId: entity.explosionDataBlockId,
          faceViewer: entity.faceViewer,
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
        forceFieldData: entity.forceFieldData
          ? {
              textures: entity.forceFieldData.textures,
              color: entity.forceFieldData.color,
              baseTranslucency: entity.forceFieldData.baseTranslucency,
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
    case "AIObjective":
    case "MissionMarker":
    case "PhysicalZone":
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
        fadeVal: entity.fadeVal,
        cloakLevel: entity.cloakLevel,
        lightType: entity.lightType,
        lightColor: entity.lightColor,
        lightTime: entity.lightTime,
        lightRadius: entity.lightRadius,
        lightOnlyStatic: entity.lightOnlyStatic,
        isStaticItem: entity.isStaticItem,
      } satisfies ShapeEntity;
  }
}
