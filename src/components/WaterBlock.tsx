import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Box, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, NoColorSpace, PlaneGeometry, RepeatWrapping } from "three";
import { textureToUrl } from "../loaders";
import {
  torqueToThree,
  torqueScaleToThree,
  matrixFToQuaternion,
} from "../scene";
import { setupTexture } from "../textureUtils";
import { useAnisotropy } from "./useAnisotropy";
import { createWaterMaterial } from "../waterMaterial";
import { useDebug, useSettings } from "./SettingsProvider";
import { usePositionTracker } from "./usePositionTracker";
import { WaterBlockEntity } from "../state/gameEntityTypes";

const REP_SIZE = 2048;

/**
 * Terrain coordinate offset from world space.
 * In Tribes 2, terrain coordinates are offset by +1024 from world coordinates.
 * This allows world positions like (-672, -736) to map to valid terrain
 * positions (352, 288) after the offset.
 */
const TERRAIN_OFFSET = 1024;

/**
 * Calculate tessellation to match Tribes 2 engine.
 *
 * The engine uses two modes based on water size:
 * - High-res mode (size <= 1024): 32-unit blocks with 5x5 vertices = 8 units between verts
 * - Normal mode (size > 1024): 64-unit blocks with 5x5 vertices = 16 units between verts
 *
 * Each block has 4 segments (5 vertices across), creating 32 triangles per block.
 */
function calculateWaterSegments(
  sizeX: number,
  sizeZ: number,
): [number, number] {
  // High-res mode threshold: 1024 world units (128 terrain squares × 8 units)
  const isHighRes = sizeX <= 1024 && sizeZ <= 1024;

  // Vertex spacing: 8 units for high-res, 16 units for normal
  const vertexSpacing = isHighRes ? 8 : 16;

  // Calculate segments (vertices - 1)
  const segmentsX = Math.max(4, Math.ceil(sizeX / vertexSpacing));
  const segmentsZ = Math.max(4, Math.ceil(sizeZ / vertexSpacing));

  return [segmentsX, segmentsZ];
}

/**
 * Simple fallback material for non-top faces and loading state.
 */
export function WaterMaterial({
  surfaceTexture,
  attach,
}: {
  surfaceTexture: string;
  attach?: string;
}) {
  const url = textureToUrl(surfaceTexture);
  const anisotropy = useAnisotropy();
  const texture = useTexture(url, (texture) =>
    setupTexture(texture, { anisotropy }),
  );

  return (
    <meshStandardMaterial
      attach={attach}
      map={texture}
      transparent
      opacity={0.8}
      side={DoubleSide}
    />
  );
}

/**
 * WaterBlock component that renders water with Tribes 2-accurate animation.
 *
 * The water surface uses a custom shader that replicates the original Torque
 * engine's multi-pass rendering:
 * - Dual cross-faded base textures with 30° rotation
 * - Sinusoidal wave displacement
 * - Environment map reflection with animated UVs
 *
 * Unlike a simple box, we use a subdivided PlaneGeometry for the water surface
 * so that vertex displacement can create visible waves.
 *
 * Water tiling follows Torque's FluidQuadTree.cc behavior:
 * - Determines camera's terrain "rep" via I = (s32)(m_Eye.X / 2048.0f)
 * - Renders 9 reps (3x3 grid) centered on camera's rep
 */
