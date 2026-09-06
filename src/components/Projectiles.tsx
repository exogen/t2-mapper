import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { BufferAttribute, Mesh } from "three";
import {
  setupEffectTexture,
  torqueVecToThree,
  setQuaternionFromDir,
} from "../stream/playbackUtils";
import { textureToUrl } from "../loaders";
import { streamClock } from "../state/streamPlaybackStore";
import { SpriteEntity, TracerEntity } from "../state/gameEntityTypes";
import { writeRibbonQuad } from "./projectileGeometry";

const _tracerDir = new Vector3();
const _tracerDirFromCam = new Vector3();
const _tracerCross = new Vector3();
const _tracerStart = new Vector3();
const _tracerEnd = new Vector3();
const _tracerWorldPos = new Vector3();
const _upY = new Vector3(0, 1, 0);
const _blurOrigin = new Vector3();
const _blurA = new Vector3();
const _blurB = new Vector3();
const _blurSeg = new Vector3();
const _blurToCam = new Vector3();
const _blurCross = new Vector3();

/** Ring-buffer capacity for the blur tail (0.2s at 60fps is ~12). */
const BLUR_MAX_POINTS = 32;

// Unfogged on purpose: the engine's projectile renderers apply neither
// haze nor GL fog — flare FUN_006875b0, tracer FUN_006405e0, blaster bolt
// FUN_00696dd0 (all binary-verified). Fogging an additive quad whose
// texture has no alpha channel paints its whole rectangle fog-coloured.
export function SpriteProjectile({ entity }: { entity: SpriteEntity }) {
  const { visual } = entity;
  const url = textureToUrl(visual.texture);
  const texture = useTexture(url, (tex) => {
    const t = Array.isArray(tex) ? tex[0] : tex;
    setupEffectTexture(t);
  });
  const map = Array.isArray(texture) ? texture[0] : texture;

  // Convert sRGB datablock color to linear for Three.js material.
  const color = useMemo(
    () =>
      new Color().setRGB(
        visual.color.r,
        visual.color.g,
        visual.color.b,
        SRGBColorSpace,
      ),
    [visual.color.r, visual.color.g, visual.color.b],
  );

  return (
    <sprite scale={[visual.size, visual.size, 1]}>
      <spriteMaterial
        map={map}
        color={color}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </sprite>
  );
}

/**
 * The blaster bolt's motion-blur tail: an untextured additive ribbon
 * along the bolt's recent path, blurColor-tinted, each segment's alpha
 * fading with its age over blurLifetime. Binary-verified in Tribes2.exe
 * (Blur segment render FUN_00698100): camera-perpendicular cross per
 * segment, half-width = blurWidth/2, per-vertex alpha, no texture.
 */
