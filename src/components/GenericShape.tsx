import { memo, Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useGLTF, useTexture } from "@react-three/drei";
import { FALLBACK_TEXTURE_URL, textureToUrl, shapeToUrl } from "../loaders";
import { filterGeometryByVertexGroups, getHullBoneIndices } from "../meshUtils";
import {
  MeshStandardMaterial,
  MeshBasicMaterial,
  MeshLambertMaterial,
  AdditiveBlending,
  Texture,
  BufferGeometry,
} from "three";
import { setupColor, setupAlphaTestedTexture } from "../textureUtils";
import { useDebug } from "./SettingsProvider";
import { useShapeInfo, isOrganicShape } from "./ShapeInfoProvider";
import { FloatingLabel } from "./FloatingLabel";
import { useIflTexture } from "./useIflTexture";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { injectShapeLighting } from "../shapeMaterial";

/** Shared props for texture rendering components */
interface TextureProps {
  material: MeshStandardMaterial;
  shapeName?: string;
  geometry?: BufferGeometry;
  backGeometry?: BufferGeometry;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * DTS Material Flags (from tsShape.h):
 * - Translucent: Material has alpha transparency (smooth blending)
 * - Additive: Additive blending mode
 * - Subtractive: Subtractive blending mode
 * - SelfIlluminating: Fullbright, no lighting applied
 * - NeverEnvMap: Don't apply environment mapping
 */
type SingleMaterial =
  | MeshStandardMaterial
  | MeshBasicMaterial
  | MeshLambertMaterial;
type MaterialResult =
  | SingleMaterial
  | [MeshLambertMaterial, MeshLambertMaterial];

/**
 * Helper to apply volumetric fog and lighting multipliers to a material
 */
function applyShapeShaderModifications(
  mat: MeshBasicMaterial | MeshLambertMaterial,
): void {
  mat.onBeforeCompile = (shader) => {
    injectCustomFog(shader, globalFogUniforms);
    // Only inject lighting for Lambert materials (Basic materials are unlit)
    if (mat instanceof MeshLambertMaterial) {
      injectShapeLighting(shader);
    }
  };
}

function createMaterialFromFlags(
  baseMaterial: MeshStandardMaterial,
  texture: Texture,
  flagNames: Set<string>,
  isOrganic: boolean,
): MaterialResult {
  const isTranslucent = flagNames.has("Translucent");
  const isAdditive = flagNames.has("Additive");
  const isSelfIlluminating = flagNames.has("SelfIlluminating");
  const neverEnvMap = flagNames.has("NeverEnvMap");

  // SelfIlluminating materials are unlit (use MeshBasicMaterial)
  if (isSelfIlluminating) {
    const mat = new MeshBasicMaterial({
      map: texture,
      side: 2, // DoubleSide
      transparent: isAdditive,
      alphaTest: isAdditive ? 0 : 0.5,
      fog: true,
      ...(isAdditive && { blending: AdditiveBlending }),
    });
    applyShapeShaderModifications(mat);
    return mat;
  }

  // For organic shapes or Translucent flag, use alpha cutout with Lambert shading
  // Tribes 2 used fixed-function GL with specular disabled - purely diffuse lighting
  // MeshLambertMaterial gives us the diffuse-only look that matches the original
  // Return [BackSide, FrontSide] materials to render in two passes - avoids z-fighting
  if (isOrganic || isTranslucent) {
    const baseProps = {
      map: texture,
      transparent: false,
      alphaTest: 0.5,
      reflectivity: 0,
    };
    const backMat = new MeshLambertMaterial({
      ...baseProps,
      side: 1, // BackSide
      // Push back faces slightly behind in depth to avoid z-fighting with front
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const frontMat = new MeshLambertMaterial({
      ...baseProps,
      side: 0, // FrontSide
    });
    applyShapeShaderModifications(backMat);
    applyShapeShaderModifications(frontMat);
    return [backMat, frontMat];
  }

  // Default: use Lambert for diffuse-only lighting (matches Tribes 2)
  // Tribes 2 used fixed-function GL with specular disabled
  const mat = new MeshLambertMaterial({
    map: texture,
    side: 2, // DoubleSide
    reflectivity: 0,
  });
  applyShapeShaderModifications(mat);
  return mat;
}

/**
 * Load a .glb file that was converted from a .dts, used for static shapes.
 */
export function useStaticShape(shapeName: string) {
  const url = shapeToUrl(shapeName);
  return useGLTF(url);
}

/**
 * Animated IFL (Image File List) material component. Creates a sprite sheet
 * from all frames and animates via texture offset.
 */
const IflTexture = memo(function IflTexture({
  material,
  shapeName,
  geometry,
  backGeometry,
  castShadow = false,
  receiveShadow = false,
}: TextureProps) {
  const resourcePath = material.userData.resource_path;
  const flagNames = new Set<string>(material.userData.flag_names ?? []);
  const iflPath = `textures/${resourcePath}.ifl`;

  const texture = useIflTexture(iflPath);
  const isOrganic = shapeName && isOrganicShape(shapeName);

  const customMaterial = useMemo(
    () => createMaterialFromFlags(material, texture, flagNames, isOrganic),
    [material, texture, flagNames, isOrganic],
  );

  // Two-pass rendering for organic/translucent materials
  // Render BackSide first (with flipped normals), then FrontSide
  if (Array.isArray(customMaterial)) {
    return (
      <>
        <mesh
          geometry={backGeometry || geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[0]} attach="material" />
        </mesh>
        <mesh
          geometry={geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[1]} attach="material" />
        </mesh>
      </>
    );
  }

  return (
    <mesh
      geometry={geometry}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <primitive object={customMaterial} attach="material" />
    </mesh>
  );
});

const StaticTexture = memo(function StaticTexture({
  material,
  shapeName,
  geometry,
  backGeometry,
  castShadow = false,
  receiveShadow = false,
}: TextureProps) {
  const resourcePath = material.userData.resource_path;
  const flagNames = new Set<string>(material.userData.flag_names ?? []);

  const url = useMemo(() => {
    if (!resourcePath) {
      console.warn(
        `No resource_path was found on "${shapeName}" - rendering fallback.`,
      );
    }
    return resourcePath ? textureToUrl(resourcePath) : FALLBACK_TEXTURE_URL;
  }, [resourcePath, shapeName]);

  const isOrganic = shapeName && isOrganicShape(shapeName);
  const isTranslucent = flagNames.has("Translucent");

  const texture = useTexture(url, (texture) => {
    // Organic/alpha-tested textures need special handling to avoid mipmap artifacts
    if (isOrganic || isTranslucent) {
      return setupAlphaTestedTexture(texture);
    }
    // Standard color texture setup for diffuse-only materials
    return setupColor(texture);
  });

  const customMaterial = useMemo(
    () => createMaterialFromFlags(material, texture, flagNames, isOrganic),
    [material, texture, flagNames, isOrganic],
  );

  // Two-pass rendering for organic/translucent materials
  // Render BackSide first (with flipped normals), then FrontSide
  if (Array.isArray(customMaterial)) {
    return (
      <>
        <mesh
          geometry={backGeometry || geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[0]} attach="material" />
        </mesh>
        <mesh
          geometry={geometry}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <primitive object={customMaterial[1]} attach="material" />
        </mesh>
      </>
    );
  }

  return (
    <mesh
      geometry={geometry}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <primitive object={customMaterial} attach="material" />
    </mesh>
  );
});

export const ShapeTexture = memo(function ShapeTexture({
  material,
  shapeName,
  geometry,
  backGeometry,
  castShadow = false,
  receiveShadow = false,
}: TextureProps) {
  const flagNames = new Set(material.userData.flag_names ?? []);
  const isIflMaterial = flagNames.has("IflMaterial");
  const resourcePath = material.userData.resource_path;

  // Use IflTexture for animated materials
  if (isIflMaterial && resourcePath) {
    return (
      <IflTexture
        material={material}
        shapeName={shapeName}
        geometry={geometry}
        backGeometry={backGeometry}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      />
    );
  } else if (material.name) {
    return (
      <StaticTexture
        material={material}
        shapeName={shapeName}
        geometry={geometry}
        backGeometry={backGeometry}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      />
    );
  } else {
    return null;
  }
});

export function ShapePlaceholder({
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

export function DebugPlaceholder({
  color,
  label,
}: {
  color: string;
  label?: string;
}) {
  const { debugMode } = useDebug();
  return debugMode ? <ShapePlaceholder color={color} label={label} /> : null;
}

/**
 * Wrapper component that handles the common ErrorBoundary + Suspense + ShapeModel
 * pattern used across shape-rendering components.
 */
export function ShapeRenderer({
  shapeName,
  loadingColor = "yellow",
  children,
}: {
  shapeName: string | undefined;
  loadingColor?: string;
  children?: React.ReactNode;
}) {
  if (!shapeName) {
    return <DebugPlaceholder color="orange" />;
  }

  return (
    <ErrorBoundary
      fallback={<DebugPlaceholder color="red" label={shapeName} />}
    >
      <Suspense fallback={<ShapePlaceholder color={loadingColor} />}>
        <ShapeModel />
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export const ShapeModel = memo(function ShapeModel() {
  const { shapeName, isOrganic } = useShapeInfo();
  const { debugMode } = useDebug();
  const { nodes } = useStaticShape(shapeName);

  const hullBoneIndices = useMemo(() => {
    const skeletonsFound = Object.values(nodes).filter(
      (node: any) => node.skeleton,
    );

    if (skeletonsFound.length > 0) {
      const skeleton = (skeletonsFound[0] as any).skeleton;
      return getHullBoneIndices(skeleton);
    }
    return new Set<number>();
  }, [nodes]);

  const processedNodes = useMemo(() => {
    return Object.entries(nodes)
      .filter(
        ([name, node]: [string, any]) =>
          node.material &&
          node.material.name !== "Unassigned" &&
          !node.name.match(/^Hulk/i),
      )
      .map(([name, node]: [string, any]) => {
        let geometry = filterGeometryByVertexGroups(
          node.geometry,
          hullBoneIndices,
        );
        let backGeometry = null;

        // Compute smooth vertex normals for ALL shapes to match Tribes 2's lighting
        if (geometry) {
          geometry = geometry.clone();

          // First compute face normals
          geometry.computeVertexNormals();

          // Then smooth normals across vertices at the same position
          // This handles split vertices (for UV seams) that computeVertexNormals misses
          const posAttr = geometry.attributes.position;
          const normAttr = geometry.attributes.normal;
          const positions = posAttr.array as Float32Array;
          const normals = normAttr.array as Float32Array;

          // Build a map of position -> list of vertex indices at that position
          const positionMap = new Map<string, number[]>();
          for (let i = 0; i < posAttr.count; i++) {
            // Round to avoid floating point precision issues
            const key = `${positions[i * 3].toFixed(4)},${positions[i * 3 + 1].toFixed(4)},${positions[i * 3 + 2].toFixed(4)}`;
            if (!positionMap.has(key)) {
              positionMap.set(key, []);
            }
            positionMap.get(key)!.push(i);
          }

          // Average normals for vertices at the same position
          for (const indices of positionMap.values()) {
            if (indices.length > 1) {
              // Sum all normals at this position
              let nx = 0,
                ny = 0,
                nz = 0;
              for (const idx of indices) {
                nx += normals[idx * 3];
                ny += normals[idx * 3 + 1];
                nz += normals[idx * 3 + 2];
              }
              // Normalize the sum
              const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
              if (len > 0) {
                nx /= len;
                ny /= len;
                nz /= len;
              }
              // Apply averaged normal to all vertices at this position
              for (const idx of indices) {
                normals[idx * 3] = nx;
                normals[idx * 3 + 1] = ny;
                normals[idx * 3 + 2] = nz;
              }
            }
          }
          normAttr.needsUpdate = true;

          // For organic shapes, also create back geometry with flipped normals
          if (isOrganic) {
            backGeometry = geometry.clone();
            const backNormAttr = backGeometry.attributes.normal;
            const backNormals = backNormAttr.array;
            for (let i = 0; i < backNormals.length; i++) {
              backNormals[i] = -backNormals[i];
            }
            backNormAttr.needsUpdate = true;
          }
        }

        return { node, geometry, backGeometry };
      });
  }, [nodes, hullBoneIndices, isOrganic]);

  // Disable shadows for organic shapes to avoid artifacts with alpha-tested materials
  // Shadow maps don't properly handle alpha transparency, causing checkerboard patterns
  const enableShadows = !isOrganic;

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {processedNodes.map(({ node, geometry, backGeometry }) => (
        <Suspense
          key={node.id}
          fallback={
            <mesh geometry={geometry}>
              <meshStandardMaterial color="gray" wireframe />
            </mesh>
          }
        >
          {node.material ? (
            Array.isArray(node.material) ? (
              node.material.map((mat, index) => (
                <ShapeTexture
                  key={index}
                  material={mat as MeshStandardMaterial}
                  shapeName={shapeName}
                  geometry={geometry}
                  backGeometry={backGeometry}
                  castShadow={enableShadows}
                  receiveShadow={enableShadows}
                />
              ))
            ) : (
              <ShapeTexture
                material={node.material as MeshStandardMaterial}
                shapeName={shapeName}
                geometry={geometry}
                backGeometry={backGeometry}
                castShadow={enableShadows}
                receiveShadow={enableShadows}
              />
            )
          ) : null}
        </Suspense>
      ))}
      {debugMode ? <FloatingLabel>{shapeName}</FloatingLabel> : null}
    </group>
  );
});
