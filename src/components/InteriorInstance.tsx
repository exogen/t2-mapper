import {
  memo,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
} from "react";
import { DebugSuspense } from "./DebugSuspense";
import { ErrorBoundary } from "react-error-boundary";
import { createLogger } from "../logger";
import {
  Material,
  MeshLambertMaterial,
  Box3,
  Vector3,
  type Group,
  type Texture,
} from "three";
import { useTexture } from "@react-three/drei";
import { useLoader, useThree } from "@react-three/fiber";
import { type DIFMaterial, type DIFMesh } from "../dif/difLoader";
import { DIFLighting } from "../dif/difLighting";
import { DIFCollisionMesh } from "../dif/difCollision";
import { interiorLightingTime } from "../scene/interiorAlarm";
import type { SceneInteriorInstance } from "../scene/types";
import { invalidateInteriorLighting } from "../shapeLighting";
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { InteriorLoader } from "../interiorLoader";
import { textureToUrl, interiorToUrl } from "../loaders";
import type { InteriorInstanceEntity } from "../state/gameEntityTypes";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugBounds } from "./DebugBounds";
import { interiorPlacement } from "../world/placement";
import { interiorColliderMeshes } from "../world/colliderPolicy";
import { setupTexture } from "../textureUtils";
import { invalidateShadows } from "./shadowControl";
import { invalidateTerrainLightmap } from "./terrainLightmapControl";
import { setShadowCasterBounds } from "../shadowBounds";
import { freezeStaticMatrices, unfreezeStaticMatrices } from "./staticMatrices";
import {
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";
import { FloatingLabel } from "./FloatingLabel";
import { useDebug } from "./SettingsProvider";
import { useAnisotropy } from "./useAnisotropy";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { injectInteriorLighting } from "../interiorMaterial";
import { registerCollisionLoadFailure } from "../collision/collisionContext";

const log = createLogger("InteriorInstance");

/** Load original DIF geometry, surface flags, and embedded lightmaps. */
function useInterior(interiorFile: string) {
  return useLoader(InteriorLoader, interiorToUrl(interiorFile));
}

function InteriorTexture({ material }: { material: DIFMaterial }) {
  const debugContext = useDebug();
  const debugMode = debugContext?.debugMode ?? false;
  const anisotropy = useAnisotropy();
  const url = textureToUrl(material.resourcePath);
  const configureTexture = useCallback(
    (texture: Texture) => {
      setupTexture(texture, { anisotropy });
    },
    [anisotropy],
  );
  const texture = useTexture(url, configureTexture);
  const isSurfaceOutsideVisible = material.outsideVisible;
  // Inject volumetric fog and lighting multipliers into materials
  const onBeforeCompile = useCallback(
    (shader: any) => {
      injectCustomFog(shader, globalFogUniforms);
      injectInteriorLighting(shader, {
        surfaceOutsideVisible: isSurfaceOutsideVisible,
        dynamicLights: true,
      });
    },
    [isSurfaceOutsideVisible],
  );
  const materialRef = useRef<MeshLambertMaterial>(null);
  useEffect(() => {
    const mat = materialRef.current as
      (Material & { defines?: Record<string, number> }) | null;
    if (mat) {
      mat.defines ??= {};
      mat.defines.DEBUG_MODE = debugMode ? 1 : 0;
      mat.needsUpdate = true;
    }
  }, [debugMode]);

  return (
    <primitive
      ref={materialRef}
      object={material}
      attach="material"
      map={texture}
      defines={{ DEBUG_MODE: debugMode ? 1 : 0 }}
      onBeforeCompile={onBeforeCompile}
      customProgramCacheKey={() => `dif:${isSurfaceOutsideVisible}`}
    />
  );
}

function InteriorMesh({
  node,
  material,
  prepare,
}: {
  node: DIFMesh;
  material: DIFMaterial;
  prepare?: (material: DIFMaterial) => void;
}) {
  const onBeforeRender = useCallback(
    () => prepare?.(material),
    [prepare, material],
  );
  useEffect(() => {
    invalidateShadows();
    return invalidateShadows;
  }, [node.geometry]);

  return (
    <mesh
      geometry={node.geometry}
      material={material}
      onBeforeRender={prepare ? onBeforeRender : node.onBeforeRender}
      castShadow
      receiveShadow
    >
      <DebugSuspense
        name={`InteriorTexture:${node.material.resourcePath}`}
        fallback={null}
      >
        <InteriorTexture material={material} />
      </DebugSuspense>
    </mesh>
  );
}

export const InteriorModel = memo(function InteriorModel({
  interiorFile,
  ghostIndex,
  isTarget,
  lightingState,
}: {
  interiorFile: string;
  ghostIndex?: number;
  isTarget?: boolean;
  lightingState?: SceneInteriorInstance;
}) {
  const interior = useInterior(interiorFile);
  const { surfaceMeshes } = interior;
  const lighting = useMemo(() => new DIFLighting(interior), [interior]);
  const colliderMeshes = useRef<DIFCollisionMesh[]>([]);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => () => lighting.dispose(), [lighting]);
  useLayoutEffect(() => {
    if (lighting.setAlarmState(lightingState?.alarmState ?? false)) {
      for (const mesh of colliderMeshes.current)
        mesh.alarmState = lighting.alarmState;
      invalidateInteriorLighting();
    }
    invalidate();
  }, [lighting, lightingState, invalidate]);
  const prepare = useCallback(
    (material: DIFMaterial) => {
      const time = engineStore.getState().playback.recording
        ? streamClock.worldTime
        : performance.now() / 1000;
      const lightTime = interiorLightingTime(
        lightingState,
        time,
        lighting.model.interior.hasAlarmState,
      );
      lighting.prepare(material, lightTime * 1000);
    },
    [lighting, lightingState],
  );
  const debugContext = useDebug();
  const debugMode = debugContext?.debugMode ?? false;

  // Register this interior's native BSP/hulls for collision. Interiors
  // are static, so world matrices are snapshotted once after mount.
  // Which meshes qualify is `interiorColliderMeshes` — shared with the
  // headless world builder so both see identical geometry.
  // Keyed on the GHOST index, not `entity.id` (a per-session counter
  // that differs between stacks) and not `useId` (React-internal), so a
  // dump of this world is comparable with a headless build's. Mission
  // mode has no ghosts, hence the fallback.
  const fallbackId = useId();
  const collisionId = ghostIndex != null ? `ghost:${ghostIndex}` : fallbackId;
  const meshGroupRef = useRef<Group>(null);
  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) return;
    const meshes = interiorColliderMeshes(
      group,
      interior,
    ) as DIFCollisionMesh[];
    colliderMeshes.current = meshes;
    for (const mesh of meshes) mesh.alarmState = lighting.alarmState;
    registerInteriorCollider(collisionId, meshes);
    // This building's shadow on the ground is baked into the terrain
    // lightmap, and that bake reads the interior colliders.
    invalidateTerrainLightmap();
    // Interiors cast into the sun's shadow map, and a tower can stand
    // above the terrain's own bounds, so the frustum has to include them.
    setShadowCasterBounds(collisionId, new Box3().setFromObject(group));
    // Static geometry: stop three from recomposing every mesh's matrix on
    // every frame. Interiors are the biggest static subtrees in the scene.
    freezeStaticMatrices(group);
    return () => {
      unfreezeStaticMatrices(group);
      unregisterInteriorCollider(collisionId);
      colliderMeshes.current = [];
      invalidateTerrainLightmap();
      setShadowCasterBounds(collisionId, null);
    };
  }, [collisionId, interior, lighting]);

  const debugBounds = useMemo(() => {
    if (!isTarget) return null;
    const box = new Box3().setFromObject(interior.scene);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    return {
      center: [center.x, center.y, center.z] as [number, number, number],
      size: [size.x, size.y, size.z] as [number, number, number],
    };
  }, [isTarget, interior.scene]);

  return (
    <group ref={meshGroupRef} dispose={null}>
      {surfaceMeshes.map((node, i) => (
        <InteriorMesh
          key={node.name}
          node={node}
          material={lighting.materials[i]}
          prepare={
            lighting.hasAnimatedLightMap(
              lighting.materials[i],
              lightingState?.alarmState ?? false,
            )
              ? prepare
              : undefined
          }
        />
      ))}
      {debugMode ? (
        <FloatingLabel>
          {ghostIndex}: {interiorFile}
        </FloatingLabel>
      ) : null}
      {debugBounds && (
        <group position={debugBounds.center}>
          <DebugBounds size={debugBounds.size} />
        </group>
      )}
    </group>
  );
});