function useBlurTail(
  blur: NonNullable<TracerEntity["visual"]["blur"]> | undefined,
) {
  const meshRef = useRef<Mesh>(null);
  const posRef = useRef<BufferAttribute>(null);
  const alphaRef = useRef<BufferAttribute>(null);
  const pointsRef = useRef<{ x: number; y: number; z: number; t: number }[]>(
    [],
  );
  const material = useMemo(() => {
    if (!blur) return null;
    return new ShaderMaterial({
      uniforms: {
        uColor: {
          value: new Color().setRGB(
            blur.color.r,
            blur.color.g,
            blur.color.b,
            SRGBColorSpace,
          ),
        },
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
  }, [blur]);

  const update = (camera: { position: Vector3 }) => {
    const mesh = meshRef.current;
    const posAttr = posRef.current;
    const alphaAttr = alphaRef.current;
    if (!blur || !mesh || !posAttr || !alphaAttr) return;
    const now = streamClock.time;
    const points = pointsRef.current;
    // A rewind (seek) invalidates the recorded path.
    if (points.length > 0 && now < points[points.length - 1].t) {
      points.length = 0;
    }
    // Record the bolt's rendered position (the parent group is where
    // the wrapper actually placed it this frame).
    mesh.parent?.getWorldPosition(_blurOrigin);
    const last = points[points.length - 1];
    if (!last || last.t < now) {
      points.push({
        x: _blurOrigin.x,
        y: _blurOrigin.y,
        z: _blurOrigin.z,
        t: now,
      });
      if (points.length > BLUR_MAX_POINTS) points.shift();
    }
    while (points.length > 0 && now - points[0].t > blur.lifetime) {
      points.shift();
    }
    const positions = posAttr.array as Float32Array;
    const alphas = alphaAttr.array as Float32Array;
    let seg = 0;
    const half = blur.width * 0.5;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      _blurA.set(a.x - _blurOrigin.x, a.y - _blurOrigin.y, a.z - _blurOrigin.z);
      _blurB.set(b.x - _blurOrigin.x, b.y - _blurOrigin.y, b.z - _blurOrigin.z);
      _blurSeg.subVectors(_blurB, _blurA);
      if (_blurSeg.lengthSq() < 1e-6) continue;
      _blurToCam.copy(_blurA).add(_blurOrigin).sub(camera.position);
      _blurCross.crossVectors(_blurToCam, _blurSeg);
      if (_blurCross.lengthSq() < 1e-8) continue;
      _blurCross.normalize().multiplyScalar(half);
      const alphaA = Math.max(0, 1 - (now - a.t) / blur.lifetime);
      const alphaB = Math.max(0, 1 - (now - b.t) / blur.lifetime);
      const o = seg * 12;
      positions[o] = _blurA.x + _blurCross.x;
      positions[o + 1] = _blurA.y + _blurCross.y;
      positions[o + 2] = _blurA.z + _blurCross.z;
      positions[o + 3] = _blurA.x - _blurCross.x;
      positions[o + 4] = _blurA.y - _blurCross.y;
      positions[o + 5] = _blurA.z - _blurCross.z;
      positions[o + 6] = _blurB.x - _blurCross.x;
      positions[o + 7] = _blurB.y - _blurCross.y;
      positions[o + 8] = _blurB.z - _blurCross.z;
      positions[o + 9] = _blurB.x + _blurCross.x;
      positions[o + 10] = _blurB.y + _blurCross.y;
      positions[o + 11] = _blurB.z + _blurCross.z;
      const ao = seg * 4;
      alphas[ao] = alphaA;
      alphas[ao + 1] = alphaA;
      alphas[ao + 2] = alphaB;
      alphas[ao + 3] = alphaB;
      seg++;
    }
    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    mesh.visible = seg > 0;
    mesh.geometry.setDrawRange(0, seg * 6);
  };

  const maxSegs = BLUR_MAX_POINTS - 1;
  const index = useMemo(() => {
    const idx = new Uint16Array(maxSegs * 6);
    for (let i = 0; i < maxSegs; i++) {
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    return idx;
  }, [maxSegs]);

  const node =
    blur && material ? (
      <mesh ref={meshRef} material={material} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            ref={posRef}
            attach="attributes-position"
            args={[new Float32Array(maxSegs * 12), 3]}
          />
          <bufferAttribute
            ref={alphaRef}
            attach="attributes-alpha"
            args={[new Float32Array(maxSegs * 4), 1]}
          />
          <bufferAttribute attach="index" args={[index, 1]} />
        </bufferGeometry>
      </mesh>
    ) : null;

  return { node, update };
}

export function TracerProjectile({ entity }: { entity: TracerEntity }) {
  const { visual } = entity;
  const blurTail = useBlurTail(visual.blur);
  const tracerRef = useRef<Mesh>(null);
  const tracerPosRef = useRef<BufferAttribute>(null);
  const crossRef = useRef<Mesh>(null);
  const orientQuatRef = useRef(new Quaternion());
  const tracerUrls = useMemo(
    () => [
      textureToUrl(visual.texture),
      textureToUrl(visual.crossTexture ?? visual.texture),
    ],
    [visual.texture, visual.crossTexture],
  );
  const textures = useTexture(tracerUrls, (loaded) => {
    const list = Array.isArray(loaded) ? loaded : [loaded];
    for (const tex of list) {
      setupEffectTexture(tex);
    }
  });
  const [tracerTexture, crossTexture] = Array.isArray(textures)
    ? textures
    : [textures, textures];

  useFrame(({ camera }) => {
    blurTail.update(camera);
    const tracerMesh = tracerRef.current;
    const posAttr = tracerPosRef.current;
    if (!tracerMesh || !posAttr) return;

    const kf = entity.keyframes?.[0];
    const pos = kf?.position;
    const direction = entity.direction ?? kf?.velocity;
    if (!pos || !direction) {
      tracerMesh.visible = false;
      if (crossRef.current) crossRef.current.visible = false;
      return;
    }

    torqueVecToThree(direction, _tracerDir);
    if (_tracerDir.lengthSq() < 1e-8) {
      tracerMesh.visible = false;
      if (crossRef.current) crossRef.current.visible = false;
      return;
    }
    _tracerDir.normalize();

    tracerMesh.visible = true;
    torqueVecToThree(pos, _tracerWorldPos);
    _tracerDirFromCam.copy(_tracerWorldPos).sub(camera.position);
    _tracerCross.crossVectors(_tracerDirFromCam, _tracerDir);
    if (_tracerCross.lengthSq() < 1e-8) {
      _tracerCross.crossVectors(_upY, _tracerDir);
      if (_tracerCross.lengthSq() < 1e-8) {
        _tracerCross.set(1, 0, 0);
      }
    }
    _tracerCross.normalize().multiplyScalar(visual.tracerWidth);

    const halfLength = visual.tracerLength * 0.5;
    _tracerStart.copy(_tracerDir).multiplyScalar(-halfLength);
    _tracerEnd.copy(_tracerDir).multiplyScalar(halfLength);
    writeRibbonQuad(posAttr, _tracerStart, _tracerEnd, _tracerCross);

    const crossMesh = crossRef.current;
    if (!crossMesh) return;
    if (!visual.renderCross) {
      crossMesh.visible = false;
      return;
    }

    _tracerDirFromCam.normalize();
    const angle = _tracerDir.dot(_tracerDirFromCam);
    if (angle > -visual.crossViewAng && angle < visual.crossViewAng) {
      crossMesh.visible = false;
      return;
    }

    crossMesh.visible = true;
    setQuaternionFromDir(_tracerDir, orientQuatRef.current);
    crossMesh.quaternion.copy(orientQuatRef.current);
    crossMesh.scale.setScalar(visual.crossSize);
  });

  return (
    <>
      {blurTail.node}
      <mesh ref={tracerRef}>
        <bufferGeometry>
          <bufferAttribute
            ref={tracerPosRef}
            attach="attributes-position"
            args={[new Float32Array(12), 3]}
          />
          <bufferAttribute
            attach="attributes-uv"
            args={[new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]), 2]}
          />
          <bufferAttribute
            attach="index"
            args={[new Uint16Array([0, 1, 2, 0, 2, 3]), 1]}
          />
        </bufferGeometry>
        <meshBasicMaterial
          map={tracerTexture}
          transparent
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {visual.renderCross ? (
        <mesh ref={crossRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array([
                  -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
                ]),
                3,
              ]}
            />
            <bufferAttribute
              attach="attributes-uv"
              args={[new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]), 2]}
            />
            <bufferAttribute
              attach="index"
              args={[new Uint16Array([0, 1, 2, 0, 2, 3]), 1]}
            />
          </bufferGeometry>
          <meshBasicMaterial
            map={crossTexture}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      ) : null}
    </>
  );
}
