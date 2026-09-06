import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  ShaderMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  NoColorSpace,
} from "three";
import type { Group, Mesh } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  disposeClonedScene,
  processShapeScene,
  setupEffectTexture,
} from "../stream/playbackUtils";
import { textureToUrl } from "../loaders";
import { effectNow, engineStore } from "../state/engineStore";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { additiveSpriteBeforeCompile } from "../shapeMaterial";
import type { FlareEntity } from "../state/gameEntityTypes";
import type { FlareVisual } from "../stream/types";
import { FlareSpikes, VERTS_PER_SPIKE } from "../particles/flareSpikes";
import { useStaticShape } from "./GenericShape";
import {
  collectIflMeshes,
  iflSequenceTime,
  loadIflMaterialInstance,
  showIflFrame,
} from "./iflAtlas";
import type { IflMaterialInstance } from "./iflAtlas";
import { useAnisotropy } from "./useAnisotropy";

// ── LinearFlareProjectile (plasma bolt) ──
//
// Binary-verified render (LinearFlareProjectile::renderObject
// FUN_0063e2e0): the projectile's DTS, then `numFlares` spikes drawn
// additively in the object's frame with flareModTexture (a streak, bright
// at its base); a bolt without a DTS gets two additive flareBaseTexture
// (the soft ball) billboards instead. Colours go through untouched: the
// engine multiplies sRGB vertex colours by sRGB texels and adds them to
// the framebuffer, so the spike shader skips three.js colour management
// the way the particle shaders do.

// The fog includes are the anchors injectCustomFog rewrites; the engine
// scales spike brightness by 1 - haze (FUN_0063e2e0), which is the chunk's
// additive mode.
const spikeVertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 spikeColor;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = spikeColor;
    vec3 transformed = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const spikeFragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(map, vUv);
    // GL_MODULATE with glBlendFunc(GL_ONE, GL_ONE): alpha plays no part.
    gl_FragColor = vec4(vColor * t.rgb, 1.0);
    #include <fog_fragment>
  }
