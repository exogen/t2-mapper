import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Quaternion,
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
import type { TracerVisual, SpriteVisual } from "../stream/types";

const _tracerDir = new Vector3();
const _tracerDirFromCam = new Vector3();
const _tracerCross = new Vector3();
const _tracerStart = new Vector3();
const _tracerEnd = new Vector3();
const _tracerWorldPos = new Vector3();
const _upY = new Vector3(0, 1, 0);

export function SpriteProjectile({ visual }: { visual: SpriteVisual }) {
  const url = textureToUrl(visual.texture);
  const texture = useTexture(url, (tex) => {
    const t = Array.isArray(tex) ? tex[0] : tex;
    setupEffectTexture(t);
  });
  const map = Array.isArray(texture) ? texture[0] : texture;

  // Convert sRGB datablock color to linear for Three.js material.
  const color = useMemo(
    () =>
      new Color().setRGB(visual.color.r, visual.color.g, visual.color.b, SRGBColorSpace),
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
      />
    </sprite>
  );
}

export function TracerProjectile({
  entity,
  visual,
}: {
  entity: { keyframes?: Array<{ position?: [number, number, number]; velocity?: [number, number, number] }>; direction?: [number, number, number] };
  visual: TracerVisual;
}) {
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

    const posArray = posAttr.array as Float32Array;
    posArray[0] = _tracerStart.x + _tracerCross.x;
    posArray[1] = _tracerStart.y + _tracerCross.y;
    posArray[2] = _tracerStart.z + _tracerCross.z;
    posArray[3] = _tracerStart.x - _tracerCross.x;
    posArray[4] = _tracerStart.y - _tracerCross.y;
    posArray[5] = _tracerStart.z - _tracerCross.z;
    posArray[6] = _tracerEnd.x - _tracerCross.x;
    posArray[7] = _tracerEnd.y - _tracerCross.y;
    posArray[8] = _tracerEnd.z - _tracerCross.z;
    posArray[9] = _tracerEnd.x + _tracerCross.x;
    posArray[10] = _tracerEnd.y + _tracerCross.y;
    posArray[11] = _tracerEnd.z + _tracerCross.z;
    posAttr.needsUpdate = true;

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
      <mesh ref={tracerRef}>
        <bufferGeometry>
          <bufferAttribute
            ref={tracerPosRef}
            attach="attributes-position"
            args={[new Float32Array(12), 3]}
          />
          <bufferAttribute
            attach="attributes-uv"
            args={[
              new Float32Array([
                0, 0, 0, 1, 1, 1, 1, 0,
              ]),
              2,
            ]}
          />
          <bufferAttribute attach="index" args={[new Uint16Array([0, 1, 2, 0, 2, 3]), 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          map={tracerTexture}
          transparent
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {visual.renderCross ? (
        <mesh ref={crossRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array([
                  -0.5, 0, -0.5,
                  0.5, 0, -0.5,
                  0.5, 0, 0.5,
                  -0.5, 0, 0.5,
                ]),
                3,
              ]}
            />
            <bufferAttribute
              attach="attributes-uv"
              args={[
                new Float32Array([
                  0, 0, 0, 1, 1, 1, 1, 0,
                ]),
                2,
              ]}
            />
            <bufferAttribute attach="index" args={[new Uint16Array([0, 1, 2, 0, 2, 3]), 1]} />
          </bufferGeometry>
          <meshBasicMaterial
            map={crossTexture}
            transparent
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </>
  );
}
