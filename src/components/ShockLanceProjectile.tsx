/**
 * The shocklance bolt, binary-verified against Tribes2.exe
 * ShockLanceProjectile (vtable 0x7b23b8: onAdd FUN_0064ec20, advanceTime
 * FUN_0064f840, renderObject FUN_0064fd60) and its client-side zap
 * object (vtable 0x7b22dc, FUN_006518a0).
 *
 * A pinned bolt (hitObject) keeps the ghost's fixed start/end and draws,
 * all additive (glBlendFunc SRC_ALPHA, ONE — the textures have no alpha,
 * so their black backgrounds add nothing), no depth write and no fog:
 *   - two camera-facing ELFBeam strips muzzle -> hit point whose width
 *     grows startWidth[i] -> endWidth[i] over zapDuration, alpha 0 at
 *     the muzzle and 1 - age/zapDuration at the target, U scrolling by
 *     boltSpeed[i] x age with texWrap[i] repeats along the bolt;
 *   - two lightning ribbons (lightningWidth, alpha 1 - age/zapDuration)
 *     of round(lightningDensity x length) points jittered lightningAmp,
 *     regenerated every 1/lightningFreq seconds;
 *   - the zap: the target's own shape redrawn 5% larger with the
 *     shockLightning textures cycling ten times a second, projected
 *     object-linear at 0.25 repeats/m and scrolling (2 x age, age), also
 *     fading with 1 - age/zapDuration.
 * A missed bolt only sparks: 0.2 m from the live muzzle along the aim,
 * 20 points/m at 0.1 m amplitude, no strips and no zap. The hit
 * shockwave and particle burst live in ParticleEffects.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  Box3,
  DetachedBindMode,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SkinnedMesh,
  Vector2,
  Vector3,
} from "three";
import type {
  BufferAttribute,
  BufferGeometry,
  Group,
  Material,
  Object3D,
  Texture,
} from "three";
import { setupEffectTexture, torqueVecToThree } from "../stream/playbackUtils";
import { textureToUrl } from "../loaders";
import { isVisibleInHierarchy } from "../objectUtils";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { orientationAlongDirection } from "../stream/streamHelpers";
import type { ShockLanceEntity } from "../state/gameEntityTypes";
import { ribbonIndices } from "./projectileGeometry";
import {
  LINK_MUZZLE_LIFT,
  muzzleWorldPosition,
  sourceAimDirection,
} from "./linkBeamSource";
import {
  SHOCK_LANCE_MAX_POINTS,
  SHOCK_LANCE_MISS_AMP,
  SHOCK_LANCE_MISS_DENSITY,
  SHOCK_LANCE_MISS_LENGTH,
  SHOCK_LANCE_ZAP_SCALE,
  ZAP_SCROLL_S,
  ZAP_TEXGEN_SCALE,
  generateLightningPoints,
  writeLightningRibbon,
  writeShockStrip,
  zapFrameIndex,
  zapProjectionAxis,
} from "./shockLanceGeometry";

/** How often the target's subtree is re-walked for meshes to overlay
 *  (its model may mount after the bolt, or swap detail). */
const ZAP_RESCAN_SEC = 0.25;

const _origin = new Vector3();
const _start = new Vector3();
const _end = new Vector3();
const _dir = new Vector3();
const _aim = new Vector3();
const _fromCam = new Vector3();
const _right = new Vector3();
const _scaledRight = new Vector3();
const _localStart = new Vector3();
const _localEnd = new Vector3();
const _box = new Box3();
const _size = new Vector3();
const _targetInverse = new Matrix4();
const _zapScaleLocal = new Matrix4().makeScale(
  SHOCK_LANCE_ZAP_SCALE,
  SHOCK_LANCE_ZAP_SCALE,
  SHOCK_LANCE_ZAP_SCALE,
);

interface ZapUniforms {
  zapPlaneS: { value: Vector3 };
  zapPlaneT: { value: Vector3 };
  zapScroll: { value: Vector2 };
  zapScale: { value: Matrix4 };
}

interface ZapOverlay {
  source: Mesh;
  overlay: Mesh;
}

