import { isProjectileEntity } from "../state/projectileEntities";
import { memo, useMemo, useRef } from "react";
import type { Group } from "three";
import type {
  GameEntity,
  ShapeEntity as ShapeEntityType,
} from "../state/gameEntityTypes";
import { ShapeRenderer, MountedShapeContent } from "./GenericShape";
import type { ShapeLightConfig } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import type { StaticShapeType } from "./ShapeInfoProvider";
import { DebugSuspense } from "./DebugSuspense";
import { FloatingLabel } from "./FloatingLabel";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { isStreamingSource, useDataSource } from "../state/gameEntityStore";
import { resolveEmapFromDatablock } from "./resolveEmap";
import { Camera } from "./Camera";
import { WayPoint } from "./WayPoint";
import { TerrainBlock } from "./TerrainBlock";
import { InteriorInstance } from "./InteriorInstance";
import { Sky } from "./Sky";
import { AudioEnabled } from "./AudioEnabled";
import type { TorqueObject } from "../torqueScript";
import { useRotation } from "./useRotation";
import { lazyNamed } from "./lazyNamed";

interface LazyEntityProps {
  entity: GameEntity;
  objectMounts?: Record<number, React.ReactNode>;
}

function createLazy(
  name: string,
  loader: () => Promise<{ [key: string]: unknown }>,
): React.ComponentType<LazyEntityProps> {
  const LazyComponent = lazyNamed(
    name,
    loader as () => Promise<
      Record<string, React.ComponentType<LazyEntityProps>>
    >,
  );
  const LazyComponentWithSuspense = (props: LazyEntityProps) => {
    return (
      <DebugSuspense name={`${name}:${props.entity.id}`}>
        <LazyComponent {...props} />
      </DebugSuspense>
    );
  };

  LazyComponentWithSuspense.displayName = `createLazy(${name})`;
  return LazyComponentWithSuspense;
}

const PlayerModel = createLazy("PlayerModel", () => import("./PlayerModel"));
const ForceFieldBare = createLazy(
  "ForceFieldBare",
  () => import("./ForceFieldBare"),
);
const AudioEmitter = createLazy("AudioEmitter", () => import("./AudioEmitter"));
const WaterBlock = createLazy("WaterBlock", () => import("./WaterBlock"));

/**
 * Renders persistent entities; transient visuals belong to Projectiles.
 * Dispatches to the appropriate renderer based
 * on renderType. Does NOT handle positioning — the caller is responsible
 * for placing the entity group in world space (either declaratively for
 * mission mode or imperatively for streaming interpolation).
 */
export const EntityRenderer = memo(function EntityRenderer({
  entity,
  objectMounts,
}: {
  entity: GameEntity;
  /** Object-mounted entities (players in vehicles, turrets on vehicles). */
  objectMounts?: Record<number, React.ReactNode>;
}) {
  switch (entity.renderType) {
    case "Shape":
      if (isProjectileEntity(entity)) return null;
      return <ShapeEntity entity={entity} objectMounts={objectMounts} />;
    case "ForceFieldBare":
      return <ForceFieldBare entity={entity} />;
    case "Player":
      return <PlayerModel entity={entity} objectMounts={objectMounts} />;
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
      return <TerrainBlock entity={entity} />;
    case "InteriorInstance":
      return <InteriorInstance entity={entity} />;
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

function ShapeEntity({
  entity,
  objectMounts,
}: {
  entity: ShapeEntityType;
  objectMounts?: Record<number, React.ReactNode>;
}) {
  const dataSource = useDataSource();
  const isStreaming = isStreamingSource(dataSource);
  const groupRef = useRef<Group>(null);

  // Y-axis spinning for Items with rotate=true
  useRotation(entity, groupRef);

  if (!entity.shapeName) {
    throw new Error(`Shape entity missing shapeName: ${entity.id}`);
  }

  const shapeType = (entity.shapeType ?? "StaticShape") as StaticShapeType;

  const emap = useMemo(
    () => resolveEmapFromDatablock(entity.dataBlockId, entity.dataBlock),
    [entity.dataBlockId, entity.dataBlock],
  );

  // Flag label for flag Items
  const isFlag = entity.dataBlock?.toLowerCase() === "flag";
  const teamName =
    entity.teamId && entity.teamId > 0
      ? DEFAULT_TEAM_NAMES[entity.teamId]
      : null;
  const flagLabel = isFlag && teamName ? `${teamName} Flag` : null;

  const loadingColor =
    entity.shapeType === "Item"
      ? "pink"
      : entity.threads
        ? "#00ff88"
        : "yellow";

  // Merge image mounts (all 8 slots) with object mounts (players in vehicles).
  // Both use the same Mount bones. Each image slot's mount bone comes from
  // dataBlock->mountPoint (binary-verified), not from the slot index.
  // Objects and images can share a mount point; each retains its own state.
  const allMounts = useMemo(() => {
    const m: Record<number, React.ReactNode> = { ...objectMounts };
    const slots = entity.imageSlots;
    if (slots) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot?.shapeName) continue;
        m[slot.mountPoint] = (
          <>
            {m[slot.mountPoint]}
            <MountedShapeContent
              key={`image-${i}`}
              shapeName={slot.shapeName}
              imageDataBlockId={slot.dataBlockId}
              entityId={entity.id}
              skinName={slot.skinName}
              slot={i}
              mountOffset={slot.mountOffset}
            />
          </>
        );
      }
    }
    return Object.keys(m).length > 0 ? m : undefined;
  }, [objectMounts, entity.imageSlots, entity.id]);

  const shapeLightConfig = useMemo((): ShapeLightConfig | undefined => {
    if (!entity.lightType) return undefined;
    return {
      type: entity.lightType,
      color: (entity.lightColor ?? [1, 1, 1, 1]) as [
        number,
        number,
        number,
        number,
      ],
      time: entity.lightTime ?? 1000,
      radius: entity.lightRadius ?? 10,
      delayMS: entity.lightDelayMS,
      onlyStatic: !!entity.lightOnlyStatic,
      isStatic: !!entity.isStaticItem,
      anchor: entity.lightAnchor ?? "boxCenter",
    };
  }, [
    entity.lightType,
    entity.lightColor,
    entity.lightTime,
    entity.lightRadius,
    entity.lightDelayMS,
    entity.lightOnlyStatic,
    entity.isStaticItem,
    entity.lightAnchor,
  ]);

  return (
    <ShapeInfoProvider
      object={entity.runtimeObject as TorqueObject | undefined}
      shapeName={entity.shapeName}
      type={shapeType}
    >
      <group ref={entity.rotate ? groupRef : undefined}>
        <ShapeRenderer
          loadingColor={loadingColor}
          streamEntity={isStreaming ? entity : undefined}
          emap={emap}
          entityId={entity.id}
          skinName={entity.skinName}
          mounted={allMounts}
          lightConfig={shapeLightConfig}
        >
          {flagLabel ? (
            <FloatingLabel opacity={0.6}>{flagLabel}</FloatingLabel>
          ) : null}
        </ShapeRenderer>
      </group>
    </ShapeInfoProvider>
  );
}
