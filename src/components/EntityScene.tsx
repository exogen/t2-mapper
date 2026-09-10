import React, {
  memo,
  Suspense,
  useCallback,
  useRef,
  useState,
  useMemo,
  useLayoutEffect,
} from "react";
import { Quaternion } from "three";
import type { Group } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  gameEntityStore,
  isStreamingSource,
  useSceneEntities,
} from "../state/gameEntityStore";
import type { GameEntity, PositionedEntity } from "../state/gameEntityTypes";
import { isSceneEntity } from "../state/gameEntityTypes";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { EntityRenderer } from "./EntityRenderer";
import { ShapeErrorBoundary } from "./ShapeErrorBoundary";
import { FlagMarker } from "./FlagMarker";
import { CommandCircuitFlagCallout } from "./CommandCircuitFlagCallout";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { entityTypeColor } from "../stream/playbackUtils";
import { Projectiles } from "./Projectiles";
import { useDebug } from "./SettingsProvider";
import { MOUNTED_OBJECT_ROTATION } from "../world/placement";
import { FramePriority } from "./framePriority";
import {
  applyStreamEntityPose,
  streamRenderFrame,
} from "../stream/interpolateEntity";

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
      <Projectiles />
    </group>
  );
}

/** Renders persistent entities. The selector skips projectile churn and
 * in-place field mutations, but detects entity replacement and membership. */
const EntityLayer = memo(function EntityLayer() {
  const entities = useSceneEntities();

  const { mountedIds, objectMounts } = useMemo(() => {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const mountedIds = new Set<string>();
    const mountChildren = new Map<string, GameEntity[]>();
    for (const entity of entities) {
      const mountId = entity.mountObjectId;
      if (!mountId || !byId.has(mountId)) continue;
      mountedIds.add(entity.id);
      let children = mountChildren.get(mountId);
      if (!children) mountChildren.set(mountId, (children = []));
      children.push(entity);
    }
    const objectMounts = new Map<string, Record<number, React.ReactNode>>();
    for (const entity of entities) {
      if (mountedIds.has(entity.id)) continue;
      const mounts = renderObjectMounts(entity.id, mountChildren);
      if (mounts) objectMounts.set(entity.id, mounts);
    }
    return { mountedIds, objectMounts };
  }, [entities]);

  return (
    <>
      {entities
        .filter((entity) => !mountedIds.has(entity.id))
        .map((entity) => (
          <EntityWrapper
            key={entity.id}
            entity={entity}
            objectMounts={objectMounts.get(entity.id)}
          />
        ))}
    </>
  );
});

/** The engine keeps a list of mounted objects, including shared mount points
 * and objects mounted on other mounted objects. Build the portals once. */
function renderObjectMounts(
  id: string,
  children: Map<string, GameEntity[]>,
): Record<number, React.ReactNode> | undefined {
  const mounted = children.get(id);
  if (!mounted) return;
  const mounts: Record<number, React.ReactNode> = {};
  for (const child of mounted) {
    if (child.hidden || child.debugHidden) continue;
    const point = child.mountNode ?? 0;
    // ShapeBase::mountObject clamps invalid slots to zero.
    const node = point >= 0 && point < 32 ? point : 0;
    mounts[node] = (
      <>
        {mounts[node]}
        <Suspense key={child.id}>
          <MountedEntityPresence id={child.id}>
            <EntityRenderer
              entity={child}
              objectMounts={renderObjectMounts(child.id, children)}
            />
          </MountedEntityPresence>
        </Suspense>
      </>
    );
  }
  return mounts;
}

/** Mounted objects bypass the root's pose pass, but still obey ghost deletion
 * immediately while React is committing a changed mount tree. */
function MountedEntityPresence({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const root = useRef<Group>(null);
  useFrame(() => {
    if (
      root.current &&
      isStreamingSource(gameEntityStore.getState().dataSource)
    )
      root.current.visible = streamRenderFrame.current?.has(id) ?? false;
  }, FramePriority.ShapeAnimation - 1);
  return (
    <group
      ref={root}
      name={id}
      rotation={MOUNTED_OBJECT_ROTATION}
      userData={{ objectMount: true }}
    >
      {children}
    </group>
  );
}

const EntityWrapper = memo(function EntityWrapper({
  entity,
  objectMounts,
}: {
  entity: GameEntity;
  objectMounts?: Record<number, React.ReactNode>;
}) {
  if (entity.debugHidden || entity.hidden) return null;

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
  return (
    <PositionedEntityWrapper entity={entity} objectMounts={objectMounts} />
  );
});

/** Imperatively tracks targetRenderFlags bit 0x2 on a game entity and
 * mounts/unmounts FlagMarker when the flag state changes. Entity field
 * mutations don't trigger React re-renders (ID-only equality), so this
 * uses useFrame to poll the mutable field. */
function FlagMarkerSlot({ entity }: { entity: GameEntity }) {
  const commandCircuitActive = useCommandCircuit((s) => s.active);
  const flagRef = useRef(false);
  const [isFlag, setIsFlag] = useState(() => {
    const flags =
      "targetRenderFlags" in entity
        ? (entity.targetRenderFlags as number | undefined)
        : undefined;
    return ((flags ?? 0) & 0x2) !== 0;
  });
  flagRef.current = isFlag; // eslint-disable-line react-hooks/refs

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
  // The command circuit map swaps the floating flag icon for a callout
  // (circle + leader + label) that stays readable from the top-down view.
  return commandCircuitActive ? (
    <CommandCircuitFlagCallout entity={entity} />
  ) : (
    <FlagMarker entity={entity} />
  );
}

function PositionedEntityWrapper({
  entity,
  objectMounts,
}: {
  entity: PositionedEntity;
  objectMounts?: Record<number, React.ReactNode>;
}) {
  const { debugMode } = useDebug();
  const root = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  // A React commit can happen after the frame's interpolation pass (e.g.
  // changing armor). Restore the current render pose before it is drawn.
  useLayoutEffect(() => {
    if (
      !root.current ||
      !isStreamingSource(gameEntityStore.getState().dataSource)
    )
      return;
    applyStreamEntityPose(
      root.current,
      entity,
      streamRenderFrame.current?.get(entity.id),
      streamRenderFrame.previous?.get(entity.id),
      streamRenderFrame.interpT,
      camera,
    );
  });
  const position = entity.position;
  const scale = entity.scale;
  const quaternion = useMemo(() => {
    if (!entity.rotation) return undefined;
    return new Quaternion(...entity.rotation);
  }, [entity.rotation]);

  // Entities without a resolved shape get a wireframe placeholder, a
  // debugging aid only: a real object with no shape draws nothing.
  if (entity.renderType === "Shape" && !entity.shapeName) {
    return (
      <group
        ref={root}
        name={entity.id}
        position={position}
        quaternion={quaternion}
        scale={scale}
      >
        {debugMode && (
          <mesh>
            <sphereGeometry args={[0.3, 6, 4]} />
            <meshBasicMaterial
              color={entityTypeColor(entity.className)}
              wireframe
            />
          </mesh>
        )}
        <FlagMarkerSlot entity={entity} />
      </group>
    );
  }

  const fallback =
    entity.renderType === "Explosion" || !debugMode ? null : (
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
      ref={root}
      name={entity.id}
      position={position}
      quaternion={quaternion}
      scale={scale}
    >
      <group name="model">
        <ShapeErrorBoundary fallback={fallback}>
          <EntityRenderer entity={entity} objectMounts={objectMounts} />
        </ShapeErrorBoundary>
        <FlagMarkerSlot entity={entity} />
      </group>
    </group>
  );
}
