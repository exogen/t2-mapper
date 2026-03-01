import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  NoColorSpace,
  RepeatWrapping,
  Texture,
} from "three";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { textureToUrl } from "../loaders";
import { useSettings } from "./SettingsProvider";
import { useDatablock } from "./useDatablock";
import {
  createForceFieldMaterial,
  OPACITY_FACTOR,
} from "../forceFieldMaterial";

/**
 * Get texture URLs from datablock.
 * Datablock defines textures as texture[0], texture[1], etc. which become
 * properties texture0, texture1, etc. (TorqueScript array indexing flattens to suffix)
 */
function getTextureUrls(
  datablock: TorqueObject | undefined,
  numFrames: number,
): string[] {
  const textures: string[] = [];
  for (let i = 0; i < numFrames; i++) {
    // TorqueScript array indexing: texture[0] -> texture0
    const texturePath = getProperty(datablock, `texture${i}`);
    if (texturePath) {
      textures.push(textureToUrl(texturePath));
    }
  }
  return textures;
}

function parseColor(colorStr: string): [number, number, number] {
  const parts = colorStr.split(" ").map((s) => parseFloat(s));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function setupForceFieldTexture(texture: Texture) {
  texture.wrapS = texture.wrapT = RepeatWrapping;
  // NoColorSpace - values pass through directly to display without conversion,
  // matching how WaterBlock handles textures in custom ShaderMaterial.
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
}

/**
 * Creates a box geometry with origin at corner (like Torque) instead of center.
 * Handles disposal automatically.
 */
function useCornerBoxGeometry(scale: [number, number, number]) {
  const geometry = useMemo(() => {
    const [x, y, z] = scale;
    const geom = new BoxGeometry(x, y, z);
    geom.translate(x / 2, y / 2, z / 2);
    return geom;
  }, [scale]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return geometry;
}

interface ForceFieldGeometryProps {
  scale: [number, number, number];
  color: [number, number, number];
  baseTranslucency: number;
}

interface ForceFieldMeshProps extends ForceFieldGeometryProps {
  textureUrls: string[];
  numFrames: number;
  framesPerSec: number;
  scrollSpeed: number;
  umapping: number;
  vmapping: number;
}

function ForceFieldMesh({
  scale,
  color,
  baseTranslucency,
  textureUrls,
  numFrames,
  framesPerSec,
  scrollSpeed,
  umapping,
  vmapping,
}: ForceFieldMeshProps) {
  const { animationEnabled } = useSettings();
  const geometry = useCornerBoxGeometry(scale);
  const textures = useTexture(textureUrls, (textures) => {
    textures.forEach((tex) => setupForceFieldTexture(tex));
  });

  // Create shader material once (uniforms updated in useFrame)
  const material = useMemo(() => {
    return createForceFieldMaterial({
      textures,
      scale,
      umapping,
      vmapping,
      color,
      baseTranslucency,
    });
  }, [textures, scale, umapping, vmapping, color, baseTranslucency]);

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  // Animation state
  const elapsedRef = useRef(0);

  // Animate frame and scroll
  useFrame((_, delta) => {
    if (!animationEnabled) {
      elapsedRef.current = 0;
      material.uniforms.currentFrame.value = 0;
      material.uniforms.vScroll.value = 0;
      return;
    }

    elapsedRef.current += delta;

    // Frame animation
    material.uniforms.currentFrame.value =
      Math.floor(elapsedRef.current * framesPerSec) % numFrames;

    // UV scrolling
    material.uniforms.vScroll.value = elapsedRef.current * scrollSpeed;
  });

  // renderOrder ensures force fields render after water (which uses default 0).
  // Water writes depth, force fields don't - so depth testing gives correct
  // per-pixel occlusion (underwater force fields are hidden, above-water visible).
  return <mesh geometry={geometry} material={material} renderOrder={1} />;
}

function ForceFieldFallback({
  scale,
  color,
  baseTranslucency,
}: ForceFieldGeometryProps) {
  const geometry = useCornerBoxGeometry(scale);

  // Use color directly - no gamma correction needed to match main shader
  const fallbackColor = useMemo(
    () => new Color(color[0], color[1], color[2]),
    [color],
  );

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial
        color={fallbackColor}
        transparent
        opacity={baseTranslucency * OPACITY_FACTOR}
        blending={AdditiveBlending}
        side={DoubleSide}
        depthWrite={false}
        fog={false} // Standard fog doesn't work with additive blending
      />
    </mesh>
  );
}

export const ForceFieldBare = memo(function ForceFieldBare({
  object,
}: {
  object: TorqueObject;
}) {
  const position = useMemo(() => getPosition(object), [object]);
  const quaternion = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  // Look up the datablock - rendering properties like color, translucency, etc.
  // are stored on the datablock, not the instance (see forceFieldBare.cc)
  const datablock = useDatablock(getProperty(object, "dataBlock"));

  // All rendering properties come from the datablock
  const colorStr = getProperty(datablock, "color");
  const color = useMemo(
    () =>
      colorStr ? parseColor(colorStr) : ([1, 1, 1] as [number, number, number]),
    [colorStr],
  );

  const baseTranslucency =
    parseFloat(getProperty(datablock, "baseTranslucency")) || 1;
  const numFrames = parseInt(getProperty(datablock, "numFrames"), 10) || 1;
  const framesPerSec = parseFloat(getProperty(datablock, "framesPerSec")) || 1;
  const scrollSpeed = parseFloat(getProperty(datablock, "scrollSpeed")) || 0;
  const umapping = parseFloat(getProperty(datablock, "umapping")) || 1;
  const vmapping = parseFloat(getProperty(datablock, "vmapping")) || 1;

  const textureUrls = useMemo(
    () => getTextureUrls(datablock, numFrames),
    [datablock, numFrames],
  );

  // Render fallback mesh when textures are missing instead of disappearing.
  if (textureUrls.length === 0) {
    return (
      <group position={position} quaternion={quaternion}>
        <ForceFieldFallback
          scale={scale}
          color={color}
          baseTranslucency={baseTranslucency}
        />
      </group>
    );
  }

  return (
    <group position={position} quaternion={quaternion}>
      <Suspense
        fallback={
          <ForceFieldFallback
            scale={scale}
            color={color}
            baseTranslucency={baseTranslucency}
          />
        }
      >
        <ForceFieldMesh
          scale={scale}
          color={color}
          baseTranslucency={baseTranslucency}
          textureUrls={textureUrls}
          numFrames={numFrames}
          framesPerSec={framesPerSec}
          scrollSpeed={scrollSpeed}
          umapping={umapping}
          vmapping={vmapping}
        />
      </Suspense>
    </group>
  );
});