interface ZapState {
  target: Object3D | null;
  overlays: ZapOverlay[];
  scannedAt: number;
}

/**
 * The zap material: MeshBasicMaterial (so skinning and morph targets
 * come for free) with the engine's GL_OBJECT_LINEAR texgen — S and T
 * from the vertex's post-skinning object-space position — and its 5%
 * inflation about the target's origin applied after the model matrix.
 */
function createZapMaterial(uniforms: ZapUniforms): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform vec3 zapPlaneS;",
          "uniform vec3 zapPlaneT;",
          "uniform vec2 zapScroll;",
          "uniform mat4 zapScale;",
        ].join("\n"),
      )
      .replace(
        "#include <skinning_vertex>",
        [
          "#include <skinning_vertex>",
          "#ifdef USE_MAP",
          "vMapUv = vec2(dot(zapPlaneS, transformed), dot(zapPlaneT, transformed)) + zapScroll;",
          "#endif",
        ].join("\n"),
      )
      .replace(
        "#include <project_vertex>",
        [
          "vec4 mvPosition = viewMatrix * zapScale * modelMatrix * vec4(transformed, 1.0);",
          "gl_Position = projectionMatrix * mvPosition;",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => "shockLanceZap";
  return material;
}

/**
 * The target shape's own meshes: everything under the entity group
 * except mounted images (weapons, packs), which the engine's zap does
 * not redraw.
 */
function collectZapSources(node: Object3D, out: Mesh[]): void {
  if (node.userData.imageMount) return;
  if ((node as Mesh).isMesh) out.push(node as Mesh);
  for (const child of node.children) collectZapSources(child, out);
}

/**
 * An overlay drawing `source`'s geometry with the zap material. It
 * follows the source's world matrix (copied right before rendering, so
 * skinned bind matrices stay consistent) and shares its skeleton and
 * morph influences.
 */
function createZapOverlay(source: Mesh, material: Material): Mesh {
  let overlay: Mesh;
  const skinned = (source as SkinnedMesh).isSkinnedMesh
    ? (source as SkinnedMesh)
    : null;
  if (skinned) {
    const clone = new SkinnedMesh(skinned.geometry, material);
    clone.bind(skinned.skeleton, skinned.bindMatrix);
    clone.bindMode = DetachedBindMode;
    overlay = clone;
  } else {
    overlay = new Mesh(source.geometry, material);
  }
  overlay.morphTargetInfluences = source.morphTargetInfluences;
  overlay.morphTargetDictionary = source.morphTargetDictionary;
  overlay.frustumCulled = false;
  overlay.matrixAutoUpdate = false;
  overlay.matrixWorldAutoUpdate = false;
  overlay.onBeforeRender = () => {
    overlay.matrixWorld.copy(source.matrixWorld);
    if (skinned) {
      (overlay as SkinnedMesh).bindMatrixInverse.copy(
        skinned.bindMatrixInverse,
      );
    }
  };
  return overlay;
}

function sameSources(overlays: ZapOverlay[], sources: Mesh[]): boolean {
  if (overlays.length !== sources.length) return false;
  for (let i = 0; i < sources.length; i++) {
    if (overlays[i].source !== sources[i]) return false;
  }
  return true;
}

function clearZapOverlays(state: ZapState, zapGroup: Group | null): void {
  for (const { overlay } of state.overlays) zapGroup?.remove(overlay);
  state.overlays = [];
  state.target = null;
  state.scannedAt = -Infinity;
}

/**
 * Point the texgen planes along the target's longest axis. Extents come
 * from the meshes' bind-pose bounds in GLB space, whose axes map to
 * Torque as (x, y, z) = (-gx, gz, gy).
 */
function setZapPlanes(sources: Mesh[], uniforms: ZapUniforms): void {
  _box.makeEmpty();
  for (const mesh of sources) {
    const geometry = mesh.geometry as BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) _box.union(geometry.boundingBox);
  }
  _box.getSize(_size);
  const axis = zapProjectionAxis({ x: _size.x, y: _size.z, z: _size.y });
  if (axis === "y") {
    uniforms.zapPlaneS.value.set(0, 0, ZAP_TEXGEN_SCALE);
  } else {
    uniforms.zapPlaneS.value.set(-ZAP_TEXGEN_SCALE, 0, 0);
  }
  uniforms.zapPlaneT.value.set(0, ZAP_TEXGEN_SCALE, 0);
}

