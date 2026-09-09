import { memo, useMemo, useCallback, useEffect, useId, useRef } from "react";
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
import { useLoader } from "@react-three/fiber";
import { type DIFMaterial, type DIFMesh } from "../dif/difLoader";
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

function InteriorMesh({ node }: { node: DIFMesh }) {
  useEffect(() => {
    invalidateShadows();
    return invalidateShadows;
  }, [node.geometry]);

  return (
    <mesh
      geometry={node.geometry}
      material={node.material}
      castShadow
      receiveShadow
    >
      <DebugSuspense
        name={`InteriorTexture:${node.material.resourcePath}`}
        fallback={null}
      >
        <InteriorTexture material={node.material} />
      </DebugSuspense>
    </mesh>
  );
}

export const InteriorModel = memo(function InteriorModel({
  interiorFile,
  ghostIndex,
  isTarget,
}: {
  interiorFile: string;
  ghostIndex?: number;
  isTarget?: boolean;
}) {
  const interior = useInterior(interiorFile);
  const { surfaceMeshes } = interior;
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
    registerInteriorCollider(
      collisionId,
      interiorColliderMeshes(group, interior),
    );
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
      invalidateTerrainLightmap();
      setShadowCasterBounds(collisionId, null);
    };
  }, [collisionId, interior]);

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
      {surfaceMeshes.map((node) => (
        <InteriorMesh key={node.name} node={node} />
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

function DebugInteriorPlaceholder({ label }: { label?: string }) {
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
  const isTarget = useIsDebugTourTarget(entity.id);
  const {
    position,
    quaternion: q,
    scale,
  } = useMemo(() => interiorPlacement(scene), [scene]);

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
        fallback={
          <DebugInteriorPlaceholder
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
          />
        </DebugSuspense>
      </ErrorBoundary>
    </group>
  );
});
