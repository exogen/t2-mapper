import { lazy, memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type {
  GameEntity,
  ShapeEntity as ShapeEntityType,
} from "../state/gameEntityTypes";
import { ShapeRenderer, ShapePlaceholder } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import type { StaticShapeType } from "./ShapeInfoProvider";
import { DebugSuspense } from "./DebugSuspense";
import { ShapeErrorBoundary } from "./ShapeErrorBoundary";
import { FloatingLabel } from "./FloatingLabel";
import { useSettings } from "./SettingsProvider";
import { Camera } from "./Camera";
import { WayPoint } from "./WayPoint";
import { TerrainBlock } from "./TerrainBlock";
import { InteriorInstance } from "./InteriorInstance";
import { Sky } from "./Sky";
import { AudioEnabled } from "./AudioEnabled";
import type { TorqueObject } from "../torqueScript";

function createLazy(
  name: string,
  loader: () => Promise<{ [key: string]: unknown }>,
): React.ComponentType<{ entity: GameEntity }> {
  const LazyComponent = lazy(() =>
    loader().then((mod) => {
      const NamedComponent = mod[name] as React.ComponentType<{
        entity: GameEntity;
      }>;
      return { default: NamedComponent };
    }),
  );
  const LazyComponentWithSuspense = ({ entity }: { entity: GameEntity }) => {
    return (
      <DebugSuspense name={`${name}:${entity.id}`}>
        <LazyComponent entity={entity} />
      </DebugSuspense>
    );
  };

  LazyComponentWithSuspense.displayName = `createLazy(${name})`;
  return LazyComponentWithSuspense;
}

const PlayerModel = createLazy("PlayerModel", () => import("./PlayerModel"));
const ExplosionShape = createLazy(
  "ExplosionShape",
  () => import("./ShapeModel"),
);
const TracerProjectile = createLazy(
  "TracerProjectile",
  () => import("./Projectiles"),
);
const SpriteProjectile = createLazy(
  "SpriteProjectile",
  () => import("./Projectiles"),
);
const ForceFieldBare = createLazy(
  "ForceFieldBare",
  () => import("./ForceFieldBare"),
);
const AudioEmitter = createLazy("AudioEmitter", () => import("./AudioEmitter"));
const WaterBlock = createLazy("WaterBlock", () => import("./WaterBlock"));
const WeaponModel = createLazy("WeaponModel", () => import("./ShapeModel"));

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
      return <ForceFieldBare entity={entity} />;
    case "Player":
      return <PlayerModel entity={entity} />;
    case "Explosion":
      return <ExplosionShape entity={entity} />;
    case "Tracer":
      return <TracerProjectile entity={entity} />;
    case "Sprite":
      return <SpriteProjectile entity={entity} />;
    case "AudioEmitter":
      return (
        <AudioEnabled>
          <AudioEmitter entity={entity} />
        </AudioEnabled>
      );
    case "Camera":
      return <Camera entity={entity} />;
    case "WayPoint":
      return <WayPoint entity={entity} />;
    case "TerrainBlock":
      return <TerrainBlock scene={entity.terrainData} />;
    case "InteriorInstance":
      return <InteriorInstance scene={entity.interiorData} />;
    case "Sky":
      return <Sky entity={entity} />;
    case "Sun":
      // Sun lighting is handled by SceneLighting (rendered outside EntityScene)
      return null;
    case "WaterBlock":
      return <WaterBlock entity={entity} />;
    case "MissionArea":
      return null;
    case "None":
      return null;
    default:
      return null;
  }
});

function ShapeEntity({ entity }: { entity: ShapeEntityType }) {
  const { animationEnabled } = useSettings();
  const groupRef = useRef<Group>(null);

  // Y-axis spinning for Items with rotate=true
  useFrame(() => {
    if (!groupRef.current || !entity.rotate || !animationEnabled) return;
    const t = performance.now() / 1000;
    groupRef.current.rotation.y = (t / 3.0) * Math.PI * 2;
  });

  if (!entity.shapeName) {
    throw new Error(`Shape entity missing shapeName: ${entity.id}`);
  }

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
        <ShapeRenderer
          loadingColor={loadingColor}
          streamEntity={torqueObject ? undefined : entity}
        >
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
        {entity.weaponShape && (
          <ShapeErrorBoundary
            fallback={
              <ShapePlaceholder color="red" label={entity.weaponShape} />
            }
          >
            <DebugSuspense
              name={`Weapon:${entity.id}/${entity.weaponShape}`}
              fallback={
                <ShapePlaceholder color="cyan" label={entity.weaponShape} />
              }
            >
              <WeaponModel entity={entity} />
            </DebugSuspense>
          </ShapeErrorBoundary>
        )}
      </group>
    </ShapeInfoProvider>
  );
}
