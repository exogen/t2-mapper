import { lazy, memo, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Quaternion } from "three";
import type { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { useAllGameEntities } from "../state";
import type { GameEntity, PositionedEntity, PlayerEntity } from "../state/gameEntityTypes";
import { isSceneEntity } from "../state/gameEntityTypes";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { EntityRenderer } from "./EntityRenderer";
import { PlayerNameplate } from "./PlayerNameplate";
import { FlagMarker } from "./FlagMarker";
import { FloatingLabel } from "./FloatingLabel";
import { entityTypeColor } from "../stream/playbackUtils";
import { useDebug } from "./SettingsProvider";
import { useEngineSelector } from "../state";


const WeaponModel = lazy(() =>
  import("./ShapeModel").then((mod) => ({
    default: mod.WeaponModel,
  })),
);

/**
 * The ONE rendering component tree for all game entities.
 * Reads from the game entity store (active layer: mission or stream entities).
 * Data sources (mission .mis, demo .rec, live server) are controllers that
 * populate the store — this component doesn't know or care which is active.
 */
export function EntityScene({ missionType }: { missionType?: string }) {
  const debug = useDebug();
  const debugMode = debug?.debugMode ?? false;

  const rootRef = useCallback((node: Group | null) => {
    streamPlaybackStore.setState({ root: node });
  }, []);

  return (
    <group ref={rootRef}>
      <EntityLayer missionType={missionType} debugMode={debugMode} />
    </group>
  );
}

/** Renders all game entities. Uses an ID-stable selector so the component
 * only re-renders when entities are added or removed, not when their
 * fields change. Entity references are cached so that once an entity
 * renders and loads resources via Suspense, it keeps its reference stable. */
const EntityLayer = memo(function EntityLayer({
  missionType,
  debugMode,
}: {
  missionType?: string;
  debugMode: boolean;
}) {
  const entities = useAllGameEntities();

  // Cache entity references by ID so that in-place field mutations
  // (threads, colors, weapon shape) don't cause React to see a new
  // object and remount Suspense boundaries. The cache IS updated when
  // the store provides a genuinely new object reference (identity
  // rebuild: armor change, datablock change, etc.).
  const cacheRef = useRef(new Map<string, GameEntity>());
  const cache = cacheRef.current;

  const currentIds = new Set<string>();
  for (const entity of entities) {
    currentIds.add(entity.id);
    cache.set(entity.id, entity);
  }
  // Remove entities no longer in the set
  for (const id of cache.keys()) {
    if (!currentIds.has(id)) {
      cache.delete(id);
    }
  }

  const filtered = useMemo(() => {
    const result: GameEntity[] = [];
    const lowerType = missionType?.toLowerCase();
    for (const entity of cache.values()) {
      if (lowerType && entity.missionTypesList) {
        const types = new Set(
          entity.missionTypesList
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean),
        );
        if (types.size > 0 && !types.has(lowerType)) continue;
      }
      result.push(entity);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, missionType]);

  return (
    <>
      {filtered.map((entity) => (
        <EntityWrapper key={entity.id} entity={entity} debugMode={debugMode} />
      ))}
    </>
  );
});

const EntityWrapper = memo(function EntityWrapper({
  entity,
  debugMode,
}: {
  entity: GameEntity;
  debugMode: boolean;
}) {
  // Scene infrastructure handles its own positioning — render directly.
  // The named group allows the interpolation loop to identify and skip them.
  if (isSceneEntity(entity)) {
    return (
      <group name={entity.id}>
        <EntityRenderer entity={entity} />
      </group>
    );
  }

  if (entity.renderType === "None") return null;

  // From here, entity is a PositionedEntity
  return <PositionedEntityWrapper entity={entity} debugMode={debugMode} />;
});

/** Renders the player nameplate, subscribing to controlPlayerGhostId
 * internally so that PositionedEntityWrapper doesn't need to. This keeps
 * engine store mutations from triggering synchronous selector evaluations
 * on every positioned entity (which was starving Suspense retries for
 * shape GLB loading). */
function PlayerNameplateIfVisible({ entity }: { entity: PlayerEntity }) {
  const controlPlayerGhostId = useEngineSelector(
    (state) => state.playback.streamSnapshot?.controlPlayerGhostId,
  );
  if (entity.id === controlPlayerGhostId) return null;
  return <PlayerNameplate entity={entity} />;
}

/** Imperatively tracks targetRenderFlags bit 0x2 on a game entity and
 * mounts/unmounts FlagMarker when the flag state changes. Entity field
 * mutations don't trigger React re-renders (ID-only equality), so this
 * uses useFrame to poll the mutable field. */
function FlagMarkerSlot({ entity }: { entity: GameEntity }) {
  const flagRef = useRef(false);
  const [isFlag, setIsFlag] = useState(() => {
    const flags = "targetRenderFlags" in entity ? (entity.targetRenderFlags as number | undefined) : undefined;
    return ((flags ?? 0) & 0x2) !== 0;
  });
  flagRef.current = isFlag;

  useFrame(() => {
    const flags = "targetRenderFlags" in entity ? (entity.targetRenderFlags as number | undefined) : undefined;
    const nowFlag = ((flags ?? 0) & 0x2) !== 0;
    if (nowFlag !== flagRef.current) {
      flagRef.current = nowFlag;
      setIsFlag(nowFlag);
    }
  });

  if (!isFlag) return null;
  return (
    <Suspense fallback={null}>
      <FlagMarker entity={entity} />
    </Suspense>
  );
}

function PositionedEntityWrapper({
  entity,
  debugMode,
}: {
  entity: PositionedEntity;
  debugMode: boolean;
}) {
  const position = entity.position;
  const scale = entity.scale;
  const quaternion = useMemo(() => {
    if (!entity.rotation) return undefined;
    return new Quaternion(...entity.rotation);
  }, [entity.rotation]);

  const isPlayer = entity.renderType === "Player";

  // Entities without a resolved shape get a wireframe placeholder.
  if (entity.renderType === "Shape" && !entity.shapeName) {
    return (
      <group name={entity.id} position={position} quaternion={quaternion} scale={scale}>
        <mesh>
          <sphereGeometry args={[0.3, 6, 4]} />
          <meshBasicMaterial
            color={entityTypeColor(entity.className)}
            wireframe
          />
        </mesh>
        {debugMode && <MissingShapeLabel entity={entity} />}
        <FlagMarkerSlot entity={entity} />
      </group>
    );
  }

  const fallback =
    entity.renderType === "Explosion" ? null : (
      <mesh>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshBasicMaterial
          color={entityTypeColor(entity.className)}
          wireframe
        />
      </mesh>
    );

  const shapeName = "shapeName" in entity ? entity.shapeName : undefined;
  const weaponShape = "weaponShape" in entity ? entity.weaponShape : undefined;

  return (
    <group name={entity.id} position={position} quaternion={quaternion} scale={scale}>
      <group name="model">
        <ShapeErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <EntityRenderer entity={entity} />
          </Suspense>
        </ShapeErrorBoundary>
        {isPlayer && (
          <Suspense fallback={null}>
            <PlayerNameplateIfVisible entity={entity as PlayerEntity} />
          </Suspense>
        )}
        <FlagMarkerSlot entity={entity} />
        {debugMode && !shapeName && entity.renderType !== "Shape" && (
          <MissingShapeLabel entity={entity} />
        )}
      </group>
      {weaponShape && shapeName && !isPlayer && (
        <group name="weapon">
          <ShapeErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <WeaponModel
                shapeName={weaponShape}
                playerShapeName={shapeName}
              />
            </Suspense>
          </ShapeErrorBoundary>
        </group>
      )}
    </group>
  );
}

function MissingShapeLabel({ entity }: { entity: GameEntity }) {
  const bits: string[] = [];
  bits.push(`${entity.id} (${entity.className})`);
  if (typeof entity.ghostIndex === "number") bits.push(`ghost ${entity.ghostIndex}`);
  if (typeof entity.dataBlockId === "number") bits.push(`db ${entity.dataBlockId}`);
  bits.push(
    entity.shapeHint
      ? `shapeHint ${entity.shapeHint}`
      : "shapeHint <none resolved>",
  );
  return <FloatingLabel color="#ff6688">{bits.join(" | ")}</FloatingLabel>;
}

/** Error boundary that renders a fallback when shape loading fails. */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

export class ShapeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      "[entity] Shape load failed:",
      error.message,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
