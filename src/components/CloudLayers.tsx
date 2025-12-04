import { Suspense, useRef, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Vector2,
  DoubleSide,
  Texture,
  RepeatWrapping,
  LinearFilter,
  SRGBColorSpace,
  Group,
} from "three";
import { loadDetailMapList, textureToUrl } from "../loaders";
import type { TorqueObject } from "../torqueScript";
import { getFloat, getProperty } from "../mission";
import { useDebug, useSettings } from "./SettingsProvider";

const GRID_SIZE = 5;
const VERTEX_COUNT = GRID_SIZE * GRID_SIZE;

/**
 * Cloud edge height as percentage of radius.
 * From Tribes 2 sky.cc line 160: setHeights(cloudHeightPer[i], cloudHeightPer[i]-0.05f, 0.05f)
 * Edge height is always 0.05, while center/inner heights vary per layer.
 */
const EDGE_HEIGHT = 0.05;

/**
 * Height values for each vertex in the 5x5 grid.
 * Matches the zValue array from Tribes 2 Cloud::setPoints()
 */
function getHeightValues(
  centerHeight: number,
  innerHeight: number,
  edgeHeight: number,
): number[] {
  const c = centerHeight;
  const i = innerHeight;
  const e = edgeHeight;

  // prettier-ignore
  return [
    e, e, e, e, e,  // Row 0 (top edge)
    e, i, i, i, e,  // Row 1
    e, i, c, i, e,  // Row 2 (center)
    e, i, i, i, e,  // Row 3
    e, e, e, e, e,  // Row 4 (bottom edge)
  ];
}

/**
 * Calculate per-vertex alpha values.
 * From Tribes 2 Cloud::calcAlpha() - fades based on distance from center.
 * Uses the exact algorithm from TorqueSDK-1.2/engine/terrain/sky.cc
 */
function calculateAlphaValues(
  positions: Float32Array,
  radius: number,
): Float32Array {
  const alphas = new Float32Array(VERTEX_COUNT);

  for (let i = 0; i < VERTEX_COUNT; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    // Distance from vertical axis (X/Z plane in Three.js, ignoring Y height)
    // Matches: (mPoints[i] - Point3F(0, 0, mPoints[i].z)).len()
    const dist = Math.sqrt(x * x + z * z);

    // From Tribes 2: alpha = 1.3 - dist/radius
    let alpha = 1.3 - dist / radius;

    // Clamp and threshold (exact values from Tribes 2)
    if (alpha < 0.4) {
      alpha = 0.0;
    } else if (alpha > 0.8) {
      alpha = 1.0;
    }

    alphas[i] = alpha;
  }

  return alphas;
}

/**
 * Create the cloud dome geometry as a 5x5 grid of vertices.
 * Matches Tribes 2 Cloud::setPoints()
 */