export const WaterBlock = memo(function WaterBlock({
  entity,
}: {
  entity: WaterBlockEntity;
}) {
  const scene = entity.waterData;
  const { debugMode } = useDebug();
  const q = useMemo(
    () => matrixFToQuaternion(scene.transform),
    [scene.transform],
  );
  const position = useMemo(
    () => torqueToThree(scene.transform.position),
    [scene.transform],
  );
  const scale = useMemo(() => torqueScaleToThree(scene.scale), [scene.scale]);
  const [scaleX, scaleY, scaleZ] = scale;
  const camera = useThree((state) => state.camera);
  const hasCameraPositionChanged = usePositionTracker();

  const waveMagnitude = scene.waveMagnitude;

  // Convert world position to terrain space and snap to grid.
  // Matches Torque's UpdateFluidRegion() and fluid::SetInfo():
  // 1. Add TERRAIN_OFFSET (1024) to convert world -> terrain space
  // 2. Round to nearest terrain square: (s32)((X0 / 8.0f) + 0.5f) = Math.round(x/8)
  // 3. Clamp to valid terrain range [0, 2040] squares
  // 4. Convert back to world units (multiply by 8)
  const basePosition = useMemo(() => {
    const [x, y, z] = position;

    // Convert to terrain space (add 1024 offset)
    const terrainX = x + TERRAIN_OFFSET;
    const terrainZ = z + TERRAIN_OFFSET;

    // Round to terrain squares: (s32)((X0 / 8.0f) + 0.5f) is Math.round()
    let squareX = Math.round(terrainX / 8);
    let squareZ = Math.round(terrainZ / 8);

    // Clamp to valid range [0, 2040] as in fluidSupport.cc
    squareX = Math.max(0, Math.min(2040, squareX));
    squareZ = Math.max(0, Math.min(2040, squareZ));

    // Convert back to world units (terrain squares * 8)
    // This is the fluid's anchor point in terrain space
    const baseX = squareX * 8;
    const baseZ = squareZ * 8;

    return [baseX, y, baseZ] as [number, number, number];
  }, [position]);

  // Calculate 3x3 grid of reps centered on camera position.
  // ALL water blocks use 9-rep tiling - the masking system handles visibility.
  // Matches fluidQuadTree.cc RunQuadTree():
  //   I = (s32)(m_Eye.X / 2048.0f);
  //   if( m_Eye.X < 0.0f )  I--;
  const calculateReps = (
    camX: number,
    camZ: number,
  ): Array<[number, number]> => {
    // Convert camera to terrain space
    const terrainCamX = camX + TERRAIN_OFFSET;
    const terrainCamZ = camZ + TERRAIN_OFFSET;

    // Determine camera's terrain rep using terrain coordinates.
    // Torque uses: I = (s32)(m_Eye.X / 2048.0f); if (m_Eye.X < 0) I--;
    // This is truncation toward zero, then decrement for negative.
    let cameraRepX = Math.trunc(terrainCamX / REP_SIZE);
    let cameraRepZ = Math.trunc(terrainCamZ / REP_SIZE);
    if (terrainCamX < 0) cameraRepX--;
    if (terrainCamZ < 0) cameraRepZ--;

    // Build 3x3 grid of reps around camera
    const newReps: Array<[number, number]> = [];
    for (let repZ = cameraRepZ - 1; repZ <= cameraRepZ + 1; repZ++) {
      for (let repX = cameraRepX - 1; repX <= cameraRepX + 1; repX++) {
        newReps.push([repX, repZ]);
      }
    }
    return newReps;
  };

  // Track which reps to render, updated each frame based on camera position.
  // Initialize with current camera position so water is visible immediately.
  const [reps, setReps] = useState<Array<[number, number]>>(() =>
    calculateReps(camera.position.x, camera.position.z),
  );

  useFrame(() => {
    if (!hasCameraPositionChanged(camera.position)) {
      return;
    }

    const newReps = calculateReps(camera.position.x, camera.position.z);

    // Only update state if reps actually changed (avoid unnecessary re-renders)
    setReps((prevReps) => {
      if (JSON.stringify(prevReps) === JSON.stringify(newReps)) {
        return prevReps;
      }
      return newReps;
    });
  });

  const surfaceTexture = scene.surfaceName || "liquidTiles/BlueWater";
  const envMapTexture = scene.envMapName || undefined;
  const opacity = scene.surfaceOpacity;
  const envMapIntensity = scene.envMapIntensity;

  // Create subdivided plane geometry for the water surface
  // Tessellation matches Tribes 2 engine (5x5 vertices per block)
  const surfaceGeometry = useMemo(() => {
    const [segmentsX, segmentsZ] = calculateWaterSegments(scaleX, scaleZ);

    // PlaneGeometry is created in XY plane, we'll rotate it to XZ
    const geom = new PlaneGeometry(scaleX, scaleZ, segmentsX, segmentsZ);

    // Rotate from XY plane to XZ plane (lying flat)
    geom.rotateX(-Math.PI / 2);

    // Position at top of water volume (Y = scaleY)
    // Offset by half scale to put corner at origin (position is corner after modulo)
    geom.translate(scaleX / 2, scaleY, scaleZ / 2);

    return geom;
  }, [scaleX, scaleY, scaleZ]);

  useEffect(() => {
    return () => {
      surfaceGeometry.dispose();
    };
  }, [surfaceGeometry]);

  // Render each rep that overlaps with terrain bounds
  return (
    <group quaternion={q}>
      {/* Debug wireframe showing actual water block bounds */}
      {debugMode && (
        <Box
          args={scale}
          position={[
            position[0] + scaleX / 2,
            position[1] + scaleY / 2,
            position[2] + scaleZ / 2,
          ]}
        >
          <meshBasicMaterial color="#00fbff" wireframe />
        </Box>
      )}
      <Suspense
        fallback={reps.map(([repX, repZ]) => {
          // Convert from terrain space to world space by subtracting TERRAIN_OFFSET
          // Matches Torque's L2Wm transform: L2Wv = (-1024, -1024, 0)
          const worldX = basePosition[0] + repX * REP_SIZE - TERRAIN_OFFSET;
          const worldZ = basePosition[2] + repZ * REP_SIZE - TERRAIN_OFFSET;
          return (
            <mesh
              key={`${repX},${repZ}`}
              geometry={surfaceGeometry}
              position={[worldX, basePosition[1], worldZ]}
            >
              <meshStandardMaterial
                color="#00fbff"
                transparent
                opacity={0.4}
                wireframe
                side={DoubleSide}
              />
            </mesh>
          );
        })}
      >
        <WaterReps
          reps={reps}
          basePosition={basePosition}
          surfaceGeometry={surfaceGeometry}
          surfaceTexture={surfaceTexture}
          envMapTexture={envMapTexture}
          opacity={opacity}
          waveMagnitude={waveMagnitude}
          envMapIntensity={envMapIntensity}
        />
      </Suspense>
    </group>
  );
});