`;

const spikeBeforeCompile = (shader: {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}) => injectCustomFog(shader, globalFogUniforms, { additive: true });

/** Playback-scaled frame time in seconds; 0 while paused. */
function effectDeltaSec(delta: number): number {
  const playback = engineStore.getState().playback;
  return playback.status === "playing" ? delta * playback.rate : 0;
}

function FlareSpikeMesh({ visual }: { visual: FlareVisual }) {
  const texture = useTexture(textureToUrl(visual.modTexture), (tex) => {
    setupEffectTexture(Array.isArray(tex) ? tex[0] : tex, NoColorSpace);
  });
  const map = Array.isArray(texture) ? texture[0] : texture;
  const meshRef = useRef<Mesh>(null);

  const { spikes, geometry, material, color } = useMemo(() => {
    // Directions are isotropic, so the spikes are simulated straight in
    // three.js space — no Torque swizzle needed.
    const spikes = new FlareSpikes(visual.numFlares, visual.sizes);
    const n = visual.numFlares * VERTS_PER_SPIKE;
    const geometry = new BufferGeometry();
    for (const [name, size] of [
      ["position", 3],
      ["uv", 2],
      ["spikeColor", 3],
    ] as const) {
      const attr = new BufferAttribute(new Float32Array(n * size), size);
      attr.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attr);
    }
    const material = new ShaderMaterial({
      vertexShader: spikeVertexShader,
      fragmentShader: spikeFragmentShader,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        { map: { value: null } },
      ]),
      fog: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    material.uniforms.map.value = map;
    material.onBeforeCompile = spikeBeforeCompile;
    const color: [number, number, number] = [
      visual.color.r,
      visual.color.g,
      visual.color.b,
    ];
    return { spikes, geometry, material, color };
  }, [visual, map]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    spikes.advance(effectDeltaSec(delta));
    const pos = geometry.getAttribute("position") as BufferAttribute;
    const uv = geometry.getAttribute("uv") as BufferAttribute;
    const col = geometry.getAttribute("spikeColor") as BufferAttribute;
    const count = spikes.writeGeometry(
      pos.array as Float32Array,
      uv.array as Float32Array,
      col.array as Float32Array,
      color,
    );
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    col.needsUpdate = true;
    geometry.setDrawRange(0, count);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
    />
  );
}

/**
 * The bolt's DTS at the datablock scale, billboarded when faceViewer. The
 * plasma bolt's material is an IFL (plasma01–10 over its 0.7 s Ambient
 * cycle), loaded as an atlas and stepped on the playback clock like
 * ExplosionShape does.
 */
function FlareBoltShape({
  shapeName,
  scale,
  faceViewer,
}: {
  shapeName: string;
  scale: [number, number, number];
  faceViewer: boolean;
}) {
  const gltf = useStaticShape(shapeName);
  const anisotropy = useAnisotropy();
  const groupRef = useRef<Group>(null);
  const startTimeRef = useRef(effectNow());
  const atlasesRef = useRef<IflMaterialInstance[]>([]);

  const { scene, iflInfos } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as Group;
    // Collect IFL info BEFORE processShapeScene replaces the materials.
    const iflInfos = collectIflMeshes(scene);
    processShapeScene(scene, shapeName, { anisotropy });
    for (const info of iflInfos) info.mesh.visible = true;
    scene.traverse((child) => {
      child.frustumCulled = false;
    });
    return { scene, iflInfos };
  }, [gltf, shapeName, anisotropy]);

  useEffect(() => () => disposeClonedScene(scene), [scene]);

  useEffect(() => {
    atlasesRef.current = [];
    for (const info of iflInfos) {
      loadIflMaterialInstance(info)
        .then((inst) => {
          if (inst) atlasesRef.current.push(inst);
        })
        .catch(() => {});
    }
  }, [iflInfos]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;
    if (faceViewer) group.lookAt(camera.position);
    const elapsedSec = (effectNow() - startTimeRef.current) / 1000;
    for (const inst of atlasesRef.current) {
      showIflFrame(inst, iflSequenceTime(inst.info, inst.atlas, elapsedSec));
    }
  });

  return (
    <group ref={groupRef} scale={[scale[1], scale[2], scale[0]]}>
      {/* Flip so the face (GLB +Z) points at the camera after lookAt aims −Z. */}
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

/** A shapeless bolt: two additive flareBaseTexture billboards, the larger at
 *  √flareColor and the smaller white (renderObject's fallback quads). */
function FlareBillboards({ visual }: { visual: FlareVisual }) {
  const texture = useTexture(textureToUrl(visual.baseTexture), (tex) => {
    setupEffectTexture(Array.isArray(tex) ? tex[0] : tex);
  });
  const map = Array.isArray(texture) ? texture[0] : texture;
  const outerColor = useMemo(
    () =>
      new Color().setRGB(
        Math.sqrt(visual.color.r),
        Math.sqrt(visual.color.g),
        Math.sqrt(visual.color.b),
        SRGBColorSpace,
      ),
    [visual.color.r, visual.color.g, visual.color.b],
  );
  const half = visual.shapeScale[0];
  return (
    <>
      {[
        [1.2 * half, outerColor],
        [0.6 * half, undefined],
      ].map(([size, color], i) => (
        <sprite key={i} scale={[size as number, size as number, 1]}>
          <spriteMaterial
            map={map}
            color={color as Color | undefined}
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            onBeforeCompile={additiveSpriteBeforeCompile}
          />
        </sprite>
      ))}
    </>
  );
}

export function FlareProjectile({ entity }: { entity: FlareEntity }) {
  const { visual } = entity;
  return (
    <>
      {visual.shapeName ? (
        <FlareBoltShape
          shapeName={visual.shapeName}
          scale={visual.shapeScale}
          faceViewer={visual.faceViewer}
        />
      ) : visual.modTexture ? (
        <FlareBillboards visual={visual} />
      ) : null}
      {visual.baseTexture && visual.numFlares > 0 ? (
        <FlareSpikeMesh visual={visual} />
      ) : null}
    </>
  );
}
