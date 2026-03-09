import { lazy, memo, Suspense, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type {
  GameEntity,
  ShapeEntity as ShapeEntityType,
  ForceFieldBareEntity as ForceFieldBareEntityType,
  PlayerEntity as PlayerEntityType,
  ExplosionEntity as ExplosionEntityType,
  TracerEntity as TracerEntityType,
  SpriteEntity as SpriteEntityType,
  AudioEmitterEntity as AudioEmitterEntityType,
} from "../state/gameEntityTypes";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { ShapeRenderer } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import type { StaticShapeType } from "./ShapeInfoProvider";
import { FloatingLabel } from "./FloatingLabel";
import { useSettings } from "./SettingsProvider";
import { Camera } from "./Camera";
import { WayPoint } from "./WayPoint";
import { TerrainBlock } from "./TerrainBlock";
import { InteriorInstance } from "./InteriorInstance";
import { Sky } from "./Sky";
import type { TorqueObject } from "../torqueScript";

// Lazy-loaded heavy renderers
const PlayerModel = lazy(() =>
  import("./PlayerModel").then((mod) => ({ default: mod.PlayerModel })),
);

const ExplosionShape = lazy(() =>
  import("./ShapeModel").then((mod) => ({
    default: mod.ExplosionShape,
  })),
);

const TracerProjectile = lazy(() =>
  import("./Projectiles").then((mod) => ({
    default: mod.TracerProjectile,
  })),
);

const SpriteProjectile = lazy(() =>
  import("./Projectiles").then((mod) => ({
    default: mod.SpriteProjectile,
  })),
);

const ForceFieldBareRenderer = lazy(() =>
  import("./ForceFieldBare").then((mod) => ({
    default: mod.ForceFieldBare,
  })),
);

const AudioEmitter = lazy(() =>
  import("./AudioEmitter").then((mod) => ({ default: mod.AudioEmitter })),
);

const WaterBlock = lazy(() =>
  import("./WaterBlock").then((mod) => ({ default: mod.WaterBlock })),
);

const TEAM_NAMES: Record<number, string> = {
  1: "Storm",
  2: "Inferno",
};

/**
 * Renders a GameEntity by dispatching to the appropriate renderer based
 * on renderType. Does NOT handle positioning — the caller is responsible
 * for placing the entity group in world space (either declaratively for
 * mission mode or imperatively for streaming interpolation).
 */
export const EntityRenderer = memo(function EntityRenderer({
  entity,
}: {
  entity: GameEntity;
}) {
  switch (entity.renderType) {
    case "Shape":
      return <ShapeEntity entity={entity} />;
    case "ForceFieldBare":
      return <ForceFieldBareEntity entity={entity} />;
    case "Player":
      return <PlayerEntity entity={entity} />;
    case "Explosion":
      return <ExplosionEntity entity={entity} />;
    case "Tracer":
      return <TracerEntity entity={entity} />;
    case "Sprite":
      return <SpriteEntity entity={entity} />;
    case "AudioEmitter":
      return <AudioEntity entity={entity} />;
    case "Camera":
      return <Camera entity={entity} />;
    case "WayPoint":
      return <WayPoint entity={entity} />;
    case "TerrainBlock":
      return <TerrainBlock scene={entity.terrainData} />;
    case "InteriorInstance":
      return <InteriorInstance scene={entity.interiorData} />;
    case "Sky":
      return <Sky scene={entity.skyData} />;
    case "Sun":
      // Sun lighting is handled by SceneLighting (rendered outside EntityScene)
      return null;
    case "WaterBlock":
      return (
        <Suspense fallback={null}>
          <WaterBlock scene={entity.waterData} />
        </Suspense>
      );
    case "MissionArea":
      return null;
    case "None":
      return null;
  }
});

// ── Shape Entity ──

function ShapeEntity({ entity }: { entity: ShapeEntityType }) {
  const { animationEnabled } = useSettings();
  const groupRef = useRef<Group>(null);

  // Y-axis spinning for Items with rotate=true
  useFrame(() => {
    if (!groupRef.current || !entity.rotate || !animationEnabled) return;
    const t = performance.now() / 1000;
    groupRef.current.rotation.y = (t / 3.0) * Math.PI * 2;
  });

  if (!entity.shapeName) return null;

  const torqueObject = entity.runtimeObject as TorqueObject | undefined;
  const shapeType = (entity.shapeType ?? "StaticShape") as StaticShapeType;

  // Flag label for flag Items
  const isFlag = entity.dataBlock?.toLowerCase() === "flag";
  const teamName =
    entity.teamId && entity.teamId > 0 ? TEAM_NAMES[entity.teamId] : null;
  const flagLabel = isFlag && teamName ? `${teamName} Flag` : null;

  const loadingColor =
    entity.shapeType === "Item"
      ? "pink"
      : entity.threads
        ? "#00ff88"
        : "yellow";

  return (
    <ShapeInfoProvider
      object={torqueObject}
      shapeName={entity.shapeName}
      type={shapeType}
    >
      <group ref={entity.rotate ? groupRef : undefined}>
        <ShapeRenderer loadingColor={loadingColor} streamEntity={torqueObject ? undefined : entity}>
          {flagLabel ? (
            <FloatingLabel opacity={0.6}>{flagLabel}</FloatingLabel>
          ) : null}
        </ShapeRenderer>
        {entity.barrelShapeName && (
          <ShapeInfoProvider
            object={torqueObject}
            shapeName={entity.barrelShapeName}
            type="Turret"
          >
            <group position={[0, 1.5, 0]}>
              <ShapeRenderer />
            </group>
          </ShapeInfoProvider>
        )}
      </group>
    </ShapeInfoProvider>
  );
}

// ── Force Field Entity ──

function ForceFieldBareEntity({ entity }: { entity: ForceFieldBareEntityType }) {
  if (!entity.forceFieldData) return null;
  return (
    <Suspense fallback={null}>
      <ForceFieldBareRenderer
        data={entity.forceFieldData}
        scale={entity.forceFieldData.dimensions}
      />
    </Suspense>
  );
}

// ── Player Entity ──

function PlayerEntity({ entity }: { entity: PlayerEntityType }) {
  if (!entity.shapeName) return null;

  return (
    <Suspense fallback={null}>
      <PlayerModel entity={entity} />
    </Suspense>
  );
}

// ── Explosion Entity ──

function ExplosionEntity({ entity }: { entity: ExplosionEntityType }) {
  const playback = streamPlaybackStore.getState().playback;

  // ExplosionShape still expects a StreamEntity-shaped object.
  // Adapt minimally until that component is also refactored.
  const streamEntity = {
    id: entity.id,
    type: "Explosion" as const,
    dataBlock: entity.shapeName,
    position: entity.position,
    rotation: entity.rotation,
    faceViewer: entity.faceViewer,
    explosionDataBlockId: entity.explosionDataBlockId,
  };

  if (!entity.shapeName || !playback) return null;

  return (
    <Suspense fallback={null}>
      <ExplosionShape entity={streamEntity as any} playback={playback} />
    </Suspense>
  );
}

// ── Tracer Entity ──

function TracerEntity({ entity }: { entity: TracerEntityType }) {
  return (
    <Suspense fallback={null}>
      <TracerProjectile entity={entity} visual={entity.visual} />
    </Suspense>
  );
}

// ── Sprite Entity ──

function SpriteEntity({ entity }: { entity: SpriteEntityType }) {
  return (
    <Suspense fallback={null}>
      <SpriteProjectile visual={entity.visual} />
    </Suspense>
  );
}

// ── Audio Entity ──

function AudioEntity({ entity }: { entity: AudioEmitterEntityType }) {
  const { audioEnabled } = useSettings();
  if (!entity.audioFileName || !audioEnabled) return null;

  return (
    <Suspense fallback={null}>
      <AudioEmitter entity={entity} />
    </Suspense>
  );
}
