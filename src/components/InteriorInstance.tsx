import { memo, useMemo, useCallback, useEffect, useRef } from "react";
import { DebugSuspense } from "./DebugSuspense";
import { ErrorBoundary } from "react-error-boundary";
import { createLogger } from "../logger";
import {
  Mesh,
  Material,
  MeshStandardMaterial,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Texture,
  SRGBColorSpace,
  Box3,
  Vector3,
} from "three";
import { useGLTF, useTexture } from "@react-three/drei";
import { textureToUrl, interiorToUrl } from "../loaders";
import type { InteriorInstanceEntity } from "../state/gameEntityTypes";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugBounds } from "./DebugBounds";
import {
  torqueToThree,
  torqueScaleToThree,
  matrixFToQuaternion,
} from "../scene/coordinates";
import { setupTexture } from "../textureUtils";
import { invalidateShadows } from "./shadowControl";
import { FloatingLabel } from "./FloatingLabel";
import { useDebug } from "./SettingsProvider";
import { useAnisotropy } from "./useAnisotropy";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { injectInteriorLighting } from "../interiorMaterial";

const log = createLogger("InteriorInstance");

/**
 * Load a .gltf file that was converted from a .dif, used for "interior" models.
 */
function useInterior(interiorFile: string) {
  const url = interiorToUrl(interiorFile);
  return useGLTF(url);
}

function InteriorTexture({
  materialName,
  material,
  lightMap,
}: {
  materialName: string;
  material?: Material;
  lightMap?: Texture | null;
}) {
  const debugContext = useDebug();
  const debugMode = debugContext?.debugMode ?? false;
  const anisotropy = useAnisotropy();
  const url = textureToUrl(materialName);
  const texture = useTexture(url, (texture) =>
    setupTexture(texture, { anisotropy }),
  );
  // Check for self-illuminating flag in material userData
  // Note: The io_dif Blender add-on needs to be updated to export material flags
  const flagNames = new Set<string>(material?.userData?.flag_names ?? []);
  const isSelfIlluminating = flagNames.has("SelfIlluminating");
  // Check for SurfaceOutsideVisible flag (surfaces that receive scene ambient light)
  const surfaceFlagNames = new Set<string>(
    material?.userData?.surface_flag_names ?? [],
  );
  const isSurfaceOutsideVisible = surfaceFlagNames.has("SurfaceOutsideVisible");
  // Inject volumetric fog and lighting multipliers into materials
  // NOTE: This hook must be called unconditionally (before any early returns)
  const onBeforeCompile = useCallback(
    (shader: any) => {
      injectCustomFog(shader, globalFogUniforms);
      injectInteriorLighting(shader, {
        surfaceOutsideVisible: isSurfaceOutsideVisible,
      });
    },
    [isSurfaceOutsideVisible],
  );
  // Refs for forcing shader recompilation
  const basicMaterialRef = useRef<MeshBasicMaterial>(null);
  const lambertMaterialRef = useRef<MeshLambertMaterial>(null);
  // Force shader recompilation when debugMode changes
  // r3f doesn't sync defines prop changes, so we update the material directly
  useEffect(() => {
    const mat = (basicMaterialRef.current ?? lambertMaterialRef.current) as
      (Material & { defines?: Record<string, number> }) | null;
    if (mat) {
      mat.defines ??= {};
      mat.defines.DEBUG_MODE = debugMode ? 1 : 0;
      mat.needsUpdate = true;
    }
  }, [debugMode]);
  const defines = { DEBUG_MODE: debugMode ? 1 : 0 };
  // Key for shader structure changes (surfaceOutsideVisible affects lighting model)
  const materialKey = `${isSurfaceOutsideVisible}`;
  // Self-illuminating materials are fullbright (unlit), no lightmap
  if (isSelfIlluminating) {
    return (
      <meshBasicMaterial
        ref={basicMaterialRef}
        key={materialKey}
        map={texture}
        toneMapped={false}
        defines={defines}
        onBeforeCompile={onBeforeCompile}
      />
    );
  }
  // MeshLambertMaterial for diffuse-only lighting (matches Tribes 2's GL pipeline)
  // Shader modifications in onBeforeCompile:
  // - Outside surfaces (SurfaceOutsideVisible): scene lighting + additive lightmap
  // - Inside surfaces (ZoneInside): additive lightmap only, no scene lighting
  // Lightmap intensity is handled in the shader, not via material prop
  // toneMapped={false} to match Torque's direct output (no HDR tone mapping)
  // Using FrontSide (default) - normals are fixed in io_dif Blender export
  return (
    <meshLambertMaterial
      ref={lambertMaterialRef}
      key={materialKey}
      map={texture}
      lightMap={lightMap}
      toneMapped={false}
      defines={defines}
      onBeforeCompile={onBeforeCompile}
    />
  );
}

