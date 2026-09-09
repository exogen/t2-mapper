/**
 * The beam-family projectile renderers: the sniper laser (fixed
 * endpoints, two fading passes) and the ELF/repair link beams (live
 * endpoints between two objects).
 *
 * All of them are unfogged on purpose: the engine's beam renderers apply
 * neither haze nor GL fog (sniper FUN_00642f60, ELF FUN_0064cff0, repair
 * FUN_00645fc0, ribbon FUN_0044da90 — binary-verified), and fogging an
 * additive ribbon whose texture has no alpha paints its whole strip.
 */
import { Group, Vector3, SRGBColorSpace, NormalBlending } from "three";
import type { BufferAttribute, Texture } from "three";
import { torqueVecToThree } from "../../stream/playbackUtils";
import {
  streamClock,
  streamPlaybackStore,
} from "../../state/streamPlaybackStore";
import type { BeamEntity, LinkBeamEntity } from "../../state/gameEntityTypes";
import {
  LINK_MUZZLE_LIFT,
  muzzleWorldPosition,
  sourceAimDirection,
} from "../linkBeamSource";
import { writeLinkRibbon, writeRibbonQuad } from "../projectileGeometry";
import {
  effectMesh,
  effectMaterial,
  ribbonGeometry,
  disposeGeometry,
} from "./geometry";
import { projectileLight } from "./light";
import type { ProjectileView } from "./types";
const _upY = new Vector3(0, 1, 0);
const _linkPoint = new Vector3();

// ── Sniper laser beam (binary-verified: Tribes2.exe FUN_00642f60) ──

/** Pass-2 overlay is 25% wider than the core. */
const BEAM_PULSE_WIDTH_SCALE = 1.25;
/** Overlay U scroll = -pulseSpeed x elapsed x this (pulse marches
 *  toward the target). */
const BEAM_PULSE_SCROLL_RATE = 0.5;
/** Overlay texture index = round(fade x 10 + 1): nonlingradient when
 *  fresh, stepping through laserrip01-09 as the beam dissipates. */
const BEAM_RIP_RATE = 10;

const _beamA = new Vector3();
const _beamB = new Vector3();
const _beamOrigin = new Vector3();
const _beamDir = new Vector3();
const _beamFromCam = new Vector3();
const _beamCross = new Vector3();
const _beamScaledCross = new Vector3();

/**
 * The laser rifle's beam: a straight camera-facing ribbon from muzzle
 * to impact, alive for fadeTime seconds. Two passes, both ordinary
 * alpha blending with no depth write (the engine blends
 * SRC_ALPHA/ONE_MINUS_SRC_ALPHA): the white core textured with
 * sniper00, width interpolating startWidth->endWidth over the fade,
 * alpha 1-t; and the beamColor-tinted overlay 25% wider whose texture
 * steps through the laserrip sequence while its U coordinate scrolls
 * the pulse toward the target (one repeat per 1/pulseLength meters).
 */
