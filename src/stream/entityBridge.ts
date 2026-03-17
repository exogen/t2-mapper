import type { StreamEntity } from "./types";
import type {
  GameEntity,
  ShapeEntity,
  PlayerEntity,
  ForceFieldBareEntity,
  ExplosionEntity,
  TracerEntity,
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
    spawnTime,
    position: entity.position,
    rotation: entity.rotation,
    velocity: entity.velocity,
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
  if (entity.visual?.kind === "tracer") {
    return {
      ...positionedBase(entity, spawnTime),
      renderType: "Tracer",
      visual: entity.visual,
      dataBlock: entity.dataBlock,
      direction: entity.direction,
    } satisfies TracerEntity;
  }
  if (entity.visual?.kind === "sprite") {
    return {
      ...positionedBase(entity, spawnTime),
      renderType: "Sprite",
      visual: entity.visual,
    } satisfies SpriteEntity;
  }

  // Player
  if (entity.type === "Player") {
    return {
      ...positionedBase(entity, spawnTime),
      renderType: "Player",
      shapeName: entity.dataBlock,
      dataBlock: entity.dataBlock,
      weaponShape: entity.weaponShape,
      packShape: entity.packShape,
      flagShape: entity.flagShape,
      falling: entity.falling,
      jetting: entity.jetting,
      playerName: entity.playerName,
      iffColor: entity.iffColor,
      threads: entity.threads,
      weaponImageState: entity.weaponImageState,
      weaponImageStates: entity.weaponImageStates,
      headPitch: entity.headPitch,
      headYaw: entity.headYaw,
      targetRenderFlags: entity.targetRenderFlags,
    } satisfies PlayerEntity;
  }

  // Explosion — only render a shape if the datablock specifies one; particle-only
  // explosions (e.g. BlasterExplosion) still exist as entities for ParticleEffects.
  if (entity.type === "Explosion") {
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
  }

  // Force field
  if (entity.className === "ForceFieldBare") {
    return {
      ...positionedBase(entity, spawnTime),
      renderType: "ForceFieldBare",
    } satisfies ForceFieldBareEntity;
  }

  // Audio emitter
  if (entity.className === "AudioEmitter") {
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
  }

  // WayPoint
  if (entity.className === "WayPoint") {
    return {
      ...positionedBase(entity, spawnTime),
      renderType: "WayPoint",
      label: entity.label,
    } satisfies WayPointEntity;
  }

  // Camera
  if (entity.className === "Camera") {
    return {
      ...positionedBase(entity, spawnTime),
      renderType: "Camera",
    } satisfies CameraEntity;
  }

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
    dataBlock: entity.dataBlock,
    weaponShape: entity.weaponShape,
    threads: entity.threads,
    targetRenderFlags: entity.targetRenderFlags,
    iffColor: entity.iffColor,
  } satisfies ShapeEntity;
}