function createCloudGeometry(
  radius: number,
  centerHeight: number,
  innerHeight: number,
  edgeHeight: number,
): BufferGeometry {
  const geometry = new BufferGeometry();

  const positions = new Float32Array(VERTEX_COUNT * 3);
  const uvs = new Float32Array(VERTEX_COUNT * 2);
  const heightValues = getHeightValues(centerHeight, innerHeight, edgeHeight);

  // Grid spacing
  const step = (radius * 2) / (GRID_SIZE - 1);

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const idx = row * GRID_SIZE + col;

      // Position: from -radius to +radius in X/Z plane (Three.js Y-up)
      const x = -radius + col * step;
      const z = radius - row * step; // Z goes from +radius to -radius
      const y = radius * heightValues[idx]; // Y is up in Three.js

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      // UV coordinates for texture (will be offset for scrolling)
      uvs[idx * 2] = col / (GRID_SIZE - 1);
      uvs[idx * 2 + 1] = row / (GRID_SIZE - 1);
    }
  }

  // Adjust corner vertices to smooth the dome (from Tribes 2 Cloud::setPoints)
  // This makes the corners lie on a plane with their neighbors
  adjustCorners(positions);

  // Calculate alpha values based on distance from center
  const alphas = calculateAlphaValues(positions, radius);

  // Create indices for the 4x4 grid of quads (each as 2 triangles)
  const indices: number[] = [];
  for (let row = 0; row < GRID_SIZE - 1; row++) {
    for (let col = 0; col < GRID_SIZE - 1; col++) {
      const topLeft = row * GRID_SIZE + col;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + GRID_SIZE;
      const bottomRight = bottomLeft + 1;

      // Two triangles per quad
      indices.push(topLeft, bottomLeft, bottomRight);
      indices.push(topLeft, bottomRight, topRight);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("alpha", new Float32BufferAttribute(alphas, 1));

  // Compute bounding sphere for proper frustum culling
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Adjust corner vertices to create a smoother dome.
 * From Tribes 2 Cloud::setPoints() corner adjustment logic.
 * Note: In Three.js, Y is up, so we use x/z for horizontal and y for height.
 */
function adjustCorners(positions: Float32Array): void {
  // Helper to get/set position (x, y, z where y is up in Three.js)
  const getPos = (idx: number) => ({
    x: positions[idx * 3],
    y: positions[idx * 3 + 1], // height (up)
    z: positions[idx * 3 + 2],
  });
  const setPos = (idx: number, x: number, y: number, z: number) => {
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
  };

  // Corner indices
  const TL = 0;
  const TR = 4;
  const BL = 20;
  const BR = 24;
  // Adjacent indices for corner adjustment
  const p1 = getPos(1);
  const p3 = getPos(3);
  const p5 = getPos(5);
  const p6 = getPos(6);
  const p8 = getPos(8);
  const p9 = getPos(9);
  const p15 = getPos(15);
  const p16 = getPos(16);
  const p18 = getPos(18);
  const p19 = getPos(19);
  const p21 = getPos(21);
  const p23 = getPos(23);

  // Top-left corner (index 0)
  // vec = (p5 + (p1 - p5) * 0.5) - p6; p0 = p6 + vec * 2
  let midX = p5.x + (p1.x - p5.x) * 0.5;
  let midY = p5.y + (p1.y - p5.y) * 0.5;
  let midZ = p5.z + (p1.z - p5.z) * 0.5;
  setPos(
    TL,
    p6.x + (midX - p6.x) * 2,
    p6.y + (midY - p6.y) * 2,
    p6.z + (midZ - p6.z) * 2,
  );

  // Top-right corner (index 4)
  // vec = (p9 + (p3 - p9) * 0.5) - p8; p4 = p8 + vec * 2
  midX = p9.x + (p3.x - p9.x) * 0.5;
  midY = p9.y + (p3.y - p9.y) * 0.5;
  midZ = p9.z + (p3.z - p9.z) * 0.5;
  setPos(
    TR,
    p8.x + (midX - p8.x) * 2,
    p8.y + (midY - p8.y) * 2,
    p8.z + (midZ - p8.z) * 2,
  );

  // Bottom-left corner (index 20)
  // vec = (p21 + (p15 - p21) * 0.5) - p16; p20 = p16 + vec * 2
  midX = p21.x + (p15.x - p21.x) * 0.5;
  midY = p21.y + (p15.y - p21.y) * 0.5;
  midZ = p21.z + (p15.z - p21.z) * 0.5;
  setPos(
    BL,
    p16.x + (midX - p16.x) * 2,
    p16.y + (midY - p16.y) * 2,
    p16.z + (midZ - p16.z) * 2,
  );

  // Bottom-right corner (index 24)
  // vec = (p23 + (p19 - p23) * 0.5) - p18; p24 = p18 + vec * 2
  midX = p23.x + (p19.x - p23.x) * 0.5;
  midY = p23.y + (p19.y - p23.y) * 0.5;
  midZ = p23.z + (p19.z - p23.z) * 0.5;
  setPos(
    BR,
    p18.x + (midX - p18.x) * 2,
    p18.y + (midY - p18.y) * 2,
    p18.z + (midZ - p18.z) * 2,
  );
}

/**
 * Setup cloud texture with proper wrapping and filtering.
 */
function setupCloudTexture(texture: Texture): Texture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Vertex shader for cloud layer.
 * Passes through position, UV (with offset for scrolling), and alpha.
 * Uses xyww trick to render at far plane like skybox.
 */
const cloudVertexShader = `
  attribute float alpha;

  uniform vec2 uvOffset;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    // Apply UV offset for scrolling
    vUv = uv + uvOffset;
    vAlpha = alpha;

    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Set depth to far plane so clouds are always visible and behind other geometry
    gl_Position = pos.xyww;
  }
`;

/**
 * Fragment shader for cloud layer.
 * Samples texture and applies per-vertex alpha for edge fading.
 * Cloud textures in Tribes 2 use the texture's brightness for transparency.
 */
const cloudFragmentShader = `
  uniform sampler2D cloudTexture;
  uniform float debugMode;
  uniform int layerIndex;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    vec4 texColor = texture2D(cloudTexture, vUv);

    // Debug mode: show layer-colored clouds (red, green, blue for layers 0, 1, 2)
    if (debugMode > 0.5) {
      vec3 debugColor;
      if (layerIndex == 0) {
        debugColor = vec3(1.0, 0.3, 0.3); // Red
      } else if (layerIndex == 1) {
        debugColor = vec3(0.3, 1.0, 0.3); // Green
      } else {
        debugColor = vec3(0.3, 0.3, 1.0); // Blue
      }
      // Use same alpha calculation as normal mode
      gl_FragColor = vec4(debugColor, texColor.a * vAlpha);
      return;
    }

    // Tribes 2 uses GL_MODULATE: final = texture × vertex color
    // Vertex color is white with varying alpha, so:
    // Final RGB = Texture RGB × 1.0 = Texture RGB
    // Final Alpha = Texture Alpha × Vertex Alpha
    float finalAlpha = texColor.a * vAlpha;

    // Output clouds with texture color and combined alpha
    gl_FragColor = vec4(texColor.rgb, finalAlpha);
  }
`;

interface CloudLayerProps {
  textureUrl: string;
  radius: number;
  heightPercent: number;
  speed: number;
  windDirection: Vector2;
  layerIndex: number;
  debugMode: boolean;
  animationEnabled: boolean;
}

/**
 * Single cloud layer component.
 */
function CloudLayer({
  textureUrl,
  radius,
  heightPercent,
  speed,
  windDirection,
  layerIndex,
  debugMode,
  animationEnabled,
}: CloudLayerProps) {
  const materialRef = useRef<ShaderMaterial>(null!);
  const offsetRef = useRef(new Vector2(0, 0));

  // Load cloud texture
  const texture = useTexture(textureUrl, setupCloudTexture);

  // Create geometry with height based on layer
  // From Tribes 2 sky.cc line 160: setHeights(cloudHeightPer[i], cloudHeightPer[i]-0.05f, 0.05f)
  const geometry = useMemo(() => {
    const centerHeight = heightPercent;
    const innerHeight = heightPercent - 0.05;
    const edgeHeight = EDGE_HEIGHT;
    return createCloudGeometry(radius, centerHeight, innerHeight, edgeHeight);
  }, [radius, heightPercent]);

  // Create shader material
  const material = useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        cloudTexture: { value: texture },
        uvOffset: { value: new Vector2(0, 0) },
        debugMode: { value: debugMode ? 1 : 0 },
        layerIndex: { value: layerIndex },
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
  }, [texture, debugMode, layerIndex]);

  // Animate UV offset for cloud scrolling
  // From Tribes 2: mOffset = (currentTime - mLastTime) / 32.0 (time in ms)
  // delta is in seconds, so: delta * 1000 / 32 = delta * 31.25
  useFrame((_, delta) => {
    if (!materialRef.current || !animationEnabled) return;

    // Match Tribes 2 timing: deltaTime(ms) / 32
    const mOffset = (delta * 1000) / 32;

    offsetRef.current.x += windDirection.x * speed * mOffset;
    offsetRef.current.y += windDirection.y * speed * mOffset;

    // Wrap to [0,1] range
    offsetRef.current.x = offsetRef.current.x - Math.floor(offsetRef.current.x);
    offsetRef.current.y = offsetRef.current.y - Math.floor(offsetRef.current.y);

    materialRef.current.uniforms.uvOffset.value.copy(offsetRef.current);
  });

  // Cleanup
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={10}>
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}