export function createBeamView(
  visual: BeamEntity["visual"],
  textures: Texture[],
): ProjectileView<BeamEntity> {
  const root = new Group(),
    mainMaterial = effectMaterial(textures.at(-1)),
    pulseMaterial = effectMaterial(textures[0]);
  mainMaterial.blending = NormalBlending;
  pulseMaterial.blending = NormalBlending;
  pulseMaterial.color.setRGB(
    visual.color.r,
    visual.color.g,
    visual.color.b,
    SRGBColorSpace,
  );
  const main = effectMesh(ribbonGeometry(), mainMaterial),
    pulse = effectMesh(ribbonGeometry(), pulseMaterial);
  root.add(main, pulse);
  const mainPosition = main.geometry.getAttribute(
    "position",
  ) as BufferAttribute;
  const pulsePosition = pulse.geometry.getAttribute(
    "position",
  ) as BufferAttribute;
  const pulseUV = pulse.geometry.getAttribute("uv") as BufferAttribute;
  const light = projectileLight(root, visual.light);
  return {
    root,
    reset() {
      light.acquire();
    },
    release: light.release,
    dispose() {
      light.release();
      disposeGeometry(root);
    },
    update(entity, camera) {
      const group = root;
      const mainPos = mainPosition;
      const pulsePos = pulsePosition;
      const pulseUv = pulseUV;
      const mainMat = mainMaterial;
      const pulseMat = pulseMaterial;
      if (
        !group ||
        !mainPos ||
        !pulsePos ||
        !pulseUv ||
        !mainMat ||
        !pulseMat
      ) {
        return;
      }
      const elapsed = streamClock.time - (entity.spawnTime ?? 0);
      const t = elapsed / Math.max(0.001, visual.fadeTime);
      const endLight = light.light;
      if (t < 0 || t >= 1) {
        group.visible = false;
        if (endLight) endLight.intensity = 0;
        return;
      }
      torqueVecToThree(entity.beamStart, _beamA);
      torqueVecToThree(entity.beamEnd, _beamB);
      _beamDir.subVectors(_beamB, _beamA);
      const length = _beamDir.length();
      if (length < 1e-3) {
        group.visible = false;
        return;
      }
      _beamDir.normalize();
      // Local space: the wrapper's group sits at the ghost position (the
      // muzzle), so verts are world minus the group's world position.
      group.getWorldPosition(_beamOrigin);
      _beamA.sub(_beamOrigin);
      _beamB.sub(_beamOrigin);
      _beamFromCam.copy(_beamA).add(_beamOrigin).sub(camera.position);
      _beamCross.crossVectors(_beamFromCam, _beamDir);
      if (_beamCross.lengthSq() < 1e-8) {
        _beamCross.crossVectors(_upY, _beamDir);
        if (_beamCross.lengthSq() < 1e-8) _beamCross.set(1, 0, 0);
      }
      _beamCross.normalize();
      group.visible = true;
      const width =
        visual.startWidth + (visual.endWidth - visual.startWidth) * t;
      _beamScaledCross.copy(_beamCross).multiplyScalar(width * 0.5);
      if (endLight) {
        endLight.offset.copy(_beamB);
        endLight.intensity = 1 - t;
      }
      writeRibbonQuad(mainPos, _beamA, _beamB, _beamScaledCross);
      _beamScaledCross
        .copy(_beamCross)
        .multiplyScalar(width * BEAM_PULSE_WIDTH_SCALE * 0.5);
      writeRibbonQuad(pulsePos, _beamA, _beamB, _beamScaledCross);
      mainMat.opacity = 1 - t;
      pulseMat.opacity = 1 - t;
      // Overlay: scrolling repeat along the beam, texture by fade stage.
      const u0 = -visual.pulseSpeed * elapsed * BEAM_PULSE_SCROLL_RATE;
      const u1 = u0 + length * visual.pulseLength;
      const uv = pulseUv.array as Float32Array;
      uv[0] = u0;
      uv[2] = u0;
      uv[4] = u1;
      uv[6] = u1;
      pulseUv.needsUpdate = true;
      const ripIndex = Math.min(
        textures.length - 1,
        Math.max(0, Math.round(t * BEAM_RIP_RATE + 1) - 1),
      );
      const rip = textures[ripIndex];
      if (pulseMat.map !== rip) {
        pulseMat.map = rip;
        pulseMat.needsUpdate = true;
      }
    },
  };
}
// ── ELF / repair link beams (binary-verified: ELF FUN_0064cff0,
//    repair FUN_00645fc0, shared ribbon renderer FUN_0044da90) ──

/** Ribbon samples: ELF uses 16, repair 20 (engine call sites). */
const LINK_BEAM_SEGMENTS = { elf: 16, repair: 20 } as const;
/** ELF lightning: three ribbons of 16 jittered points, re-seeded at
 *  roughly the flicker rate of the original effect. */
const LIGHTNING_RIBBONS = 3;
const LIGHTNING_POINTS = 16;
const LIGHTNING_RESEED_SEC = 1 / 15;
/** Target attach height (body/object centre). */
const LINK_TARGET_LIFT = 1.0;

const _linkOrigin = new Vector3();
const _linkStart = new Vector3();
const _linkEnd = new Vector3();
const _linkControl = new Vector3();
const _linkAim = new Vector3();
const _linkFlareRight = new Vector3();
const _linkFlareUp = new Vector3();

/**
 * A beam linking two live objects. Repair: a straight scrolling ribbon
 * (redbump2, alpha 0.75) from the repairer's muzzle to the repaired
 * object, with a redflare impact billboard. ELF: the ribbon bows
 * through the shooter's aim point (quadratic through muzzle, aim point
 * and target — the signature whip), plus three lightning ribbons
 * jittered lightningDist off the beam (ends pinned) re-seeded at
 * flicker rate, and a BlueImpact flare. All passes additive with no
 * depth write, exactly as the engine draws them.
 */
