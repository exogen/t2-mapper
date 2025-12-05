import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, PlaneGeometry, RepeatWrapping } from "three";
import { textureToUrl } from "../loaders";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { setupColor } from "../textureUtils";
import { createWaterMaterial } from "../waterMaterial";
import { useSettings } from "./SettingsProvider";

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
 * Animated water surface material using Tribes 2-accurate shader.
 *
 * The Torque V12 engine renders water in multiple passes:
 * - Phase 1a/1b: Two cross-faded base texture passes, each rotated 30°
 * - Phase 3: Environment/specular map with reflection UVs
 * - Phase 4: Fog overlay
 */
export function WaterSurfaceMaterial({
  surfaceTexture,
  envMapTexture,
  opacity = 0.75,
  waveMagnitude = 1.0,
  envMapIntensity = 1.0,
  attach,
}: {
  surfaceTexture: string;
  envMapTexture?: string;
  opacity?: number;
  waveMagnitude?: number;
  envMapIntensity?: number;
  attach?: string;
}) {
  const baseUrl = textureToUrl(surfaceTexture);
  const envUrl = textureToUrl(envMapTexture ?? "special/lush_env");

  const [baseTexture, envTexture] = useTexture(
    [baseUrl, envUrl],
    (textures) => {
      const texArray = Array.isArray(textures) ? textures : [textures];
      texArray.forEach((tex) => {
        setupColor(tex);
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
      });
    },
  );

  const { animationEnabled } = useSettings();

  const material = useMemo(() => {
    return createWaterMaterial({
      opacity,
      waveMagnitude,
      envMapIntensity,
      baseTexture,
      envMapTexture: envTexture,
    });
  }, [opacity, waveMagnitude, envMapIntensity, baseTexture, envTexture]);

  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    if (!animationEnabled) {
      elapsedRef.current = 0;
      material.uniforms.uTime.value = 0;
      return;
    }
    elapsedRef.current += delta;
    material.uniforms.uTime.value = elapsedRef.current;
  });

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return <primitive object={material} attach={attach} />;
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
  const texture = useTexture(url, (texture) => setupColor(texture));

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
 */
export const WaterBlock = memo(function WaterBlock({
  object,
}: {
  object: TorqueObject;
}) {
  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);

  const surfaceTexture =
    getProperty(object, "surfaceTexture") ?? "liquidTiles/BlueWater";
  const envMapTexture = getProperty(object, "envMapTexture");
  const opacity = parseFloat(getProperty(object, "surfaceOpacity") ?? "0.75");
  const waveMagnitude = parseFloat(
    getProperty(object, "waveMagnitude") ?? "1.0",
  );
  const envMapIntensity = parseFloat(
    getProperty(object, "envMapIntensity") ?? "1.0",
  );

  // Create subdivided plane geometry for the water surface
  // Tessellation matches Tribes 2 engine (5x5 vertices per block)
  const surfaceGeometry = useMemo(() => {
    const [segmentsX, segmentsZ] = calculateWaterSegments(scaleX, scaleZ);

    // PlaneGeometry is created in XY plane, we'll rotate it to XZ
    const geom = new PlaneGeometry(scaleX, scaleZ, segmentsX, segmentsZ);

    // Rotate from XY plane to XZ plane (lying flat)
    geom.rotateX(-Math.PI / 2);

    // Translate so origin is at corner (matching Torque's water block positioning)
    // and position at top of water volume (Y = scaleY)
    geom.translate(scaleX / 2, scaleY, scaleZ / 2);

    return geom;
  }, [scaleX, scaleY, scaleZ]);

  useEffect(() => {
    return () => {
      surfaceGeometry.dispose();
    };
  }, [surfaceGeometry]);

  return (
    <group position={position} quaternion={q}>
      {/* Water surface - subdivided plane with wave shader */}
      <mesh geometry={surfaceGeometry}>
        <Suspense
          fallback={
            <meshStandardMaterial
              color="blue"
              transparent
              opacity={0.3}
              side={DoubleSide}
            />
          }
        >
          <WaterSurfaceMaterial
            attach="material"
            surfaceTexture={surfaceTexture}
            envMapTexture={envMapTexture}
            opacity={opacity}
            waveMagnitude={waveMagnitude}
            envMapIntensity={envMapIntensity}
          />
        </Suspense>
      </mesh>
    </group>
  );
});