export interface CloudLayerConfig {
  texture: string;
  height: number;
  speed: number;
}

/**
 * DML file indices:
 * 0-5: Skybox faces
 * 6: Environment map
 * 7+: Cloud layer textures
 */
const CLOUD_TEXTURE_OFFSET = 7;

/**
 * Hook to load a DML file.
 */
function useDetailMapList(name: string | undefined) {
  return useQuery({
    queryKey: ["detailMapList", name],
    queryFn: () => loadDetailMapList(name!),
    enabled: !!name,
  });
}

export interface CloudLayersProps {
  object: TorqueObject;
}

/**
 * CloudLayers component renders multiple cloud layers as domed meshes.
 * Matches the Tribes 2 cloud rendering system.
 *
 * Reads from TorqueObject:
 * - materialList: DML file containing cloud textures at indices 7+
 * - cloudSpeed1/2/3: Speed for each cloud layer
 * - cloudHeightPer0/1/2: Height percentage for each layer
 * - windVelocity: Wind direction for cloud movement
 */
export function CloudLayers({ object }: CloudLayersProps) {
  const { debugMode } = useDebug();
  const { animationEnabled } = useSettings();
  const materialList = getProperty(object, "materialList");
  const { data: detailMapList } = useDetailMapList(materialList);

  // From Tribes 2 sky.cc line 1170: mRadius = visibleDistance * 0.95
  const visibleDistance = getFloat(object, "visibleDistance") ?? 500;
  const radius = visibleDistance * 0.95;

  // Extract cloud speeds from object (cloudSpeed1/2/3 are scalar values)
  const cloudSpeeds = useMemo(
    () => [
      getFloat(object, "cloudSpeed1") ?? 0.0001,
      getFloat(object, "cloudSpeed2") ?? 0.0002,
      getFloat(object, "cloudSpeed3") ?? 0.0003,
    ],
    [object],
  );

  // Extract cloud heights from object
  // Default heights match typical Tribes 2 values (e.g., 0.35, 0.25, 0.2)
  const cloudHeights = useMemo(() => {
    const defaults = [0.35, 0.25, 0.2];
    const heights: number[] = [];
    for (let i = 0; i < 3; i++) {
      const height = getFloat(object, `cloudHeightPer${i}`) ?? defaults[i];
      heights.push(height);
    }
    return heights;
  }, [object]);

  // Wind direction from windVelocity
  const windDirection = useMemo(() => {
    const windVelocity = getProperty(object, "windVelocity");
    if (windVelocity) {
      const [x, y] = windVelocity.split(" ").map((s: string) => parseFloat(s));
      if (x !== 0 || y !== 0) {
        return new Vector2(x, y).normalize();
      }
    }
    return new Vector2(1, 0);
  }, [object]);

  // Extract cloud layer configurations from DML (indices 7+)
  const layers = useMemo<CloudLayerConfig[]>(() => {
    if (!detailMapList) return [];

    const result: CloudLayerConfig[] = [];
    for (let i = CLOUD_TEXTURE_OFFSET; i < detailMapList.length; i++) {
      const texture = detailMapList[i];
      if (texture) {
        const layerIndex = i - CLOUD_TEXTURE_OFFSET;
        result.push({
          texture,
          height: cloudHeights[layerIndex] ?? 0,
          speed: cloudSpeeds[layerIndex] ?? 0.0001 * (layerIndex + 1),
        });
      }
    }
    return result;
  }, [detailMapList, cloudSpeeds, cloudHeights]);

  // Reference for the group to follow camera
  const groupRef = useRef<Group>(null!);

  // Make clouds follow camera position (they should appear infinitely far away)
  // From Tribes 2 sky.cc line 633-634: glTranslatef(camPos.x, camPos.y, camPos.z)
  // Clouds are translated to camera position in all 3 dimensions
  useFrame(({ camera }) => {
    if (groupRef.current) {
      groupRef.current.position.copy(camera.position);
    }
  });

  if (!layers || layers.length === 0) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {layers.map((layer, i) => {
        const url = textureToUrl(layer.texture);
        return (
          <Suspense key={i} fallback={null}>
            <CloudLayer
              textureUrl={url}
              radius={radius}
              heightPercent={layer.height}
              speed={layer.speed}
              windDirection={windDirection}
              layerIndex={i}
              debugMode={debugMode}
              animationEnabled={animationEnabled}
            />
          </Suspense>
        );
      })}
    </group>
  );
}
