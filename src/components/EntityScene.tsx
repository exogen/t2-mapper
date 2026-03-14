import { memo, useCallback, useRef, useState, useMemo } from "react";
import { Quaternion } from "three";
import type { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { useAllGameEntities } from "../state/gameEntityStore";
import type {
  GameEntity,
  PositionedEntity,
  PlayerEntity,
} from "../state/gameEntityTypes";
import { isSceneEntity } from "../state/gameEntityTypes";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { EntityRenderer } from "./EntityRenderer";
import { ShapeErrorBoundary } from "./ShapeErrorBoundary";
import { PlayerNameplate } from "./PlayerNameplate";
import { FlagMarker } from "./FlagMarker";
import { entityTypeColor } from "../stream/playbackUtils";
import { useEngineSelector } from "../state/engineStore";

/**
 * The ONE rendering component tree for all game entities.
 * Reads from the game entity store (active layer: mission or stream entities).
 * Data sources (mission .mis, demo .rec, live server) are controllers that
 * populate the store — this component doesn't know or care which is active.
 */
export function EntityScene() {
  const rootRef = useCallback((node: Group | null) => {
    streamPlaybackStore.setState({ root: node });
  }, []);

  return (
    <group ref={rootRef}>
      <EntityLayer />
    </group>
  );
}

/** Renders all game entities. Uses an ID-stable selector so the component
 * only re-renders when entities are added or removed, not when their
 * fields change. */
const EntityLayer = memo(function EntityLayer() {
  const entities = useAllGameEntities();

  // Cache entity references by ID so that in-place field mutations
  // (threads, colors, weapon shape) don't cause unnecessary remounts.
  // The cache IS updated when the store provides a genuinely new object
  // reference (identity rebuild: armor change, datablock change, etc.).
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

  return (
    <>
      {[...cache.values()].map((entity) => (
        <EntityWrapper key={entity.id} entity={entity} />
      ))}
    </>
  );
});

const EntityWrapper = memo(function EntityWrapper({
  entity,
}: {
  entity: GameEntity;
}) {
  // Scene infrastructure handles its own positioning and Suspense — render
  // directly. The named group allows the interpolation loop to skip them.
  if (isSceneEntity(entity)) {
    return (
      <group name={entity.id}>
        <EntityRenderer entity={entity} />
      </group>
    );
  }

  if (entity.renderType === "None") return null;

  // From here, entity is a PositionedEntity
  return <PositionedEntityWrapper entity={entity} />;
});

/** Renders the player nameplate, subscribing to controlPlayerGhostId
 * internally so that PositionedEntityWrapper doesn't need to. Keeps
 * engine store mutations from triggering synchronous selector evaluations
 * on every positioned entity. */
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
    const flags =
      "targetRenderFlags" in entity
        ? (entity.targetRenderFlags as number | undefined)
        : undefined;
    return ((flags ?? 0) & 0x2) !== 0;
  });
  flagRef.current = isFlag;

  useFrame(() => {
    const flags =
      "targetRenderFlags" in entity
        ? (entity.targetRenderFlags as number | undefined)
        : undefined;
    const nowFlag = ((flags ?? 0) & 0x2) !== 0;
    if (nowFlag !== flagRef.current) {
      flagRef.current = nowFlag;
      setIsFlag(nowFlag);
    }
  });

  if (!isFlag) return null;
  return <FlagMarker entity={entity} />;
}

function PositionedEntityWrapper({ entity }: { entity: PositionedEntity }) {
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
      <group
        name={entity.id}
        position={position}
        quaternion={quaternion}
        scale={scale}
      >
        <mesh>
          <sphereGeometry args={[0.3, 6, 4]} />
          <meshBasicMaterial
            color={entityTypeColor(entity.className)}
            wireframe
          />
        </mesh>
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

  return (
    <group
      name={entity.id}
      position={position}
      quaternion={quaternion}
      scale={scale}
    >
      <group name="model">
        <ShapeErrorBoundary fallback={fallback}>
          <EntityRenderer entity={entity} />
        </ShapeErrorBoundary>
        {isPlayer && (
          <PlayerNameplateIfVisible entity={entity as PlayerEntity} />
        )}
        <FlagMarkerSlot entity={entity} />
      </group>
    </group>
  );
}
