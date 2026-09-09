import {
  Color,
  Group,
  Quaternion,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  BufferAttribute,
  AdditiveBlending,
  DoubleSide,
  BufferGeometry,
} from "three";
import type { Camera, Texture } from "three";
import type { SpriteEntity, TracerEntity } from "../../state/gameEntityTypes";
import {
  torqueVecToThree,
  setQuaternionFromDir,
} from "../../stream/playbackUtils";
import { streamClock } from "../../state/streamPlaybackStore";
import { writeRibbonQuad } from "../projectileGeometry";
import {
  ribbonGeometry,
  effectMesh,
  effectMaterial,
  disposeGeometry,
} from "./geometry";
import { projectileLight } from "./light";
import type { ProjectileView } from "./types";
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

export function createSpriteView(
  visual: SpriteEntity["visual"],
  map: Texture,
): ProjectileView<SpriteEntity> {
  const root = new Group();
  const material = new SpriteMaterial({
    map,
    color: new Color().setRGB(
      visual.color.r,
      visual.color.g,
      visual.color.b,
      SRGBColorSpace,
    ),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(visual.size, visual.size, 1);
  root.add(sprite);
  return {
    root,
    reset() {},
    update() {},
    release() {},
    dispose: () => material.dispose(),
  };
}

/** Fixed storage for the blaster's 0.2-second motion-blur path. */
function createBlurTail(
  blur: NonNullable<TracerEntity["visual"]["blur"]>,
  root: Group,
) {
  const capacity = 32,
    points = new Float64Array(capacity * 4);
  let head = 0,
    count = 0;
  const geometry = new BufferGeometry();
  const positions = new Float32Array((capacity - 1) * 12),
    alphas = new Float32Array((capacity - 1) * 4);
  const position = new BufferAttribute(positions, 3),
    alpha = new BufferAttribute(alphas, 1);
  geometry.setAttribute("position", position);
  geometry.setAttribute("alpha", alpha);
  const indices = new Uint16Array((capacity - 1) * 6);
  for (let i = 0; i < capacity - 1; i++)
    indices.set(
      [i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3],
      i * 6,
    );
  geometry.setIndex(new BufferAttribute(indices, 1));
  const material = new ShaderMaterial({
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
    vertexShader: `attribute float alpha; varying float vAlpha; void main() { vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlpha; void main() { gl_FragColor = vec4(uColor, vAlpha); }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const mesh = effectMesh(geometry, material);
  root.add(mesh);
  const at = (i: number) => ((head + i) % capacity) * 4;
  return {
    reset() {
      head = 0;
      count = 0;
      mesh.visible = false;
      geometry.setDrawRange(0, 0);
    },
    update(camera: Camera) {
      const now = streamClock.time;
      if (count && now < points[at(count - 1) + 3]) {
        head = 0;
        count = 0;
      }
      root.getWorldPosition(_blurOrigin);
      if (!count || now > points[at(count - 1) + 3]) {
        if (count === capacity) {
          head = (head + 1) % capacity;
          count--;
        }
        const o = at(count++);
        points[o] = _blurOrigin.x;
        points[o + 1] = _blurOrigin.y;
        points[o + 2] = _blurOrigin.z;
        points[o + 3] = now;
      }
      while (count && now - points[at(0) + 3] > blur.lifetime) {
        head = (head + 1) % capacity;
        count--;
      }
      let seg = 0;
      for (let i = 0; i + 1 < count; i++) {
        const a = at(i),
          b = at(i + 1);
        _blurA.fromArray(points, a).sub(_blurOrigin);
        _blurB.fromArray(points, b).sub(_blurOrigin);
        _blurSeg.subVectors(_blurB, _blurA);
        if (_blurSeg.lengthSq() < 1e-6) continue;
        _blurToCam.copy(_blurA).add(_blurOrigin).sub(camera.position);
        _blurCross.crossVectors(_blurToCam, _blurSeg);
        if (_blurCross.lengthSq() < 1e-8) continue;
        _blurCross.normalize().multiplyScalar(blur.width * 0.5);
        const o = seg * 12;
        for (let k = 0; k < 4; k++) {
          const p = k < 2 ? _blurA : _blurB,
            sign = k === 0 || k === 3 ? 1 : -1;
          positions[o + k * 3] = p.x + sign * _blurCross.x;
          positions[o + k * 3 + 1] = p.y + sign * _blurCross.y;
          positions[o + k * 3 + 2] = p.z + sign * _blurCross.z;
          alphas[seg * 4 + k] = Math.max(
            0,
            1 - (now - points[(k < 2 ? a : b) + 3]) / blur.lifetime,
          );
        }
        seg++;
      }
      position.needsUpdate = true;
      alpha.needsUpdate = true;
      mesh.visible = seg > 0;
      geometry.setDrawRange(0, seg * 6);
    },
  };
}

// Unfogged like the engine's tracer and blaster bolt renderers.
export function createTracerView(
  visual: TracerEntity["visual"],
  textures: Texture[],
): ProjectileView<TracerEntity> {
  const root = new Group();
  const blurTail = visual.blur ? createBlurTail(visual.blur, root) : null;
  const tracer = effectMesh(ribbonGeometry(), effectMaterial(textures[0]));
  root.add(tracer);
  const tracerPos = tracer.geometry.getAttribute("position") as BufferAttribute;
  const cross = visual.renderCross
    ? effectMesh(ribbonGeometry(), effectMaterial(textures[1]))
    : null;
  if (cross) {
    cross.geometry
      .getAttribute("position")
      .array.set([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]);
    root.add(cross);
  }
  const orientQuat = new Quaternion();
  const light = projectileLight(tracer, visual.light);
  return {
    root,
    reset() {
      blurTail?.reset();
      light.acquire();
    },
    release: light.release,
    dispose() {
      light.release();
      disposeGeometry(root);
    },
    update(entity, camera) {
      blurTail?.update(camera);
      const tracerMesh = tracer;
      const posAttr = tracerPos;
      if (!tracerMesh || !posAttr) return;

      const kf = entity.keyframes?.[0];
      const pos = kf?.position;
      const direction = entity.direction ?? kf?.velocity;
      if (!pos || !direction) {
        tracerMesh.visible = false;
        if (cross) cross.visible = false;
        return;
      }

      torqueVecToThree(direction, _tracerDir);
      if (_tracerDir.lengthSq() < 1e-8) {
        tracerMesh.visible = false;
        if (cross) cross.visible = false;
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

      const crossMesh = cross;
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
      setQuaternionFromDir(_tracerDir, orientQuat);
      crossMesh.quaternion.copy(orientQuat);
      crossMesh.scale.setScalar(visual.crossSize);
    },
  };
}