/**
 * Extract lightmap texture from a glTF material.
 * The io_dif Blender addon stores lightmaps in the emissive channel for transport.
 *
 * Torque (2001) multiplied base_texture * lightmap directly in gamma/sRGB space
 * with no gamma correction. The lightmap PNGs contain sRGB-encoded values.
 * By setting colorSpace to SRGBColorSpace, Three.js correctly decodes the sRGB
 * values to linear for its lighting calculations.
 */
function getLightMap(material: Material | null): Texture | null {
  if (!material) return null;
  // glTF materials come through as MeshStandardMaterial
  const stdMat = material as MeshStandardMaterial;
  // Lightmap is stored in emissiveMap with 0 strength (just for glTF transport)
  const lightMap = stdMat.emissiveMap;
  if (lightMap) {
    // Lightmaps are sRGB-encoded PNGs - decode to linear for correct lighting
    lightMap.colorSpace = SRGBColorSpace;
  }
  return lightMap ?? null;
}

function InteriorMesh({ node }: { node: Mesh }) {
  // Extract lightmaps from original materials (stored in emissiveMap for glTF transport)
  const lightMaps = useMemo(() => {
    if (!node.material) return [];
    if (Array.isArray(node.material)) {
      return node.material.map((m) => getLightMap(m));
    }
    return [getLightMap(node.material)];
  }, [node.material]);

  // Shadow map is frozen (shadowControl.ts); newly loaded interior
  // geometry must trigger a one-time re-render, as must unmount.
  useEffect(() => {
    invalidateShadows();
    return invalidateShadows;
  }, [node.geometry]);

  return (
    <mesh geometry={node.geometry} castShadow receiveShadow>
      {node.material ? (
        <DebugSuspense
          name={`InteriorTexture:${Array.isArray(node.material) ? node.material[0]?.userData?.resource_path : (node.material?.userData?.resource_path ?? "?")}`}
          fallback={
            // Allow the mesh to render while the texture is still loading;
            // show a wireframe placeholder.
            <meshStandardMaterial color="yellow" wireframe />
          }
        >
          {Array.isArray(node.material) ? (
            node.material.map((mat, index) => (
              <InteriorTexture
                key={index}
                materialName={mat.userData.resource_path}
                material={mat}
                lightMap={lightMaps[index]}
              />
            ))
          ) : (
            <InteriorTexture
              materialName={node.material.userData.resource_path}
              material={node.material}
              lightMap={lightMaps[0]}
            />
          )}
        </DebugSuspense>
      ) : null}
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
  const gltf = useInterior(interiorFile);
  const { nodes } = gltf;
  const debugContext = useDebug();
  const debugMode = debugContext?.debugMode ?? false;

  const debugBounds = useMemo(() => {
    if (!isTarget) return null;
    const box = new Box3().setFromObject(gltf.scene);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    return {
      center: [center.x, center.y, center.z] as [number, number, number],
      size: [size.x, size.y, size.z] as [number, number, number],
    };
  }, [isTarget, gltf.scene]);

  return (
    <group rotation={[0, -Math.PI / 2, 0]}>
      {Object.entries(nodes)
        .filter(([, node]: [string, any]) => node.isMesh)
        .map(([name, node]: [string, any]) => (
          <InteriorMesh key={name} node={node} />
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
  const position = useMemo(
    () => torqueToThree(scene.transform.position),
    [scene.transform.position],
  );
  const q = useMemo(
    () => matrixFToQuaternion(scene.transform),
    [scene.transform],
  );
  const scale = useMemo(() => torqueScaleToThree(scene.scale), [scene.scale]);

  return (
    <group position={position} quaternion={q} scale={scale}>
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