export function createLinkBeamView(
  visual: LinkBeamEntity["visual"],
  textures: Texture[],
): ProjectileView<LinkBeamEntity> {
  const viewRoot = new Group(),
    segments = LINK_BEAM_SEGMENTS[visual.variant];
  const flareTexture = visual.flareTexture ? textures[1] : undefined;
  const lightningTexture = visual.lightningTexture
    ? textures[visual.flareTexture ? 2 : 1]
    : undefined;
  const mainMaterial = effectMaterial(textures[0]);
  mainMaterial.opacity = visual.alpha;
  const main = effectMesh(ribbonGeometry(segments, false), mainMaterial);
  viewRoot.add(main);
  const mainPosition = main.geometry.getAttribute(
      "position",
    ) as BufferAttribute,
    mainUV = main.geometry.getAttribute("uv") as BufferAttribute;
  const lightningPositions: BufferAttribute[] = [],
    lightningUVs: BufferAttribute[] = [];
  const lightningOffsets = Array.from(
    { length: LIGHTNING_RIBBONS },
    () => new Float32Array(LIGHTNING_POINTS * 3),
  );
  let lastSeed = -1;
  if (lightningTexture)
    for (let i = 0; i < LIGHTNING_RIBBONS; i++) {
      const mesh = effectMesh(
        ribbonGeometry(LIGHTNING_POINTS, false),
        effectMaterial(lightningTexture),
      );
      viewRoot.add(mesh);
      lightningPositions.push(
        mesh.geometry.getAttribute("position") as BufferAttribute,
      );
      lightningUVs.push(mesh.geometry.getAttribute("uv") as BufferAttribute);
    }
  const flareMesh = flareTexture
    ? effectMesh(ribbonGeometry(), effectMaterial(flareTexture))
    : null;
  const flarePosition = flareMesh?.geometry.getAttribute("position") as
    BufferAttribute | undefined;
  if (flareMesh) {
    flareMesh.geometry.getAttribute("uv").array.set([0, 0, 1, 0, 1, 1, 0, 1]);
    viewRoot.add(flareMesh);
  }
  return {
    root: viewRoot,
    reset() {
      lastSeed = -1;
    },
    release() {},
    dispose() {
      disposeGeometry(viewRoot);
    },
    update(entity, camera) {
      const group = viewRoot;
      const mainPos = mainPosition;
      const mainUv = mainUV;
      if (!group || !mainPos || !mainUv) return;
      const root = streamPlaybackStore.getState().root;
      const source = entity.linkSourceId
        ? root?.children.find((c) => c.name === entity.linkSourceId)
        : undefined;
      const target = entity.linkTargetId
        ? root?.children.find((c) => c.name === entity.linkTargetId)
        : undefined;
      if (!source || !target) {
        group.visible = false;
        return;
      }
      group.visible = true;
      group.getWorldPosition(_linkOrigin);
      if (!muzzleWorldPosition(source, streamClock.time, _linkStart)) {
        _linkStart.copy(source.position);
        _linkStart.y += LINK_MUZZLE_LIFT;
      }
      _linkEnd.copy(target.position);
      _linkEnd.y += LINK_TARGET_LIFT;
      const length = _linkStart.distanceTo(_linkEnd);
      if (length < 0.5) {
        group.visible = false;
        return;
      }

      // The ELF bow: control point = muzzle + aim direction x range —
      // the beam leaves the barrel where the shooter POINTS and curves
      // over to the locked target (engine path builder FUN_0064cd70,
      // using getRenderMuzzleVector). The aim is rebuilt exactly the way
      // the verified first-person camera is: body yaw plus replicated
      // head yaw/pitch through yawPitchToQuaternion, forward = -Z.
      const curved = visual.variant === "elf";
      if (curved) {
        sourceAimDirection(entity.linkSourceId, source, _linkAim);
        _linkControl.copy(_linkStart).addScaledVector(_linkAim, length);
      }
      const sample = (t: number, out: Vector3): Vector3 => {
        if (!curved) {
          return out.copy(_linkStart).lerp(_linkEnd, t);
        }
        // Quadratic Bezier through muzzle → aim point → target.
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        return out.set(
          _linkStart.x * a + _linkControl.x * b + _linkEnd.x * c,
          _linkStart.y * a + _linkControl.y * b + _linkEnd.y * c,
          _linkStart.z * a + _linkControl.z * b + _linkEnd.z * c,
        );
      };

      const age = streamClock.time - (entity.spawnTime ?? 0);
      const u0 = -age * visual.scrollSpeed;
      const uLength = length * visual.texRepeat;
      writeLinkRibbon(
        mainPos,
        mainUv,
        sample,
        segments,
        visual.width * 0.5,
        camera,
        _linkOrigin,
        u0,
        uLength,
      );

      // ELF lightning: offsets re-seeded at flicker rate, ends pinned.
      if (curved && lightningTexture) {
        if (
          lastSeed < 0 ||
          streamClock.time - lastSeed >= LIGHTNING_RESEED_SEC ||
          streamClock.time < lastSeed
        ) {
          lastSeed = streamClock.time;
          for (const offsets of lightningOffsets) {
            for (let i = 0; i < LIGHTNING_POINTS; i++) {
              if (i === 0 || i === LIGHTNING_POINTS - 1) {
                offsets[i * 3] = 0;
                offsets[i * 3 + 1] = 0;
                offsets[i * 3 + 2] = 0;
                continue;
              }
              _linkPoint
                .set(
                  Math.random() * 2 - 1,
                  Math.random() * 2 - 1,
                  Math.random() * 2 - 1,
                )
                .normalize()
                .multiplyScalar(visual.lightningDist ?? 0.15);
              offsets[i * 3] = _linkPoint.x;
              offsets[i * 3 + 1] = _linkPoint.y;
              offsets[i * 3 + 2] = _linkPoint.z;
            }
          }
        }
        for (let r = 0; r < LIGHTNING_RIBBONS; r++) {
          const posAttr = lightningPositions[r];
          const uvAttr = lightningUVs[r];
          if (!posAttr || !uvAttr) continue;
          const offsets = lightningOffsets[r];
          writeLinkRibbon(
            posAttr,
            uvAttr,
            (t, out) => {
              sample(t, out);
              const i = Math.min(
                LIGHTNING_POINTS - 1,
                Math.round(t * (LIGHTNING_POINTS - 1)),
              );
              out.x += offsets[i * 3];
              out.y += offsets[i * 3 + 1];
              out.z += offsets[i * 3 + 2];
              return out;
            },
            LIGHTNING_POINTS,
            (visual.lightningWidth ?? 0.1) * 0.5,
            camera,
            _linkOrigin,
            0,
            1,
          );
        }
      }

      // Impact flare: camera-facing quad at the target end.
      const flare = flareMesh;
      const flarePos = flarePosition;
      if (flare && flarePos && flareTexture) {
        const half = visual.flareSize * 0.5;
        _linkFlareRight
          .set(1, 0, 0)
          .applyQuaternion(camera.quaternion)
          .multiplyScalar(half);
        _linkFlareUp
          .set(0, 1, 0)
          .applyQuaternion(camera.quaternion)
          .multiplyScalar(half);
        const p = flarePos.array as Float32Array;
        const cx = _linkEnd.x - _linkOrigin.x;
        const cy = _linkEnd.y - _linkOrigin.y;
        const cz = _linkEnd.z - _linkOrigin.z;
        p[0] = cx - _linkFlareRight.x - _linkFlareUp.x;
        p[1] = cy - _linkFlareRight.y - _linkFlareUp.y;
        p[2] = cz - _linkFlareRight.z - _linkFlareUp.z;
        p[3] = cx + _linkFlareRight.x - _linkFlareUp.x;
        p[4] = cy + _linkFlareRight.y - _linkFlareUp.y;
        p[5] = cz + _linkFlareRight.z - _linkFlareUp.z;
        p[6] = cx + _linkFlareRight.x + _linkFlareUp.x;
        p[7] = cy + _linkFlareRight.y + _linkFlareUp.y;
        p[8] = cz + _linkFlareRight.z + _linkFlareUp.z;
        p[9] = cx - _linkFlareRight.x + _linkFlareUp.x;
        p[10] = cy - _linkFlareRight.y + _linkFlareUp.y;
        p[11] = cz - _linkFlareRight.z + _linkFlareUp.z;
        flarePos.needsUpdate = true;
      }
    },
  };
}