export function ShockLanceProjectile({ entity }: { entity: ShockLanceEntity }) {
  const { visual } = entity;
  const groupRef = useRef<Group>(null);
  const boltGroupRef = useRef<Group>(null);
  const zapGroupRef = useRef<Group>(null);
  const stripPos0 = useRef<BufferAttribute>(null);
  const stripPos1 = useRef<BufferAttribute>(null);
  const stripUv0 = useRef<BufferAttribute>(null);
  const stripUv1 = useRef<BufferAttribute>(null);
  const stripColor0 = useRef<BufferAttribute>(null);
  const stripColor1 = useRef<BufferAttribute>(null);
  const boltGeo0 = useRef<BufferGeometry>(null);
  const boltGeo1 = useRef<BufferGeometry>(null);
  const boltPos0 = useRef<BufferAttribute>(null);
  const boltPos1 = useRef<BufferAttribute>(null);
  const boltUv0 = useRef<BufferAttribute>(null);
  const boltUv1 = useRef<BufferAttribute>(null);
  const stripPosRefs = [stripPos0, stripPos1];
  const stripUvRefs = [stripUv0, stripUv1];
  const stripColorRefs = [stripColor0, stripColor1];
  const boltGeoRefs = [boltGeo0, boltGeo1];
  const boltPosRefs = [boltPos0, boltPos1];
  const boltUvRefs = [boltUv0, boltUv1];
  const boltPoints = useRef([
    new Float32Array(SHOCK_LANCE_MAX_POINTS * 3),
    new Float32Array(SHOCK_LANCE_MAX_POINTS * 3),
  ]);
  const boltCounts = useRef([0, 0]);
  const regenTimerRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const zapRef = useRef<ZapState>({
    target: null,
    overlays: [],
    scannedAt: -Infinity,
  });

  const urls = useMemo(
    () => visual.textures.slice(0, 4).map((name) => textureToUrl(name)),
    [visual.textures],
  );
  const loaded = useTexture(urls, (tex) => {
    for (const t of Array.isArray(tex) ? tex : [tex]) {
      setupEffectTexture(t);
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
    }
  });
  const textures: Texture[] = Array.isArray(loaded) ? loaded : [loaded];
  // texture[3] (ELFBeam) is what the engine binds for the strips AND
  // the ribbons; texture[0..3] cycle on the zap.
  const beamTexture = textures[textures.length - 1];

  const zapUniforms = useMemo<ZapUniforms>(
    () => ({
      zapPlaneS: { value: new Vector3(-ZAP_TEXGEN_SCALE, 0, 0) },
      zapPlaneT: { value: new Vector3(0, ZAP_TEXGEN_SCALE, 0) },
      zapScroll: { value: new Vector2() },
      zapScale: { value: new Matrix4() },
    }),
    [],
  );
  const zapMaterial = useMemo(
    () => createZapMaterial(zapUniforms),
    [zapUniforms],
  );
  const boltMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => {
    const list = Array.isArray(loaded) ? loaded : [loaded];
    zapMaterial.map = list[0];
    zapMaterial.needsUpdate = true;
    boltMaterial.map = list[list.length - 1];
    boltMaterial.needsUpdate = true;
  }, [zapMaterial, boltMaterial, loaded]);
  // The overlays leave the scene with their group; only the materials
  // are ours to dispose.
  useEffect(
    () => () => {
      zapMaterial.dispose();
      boltMaterial.dispose();
    },
    [zapMaterial, boltMaterial],
  );

  const zapDuration = Math.max(1e-3, visual.zapDuration);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    const boltGroup = boltGroupRef.current;
    if (!group || !boltGroup) return;
    const now = streamClock.time;
    const age = now - (entity.spawnTime ?? 0);
    const zap = zapRef.current;
    if (age < 0 || age >= zapDuration) {
      group.visible = false;
      clearZapOverlays(zap, zapGroupRef.current);
      return;
    }
    group.visible = true;
    const fade = 1 - age / zapDuration;
    const root = streamPlaybackStore.getState().root;
    const source = entity.linkSourceId
      ? root?.children.find((c) => c.name === entity.linkSourceId)
      : undefined;
    const target =
      entity.beamHit && entity.linkTargetId
        ? root?.children.find((c) => c.name === entity.linkTargetId)
        : undefined;

    // Endpoints: a pinned bolt keeps the ghost's; a miss re-derives a
    // 0.2 m spark from the live muzzle each frame (FUN_0064f960), or
    // keeps the ghost's when the shooter isn't resolvable.
    torqueVecToThree(entity.beamStart, _start);
    torqueVecToThree(entity.beamEnd, _end);
    let density = visual.lightningDensity;
    let amp = visual.lightningAmp;
    if (!entity.beamHit) {
      density = SHOCK_LANCE_MISS_DENSITY;
      amp = SHOCK_LANCE_MISS_AMP;
      if (source) {
        if (!muzzleWorldPosition(source, now, _start)) {
          _start.copy(source.position);
          _start.y += LINK_MUZZLE_LIFT;
        }
        sourceAimDirection(entity.linkSourceId, source, _aim);
        _end.copy(_start).addScaledVector(_aim, SHOCK_LANCE_MISS_LENGTH);
      }
    }
    _dir.subVectors(_end, _start);
    const length = _dir.length();
    const orientation =
      length > 1e-4
        ? orientationAlongDirection([_dir.z, _dir.x, _dir.y])
        : null;
    if (!orientation) {
      group.visible = false;
      return;
    }
    _dir.normalize();
    group.getWorldPosition(_origin);
    _localStart.copy(_start).sub(_origin);
    _localEnd.copy(_end).sub(_origin);

    // Lightning regeneration at lightningFreq (advanceTime FUN_0064f840:
    // one regeneration per frame once the period has elapsed; the bolts
    // stay empty until the first period). The timer runs from the
    // ghost's creation, so a component that mounts late (textures still
    // loading) catches up on its first frame.
    const last = lastTimeRef.current;
    let dt = last == null ? age : now - last;
    if (dt < 0 || dt > 1) dt = 0;
    lastTimeRef.current = now;
    regenTimerRef.current += dt;
    const period = 1 / Math.max(visual.lightningFreq, 1e-3);
    if (regenTimerRef.current >= period) {
      regenTimerRef.current -= period;
      for (let b = 0; b < 2; b++) {
        boltCounts.current[b] = generateLightningPoints(
          length,
          density,
          amp,
          boltPoints.current[b],
        );
      }
    }

    // Ribbons live in the bolt frame (forward = +X) at the start point.
    boltGroup.position.copy(_localStart);
    boltGroup.quaternion.set(
      orientation[0],
      orientation[1],
      orientation[2],
      orientation[3],
    );
    boltMaterial.opacity = fade;
    for (let b = 0; b < 2; b++) {
      const geometry = boltGeoRefs[b].current;
      const pos = boltPosRefs[b].current;
      const uv = boltUvRefs[b].current;
      if (!geometry || !pos || !uv) continue;
      const count = boltCounts.current[b];
      if (count < 2) {
        geometry.setDrawRange(0, 0);
        continue;
      }
      writeLightningRibbon(
        pos,
        uv,
        boltPoints.current[b],
        count,
        visual.lightningWidth * 0.5,
        camera.position,
      );
      geometry.setDrawRange(0, (count - 1) * 6);
    }

    // Strips (pinned bolts only, FUN_00650150).
    if (entity.beamHit) {
      _fromCam.copy(_start).sub(camera.position);
      _right.crossVectors(_fromCam, _dir);
      if (_right.lengthSq() > 1e-8) _right.normalize();
      for (let i = 0; i < 2; i++) {
        const pos = stripPosRefs[i].current;
        const uv = stripUvRefs[i].current;
        const color = stripColorRefs[i].current;
        if (!pos || !uv || !color) continue;
        const widthRate =
          (visual.endWidth[i] - visual.startWidth[i]) / zapDuration;
        const halfWidth = (visual.startWidth[i] + widthRate * age) * 0.5;
        _scaledRight.copy(_right).multiplyScalar(halfWidth);
        const u0 = visual.boltSpeed[i] * age;
        writeShockStrip(
          pos,
          uv,
          color,
          _localStart,
          _localEnd,
          _scaledRight,
          u0,
          u0 - visual.texWrap[i],
          fade,
        );
      }
    }

    // The zap on the target.
    const zapGroup = zapGroupRef.current;
    if (!target || !zapGroup) {
      clearZapOverlays(zap, zapGroup);
      return;
    }
    if (
      zap.target !== target ||
      now - zap.scannedAt > ZAP_RESCAN_SEC ||
      now < zap.scannedAt
    ) {
      const sources: Mesh[] = [];
      collectZapSources(target, sources);
      if (zap.target !== target || !sameSources(zap.overlays, sources)) {
        clearZapOverlays(zap, zapGroup);
        zap.target = target;
        zap.overlays = sources.map((mesh) => {
          const overlay = createZapOverlay(mesh, zapMaterial);
          zapGroup.add(overlay);
          return { source: mesh, overlay };
        });
        setZapPlanes(sources, zapUniforms);
      }
      zap.scannedAt = now;
    }
    const frame = textures[Math.min(textures.length - 1, zapFrameIndex(age))];
    if (zapMaterial.map !== frame) zapMaterial.map = frame;
    zapMaterial.opacity = fade;
    zapUniforms.zapScroll.value.set(ZAP_SCROLL_S * age, age);
    _targetInverse.copy(target.matrixWorld).invert();
    zapUniforms.zapScale.value
      .copy(target.matrixWorld)
      .multiply(_zapScaleLocal)
      .multiply(_targetInverse);
    for (const { source: mesh, overlay } of zap.overlays) {
      overlay.visible = isVisibleInHierarchy(mesh);
    }
  });

  const quadIndex = useMemo(() => new Uint16Array([0, 1, 2, 0, 2, 3]), []);
  const boltIndex = useMemo(() => ribbonIndices(SHOCK_LANCE_MAX_POINTS), []);
  return (
    <group ref={groupRef}>
      {entity.beamHit &&
        [0, 1].map((i) => (
          <mesh key={i} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute
                ref={stripPosRefs[i]}
                attach="attributes-position"
                args={[new Float32Array(12), 3]}
              />
              <bufferAttribute
                ref={stripUvRefs[i]}
                attach="attributes-uv"
                args={[new Float32Array(8), 2]}
              />
              <bufferAttribute
                ref={stripColorRefs[i]}
                attach="attributes-color"
                args={[new Float32Array(16), 4]}
              />
              <bufferAttribute attach="index" args={[quadIndex, 1]} />
            </bufferGeometry>
            <meshBasicMaterial
              map={beamTexture}
              vertexColors
              transparent
              blending={AdditiveBlending}
              depthWrite={false}
              side={DoubleSide}
              toneMapped={false}
              fog={false}
            />
          </mesh>
        ))}
      <group ref={boltGroupRef}>
        {[0, 1].map((b) => (
          <mesh key={b} frustumCulled={false} material={boltMaterial}>
            <bufferGeometry ref={boltGeoRefs[b]}>
              <bufferAttribute
                ref={boltPosRefs[b]}
                attach="attributes-position"
                args={[new Float32Array(SHOCK_LANCE_MAX_POINTS * 6), 3]}
              />
              <bufferAttribute
                ref={boltUvRefs[b]}
                attach="attributes-uv"
                args={[new Float32Array(SHOCK_LANCE_MAX_POINTS * 4), 2]}
              />
              <bufferAttribute attach="index" args={[boltIndex, 1]} />
            </bufferGeometry>
          </mesh>
        ))}
      </group>
      <group ref={zapGroupRef} />
    </group>
  );
}