/**
 * Inner component that renders all water reps with a shared material.
 * Separated to allow Suspense boundary around texture loading while
 * ensuring all reps share the same material instance and animation.
 */
const WaterReps = memo(function WaterReps({
  reps,
  basePosition,
  surfaceGeometry,
  surfaceTexture,
  envMapTexture,
  opacity,
  waveMagnitude,
  envMapIntensity,
}: {
  reps: Array<[number, number]>;
  basePosition: [number, number, number];
  surfaceGeometry: PlaneGeometry;
  surfaceTexture: string;
  envMapTexture: string | undefined;
  opacity: number;
  waveMagnitude: number;
  envMapIntensity: number;
}) {
  const baseUrl = textureToUrl(surfaceTexture);
  const envUrl = textureToUrl(envMapTexture ?? "special/lush_env");
  const anisotropy = useAnisotropy();

  const [baseTexture, envTexture] = useTexture(
    [baseUrl, envUrl],
    (textures) => {
      const texArray = Array.isArray(textures) ? textures : [textures];
      texArray.forEach((tex) => {
        setupTexture(tex, { anisotropy });
        tex.colorSpace = NoColorSpace;
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
      });
    },
  );

  const { animationEnabled } = useSettings();

  // Single shared material for all water reps
  const material = useMemo(() => {
    return createWaterMaterial({
      opacity,
      waveMagnitude,
      envMapIntensity,
      baseTexture,
      envMapTexture: envTexture,
    });
  }, [opacity, waveMagnitude, envMapIntensity, baseTexture, envTexture]);

  // Single animation loop for the shared material
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    if (!animationEnabled) {
      elapsedRef.current = 0;
      material.uniforms.uTime.value = 0;
    } else {
      elapsedRef.current += delta;
      material.uniforms.uTime.value = elapsedRef.current;
    }
  });

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <>
      {reps.map(([repX, repZ]) => {
        // Convert from terrain space to world space by subtracting TERRAIN_OFFSET
        // Matches Torque's L2Wm transform: L2Wv = (-1024, -1024, 0)
        const worldX = basePosition[0] + repX * REP_SIZE - TERRAIN_OFFSET;
        const worldZ = basePosition[2] + repZ * REP_SIZE - TERRAIN_OFFSET;
        return (
          <mesh
            key={`${repX},${repZ}`}
            geometry={surfaceGeometry}
            material={material}
            position={[worldX, basePosition[1], worldZ]}
          />
        );
      })}
    </>
  );
});