function InteriorPlaceholder({
  color,
  label,
}: {
  color: string;
  label?: string;
}) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
      {label ? <FloatingLabel color={color}>{label}</FloatingLabel> : null}
    </mesh>
  );
}

function FailedInterior({
  ghostIndex,
  label,
}: {
  ghostIndex: number;
  label: string;
}) {
  useEffect(() => registerCollisionLoadFailure(ghostIndex), [ghostIndex]);
  const debugContext = useDebug();
  const debugMode = debugContext?.debugMode ?? false;
  return debugMode ? <InteriorPlaceholder color="red" label={label} /> : null;
}

export const InteriorInstance = memo(function InteriorInstance({
  entity,
}: {
  entity: InteriorInstanceEntity;
}) {
  const scene = entity.interiorData;
  const { transform, scale: sceneScale } = scene;
  const isTarget = useIsDebugTourTarget(entity.id);
  const {
    position,
    quaternion: q,
    scale,
  } = useMemo(
    () => interiorPlacement({ transform, scale: sceneScale }),
    [transform, sceneScale],
  );

  // The placement group never moves after the ghost's transform is applied;
  // freeze it (the model's own subtree freezes separately once it loads).
  const rootRef = useRef<Group>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    freezeStaticMatrices(root);
    return () => unfreezeStaticMatrices(root);
  }, [position, q, scale]);

  return (
    <group ref={rootRef} position={position} quaternion={q} scale={scale}>
      <ErrorBoundary
        resetKeys={[scene.interiorFile, scene.ghostIndex]}
        fallback={
          <FailedInterior
            ghostIndex={scene.ghostIndex}
            label={`${scene.ghostIndex}: ${scene.interiorFile}`}
          />
        }
        onError={(error) => {
          log.error(
            "Failed to load %s: %s",
            scene.interiorFile,
            (error as Error).message,
          );
        }}
      >
        <DebugSuspense
          name={`InteriorModel:${scene.interiorFile}`}
          fallback={<InteriorPlaceholder color="orange" />}
        >
          <InteriorModel
            interiorFile={scene.interiorFile}
            ghostIndex={scene.ghostIndex}
            isTarget={isTarget}
            lightingState={scene}
          />
        </DebugSuspense>
      </ErrorBoundary>
    </group>
  );
});
