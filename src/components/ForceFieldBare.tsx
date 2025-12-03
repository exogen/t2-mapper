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
  ShaderMaterial,
  Texture,
  Vector2,
} from "three";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { textureToUrl } from "../loaders";
import { useSettings } from "./SettingsProvider";
import { useDatablock } from "./useDatablock";

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

// Vertex shader
const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment shader - handles frame animation, UV scrolling, and color tinting
// NOTE: Shader supports up to 5 texture frames (hardcoded samplers)
const fragmentShader = `
uniform sampler2D frame0;
uniform sampler2D frame1;
uniform sampler2D frame2;
uniform sampler2D frame3;
uniform sampler2D frame4;
uniform int currentFrame;
uniform float vScroll;
uniform vec2 uvScale;
uniform vec3 tintColor;
uniform float opacity;

varying vec2 vUv;

// FIXME: This gamma correction may not be accurate. Tribes 2 had no gamma correction;
// Three.js applies gamma on output, so we pre-darken to compensate. The result is
// close but not quite right - the force field is still slightly more opaque than in T2.
vec3 srgbToLinear(vec3 srgb) {
  return pow(srgb, vec3(2.2));
}

void main() {
  // Scale and scroll UVs
  vec2 scrolledUv = vec2(vUv.x * uvScale.x, vUv.y * uvScale.y + vScroll);

  // Sample the current frame
  vec4 texColor;
  if (currentFrame == 0) {
    texColor = texture2D(frame0, scrolledUv);
  } else if (currentFrame == 1) {
    texColor = texture2D(frame1, scrolledUv);
  } else if (currentFrame == 2) {
    texColor = texture2D(frame2, scrolledUv);
  } else if (currentFrame == 3) {
    texColor = texture2D(frame3, scrolledUv);
  } else {
    texColor = texture2D(frame4, scrolledUv);
  }

  // Apply color tint with constant opacity (like Tribes 2's GL_MODULATE)
  vec3 finalColor = texColor.rgb * tintColor;

  // Pre-darken to counteract renderer's sRGB gamma encoding
  // This makes additive blending behave like Tribes 2's non-gamma-corrected output
  finalColor = srgbToLinear(finalColor);

  // FIXME: Halving opacity is a rough approximation to compensate for front+back faces
  // both contributing (BoxGeometry with DoubleSide causes additive stacking that Tribes 2's
  // thin quads didn't have). This doesn't account for viewing angles where more faces are visible.
  gl_FragColor = vec4(finalColor, opacity * 0.5);
}
`;

function setupForceFieldTexture(texture: Texture) {
  texture.wrapS = texture.wrapT = RepeatWrapping;
  // FIXME: Using NoColorSpace to treat textures as raw linear values like Tribes 2 did,
  // but the interaction with the renderer's sRGB output and shader gamma correction
  // may not be fully correct. The force field appears close but not identical to T2.
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
    // UV scale based on the two largest dimensions (force fields are thin planes)
    const dims = [...scale].sort((a, b) => b - a);
    const uvScale = new Vector2(dims[0] * umapping, dims[1] * vmapping);

    // Use first texture as fallback for unused slots
    const fallbackTex = textures[0];
    return new ShaderMaterial({
      uniforms: {
        frame0: { value: textures[0] ?? fallbackTex },
        frame1: { value: textures[1] ?? fallbackTex },
        frame2: { value: textures[2] ?? fallbackTex },
        frame3: { value: textures[3] ?? fallbackTex },
        frame4: { value: textures[4] ?? fallbackTex },
        currentFrame: { value: 0 },
        vScroll: { value: 0 },
        uvScale: { value: uvScale },
        tintColor: { value: new Color(...color) },
        opacity: { value: baseTranslucency },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
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

  return <mesh geometry={geometry} material={material} />;
}

function ForceFieldFallback({
  scale,
  color,
  baseTranslucency,
}: ForceFieldGeometryProps) {
  const geometry = useCornerBoxGeometry(scale);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={new Color(...color)}
        transparent
        opacity={baseTranslucency * 0.5}
        blending={AdditiveBlending}
        side={DoubleSide}
        depthWrite={false}
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

  // Don't render if we have no textures
  if (textureUrls.length === 0) {
    return null;
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
