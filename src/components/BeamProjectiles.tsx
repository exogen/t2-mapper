/**
 * The beam-family projectile renderers: the sniper laser (fixed
 * endpoints, two fading passes) and the ELF/repair link beams (live
 * endpoints between two objects). Split from Projectiles.tsx, which
 * keeps the quad-style sprite/tracer renderers.
 *
 * All of them are unfogged on purpose: the engine's beam renderers apply
 * neither haze nor GL fog (sniper FUN_00642f60, ELF FUN_0064cff0, repair
 * FUN_00645fc0, ribbon FUN_0044da90 — binary-verified), and fogging an
 * additive ribbon whose texture has no alpha paints its whole strip.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";
import type {
  BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Texture,
} from "three";
import { setupEffectTexture, torqueVecToThree } from "../stream/playbackUtils";
import { textureToUrl } from "../loaders";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { gameEntityStore } from "../state/gameEntityStore";
import {
  MAX_PITCH,
  threeForwardHeading,
  yawPitchToQuaternion,
} from "../stream/streamHelpers";
import { BeamEntity, LinkBeamEntity } from "../state/gameEntityTypes";
import {
  ribbonIndices,
  writeLinkRibbon,
  writeRibbonQuad,
} from "./projectileGeometry";

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
export function BeamProjectile({ entity }: { entity: BeamEntity }) {
  const { visual } = entity;
  const groupRef = useRef<Group>(null);
  const mainPosRef = useRef<BufferAttribute>(null);
  const pulsePosRef = useRef<BufferAttribute>(null);
  const pulseUvRef = useRef<BufferAttribute>(null);
  const mainMatRef = useRef<MeshBasicMaterial>(null);
  const pulseMatRef = useRef<MeshBasicMaterial>(null);
  // Textures [1..11]: nonlingradient, laserrip01-09, sniper00. The
  // overlay scrolls in U, so it needs horizontal repeat.
  const urls = useMemo(
    () => visual.textures.slice(1).map((name) => textureToUrl(name)),
    [visual.textures],
  );
  const loaded = useTexture(urls, (tex) => {
    for (const t of Array.isArray(tex) ? tex : [tex]) {
      setupEffectTexture(t);
      t.wrapS = RepeatWrapping;
    }
  });
  const textures: Texture[] = Array.isArray(loaded) ? loaded : [loaded];
  const mainTexture = textures[textures.length - 1];
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

  useFrame(({ camera }) => {
    const group = groupRef.current;
    const mainPos = mainPosRef.current;
    const pulsePos = pulsePosRef.current;
    const pulseUv = pulseUvRef.current;
    const mainMat = mainMatRef.current;
    const pulseMat = pulseMatRef.current;
    if (!group || !mainPos || !pulsePos || !pulseUv || !mainMat || !pulseMat) {
      return;
    }
    const elapsed = streamClock.time - (entity.spawnTime ?? 0);
    const t = elapsed / Math.max(0.001, visual.fadeTime);
    if (t < 0 || t >= 1) {
      group.visible = false;
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
    const width = visual.startWidth + (visual.endWidth - visual.startWidth) * t;
    _beamScaledCross.copy(_beamCross).multiplyScalar(width * 0.5);
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
  });

  const quadIndex = useMemo(() => new Uint16Array([0, 1, 2, 0, 2, 3]), []);
  return (
    <group ref={groupRef}>
      <mesh frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            ref={mainPosRef}
            attach="attributes-position"
            args={[new Float32Array(12), 3]}
          />
          <bufferAttribute
            attach="attributes-uv"
            args={[new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]), 2]}
          />
          <bufferAttribute attach="index" args={[quadIndex, 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          ref={mainMatRef}
          map={mainTexture}
          transparent
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      <mesh frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            ref={pulsePosRef}
            attach="attributes-position"
            args={[new Float32Array(12), 3]}
          />
          <bufferAttribute
            ref={pulseUvRef}
            attach="attributes-uv"
            args={[new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]), 2]}
          />
          <bufferAttribute attach="index" args={[quadIndex, 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          ref={pulseMatRef}
          map={textures[0]}
          color={color}
          transparent
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
          fog={false}
        />
      </mesh>
    </group>
  );
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
/** Fallback muzzle height above the source's origin, used only when
 *  no Muzzlepoint node resolves (weapon not mounted/loaded yet). */
const LINK_MUZZLE_LIFT = 1.4;
/** How often to re-search a source's subtree for its muzzle node —
 *  weapons swap on mount changes, so the cache is short-lived. */
const MUZZLE_CACHE_SEC = 1;

/**
 * The engine starts both link beams at getRenderMuzzlePoint(sourceSlot)
 * — the mounted weapon's Muzzlepoint node, animated with the player
 * (vtable +0x190 in FUN_0064cff0/FUN_00645fc0). Our mounted weapon
 * shapes portal into the player's subtree, so the same node is
 * reachable by name; cached briefly since weapons swap.
 */
const _muzzleCache = new WeakMap<
  object,
  { node: { getWorldPosition(v: Vector3): Vector3 } | null; checkedAt: number }
>();
function muzzleWorldPosition(
  source: { traverse(cb: (o: unknown) => void): void },
  nowSec: number,
  out: Vector3,
): boolean {
  let entry = _muzzleCache.get(source);
  if (
    !entry ||
    nowSec - entry.checkedAt > MUZZLE_CACHE_SEC ||
    nowSec < entry.checkedAt
  ) {
    let found: { getWorldPosition(v: Vector3): Vector3 } | null = null;
    source.traverse((o) => {
      const name = (o as { name?: string }).name;
      if (!found && name && name.toLowerCase().includes("muzzlepoint")) {
        found = o as { getWorldPosition(v: Vector3): Vector3 };
      }
    });
    entry = { node: found, checkedAt: nowSec };
    _muzzleCache.set(source, entry);
  }
  if (!entry.node) return false;
  entry.node.getWorldPosition(out);
  return true;
}
/** Target attach height (body/object centre). */
const LINK_TARGET_LIFT = 1.0;

const _linkOrigin = new Vector3();
const _linkStart = new Vector3();
const _linkEnd = new Vector3();
const _linkControl = new Vector3();
const _linkAim = new Vector3();
const _linkFlareRight = new Vector3();
const _linkFlareUp = new Vector3();
const _linkAimQuat = new Quaternion();

/** PlayerData::maxLookAngle — 1.5 rad in every Tribes 2 armor. */
const LINK_MAX_LOOK_ANGLE = 1.5;

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
export function LinkBeamProjectile({ entity }: { entity: LinkBeamEntity }) {
  const { visual } = entity;
  const groupRef = useRef<Group>(null);
  const mainPosRef = useRef<BufferAttribute>(null);
  const mainUvRef = useRef<BufferAttribute>(null);
  const flareRef = useRef<Mesh>(null);
  const flarePosRef = useRef<BufferAttribute>(null);
  const lightningPos0 = useRef<BufferAttribute>(null);
  const lightningPos1 = useRef<BufferAttribute>(null);
  const lightningPos2 = useRef<BufferAttribute>(null);
  const lightningUv0 = useRef<BufferAttribute>(null);
  const lightningUv1 = useRef<BufferAttribute>(null);
  const lightningUv2 = useRef<BufferAttribute>(null);
  const lightningPosRefs = [lightningPos0, lightningPos1, lightningPos2];
  const lightningUvRefs = [lightningUv0, lightningUv1, lightningUv2];
  const lightningOffsets = useRef<Float32Array[]>(
    Array.from(
      { length: LIGHTNING_RIBBONS },
      () => new Float32Array(LIGHTNING_POINTS * 3),
    ),
  );
  const lastSeedRef = useRef(-1);

  const segments = LINK_BEAM_SEGMENTS[visual.variant];
  const urls = useMemo(() => {
    const list = [textureToUrl(visual.texture)];
    if (visual.flareTexture) list.push(textureToUrl(visual.flareTexture));
    if (visual.lightningTexture) {
      list.push(textureToUrl(visual.lightningTexture));
    }
    return list;
  }, [visual.texture, visual.flareTexture, visual.lightningTexture]);
  const loaded = useTexture(urls, (tex) => {
    for (const t of Array.isArray(tex) ? tex : [tex]) {
      setupEffectTexture(t);
      t.wrapS = RepeatWrapping;
    }
  });
  const textures: Texture[] = Array.isArray(loaded) ? loaded : [loaded];
  const mainTexture = textures[0];
  const flareTexture = visual.flareTexture ? textures[1] : undefined;
  const lightningTexture = visual.lightningTexture
    ? textures[visual.flareTexture ? 2 : 1]
    : undefined;

  useFrame(({ camera }) => {
    const group = groupRef.current;
    const mainPos = mainPosRef.current;
    const mainUv = mainUvRef.current;
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
      const srcEntity = entity.linkSourceId
        ? gameEntityStore.getState().streamEntities.get(entity.linkSourceId)
        : undefined;
      const headPitch =
        srcEntity && "headPitch" in srcEntity
          ? ((srcEntity.headPitch as number | undefined) ?? 0)
          : 0;
      const headYaw =
        srcEntity && "headYaw" in srcEntity
          ? ((srcEntity.headYaw as number | undefined) ?? 0)
          : 0;
      const bodyYaw = threeForwardHeading(source.quaternion);
      const pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, headPitch * LINK_MAX_LOOK_ANGLE),
      );
      const [rx, ry, rz, rw] = yawPitchToQuaternion(
        bodyYaw + headYaw * LINK_MAX_LOOK_ANGLE,
        pitch,
      );
      _linkAimQuat.set(rx, ry, rz, rw);
      _linkAim.set(0, 0, -1).applyQuaternion(_linkAimQuat);
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
        lastSeedRef.current < 0 ||
        streamClock.time - lastSeedRef.current >= LIGHTNING_RESEED_SEC ||
        streamClock.time < lastSeedRef.current
      ) {
        lastSeedRef.current = streamClock.time;
        for (const offsets of lightningOffsets.current) {
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
        const posAttr = lightningPosRefs[r].current;
        const uvAttr = lightningUvRefs[r].current;
        if (!posAttr || !uvAttr) continue;
        const offsets = lightningOffsets.current[r];
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
    const flare = flareRef.current;
    const flarePos = flarePosRef.current;
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
  });

  const ribbonIdx = useMemo(() => ribbonIndices(segments), [segments]);
  const lightningIdx = useMemo(() => ribbonIndices(LIGHTNING_POINTS), []);
  const quadIdx = useMemo(() => new Uint16Array([0, 1, 2, 0, 2, 3]), []);
  return (
    <group ref={groupRef}>
      <mesh frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            ref={mainPosRef}
            attach="attributes-position"
            args={[new Float32Array(segments * 6), 3]}
          />
          <bufferAttribute
            ref={mainUvRef}
            attach="attributes-uv"
            args={[new Float32Array(segments * 4), 2]}
          />
          <bufferAttribute attach="index" args={[ribbonIdx, 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          map={mainTexture}
          transparent
          opacity={visual.alpha}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {visual.lightningTexture
        ? lightningPosRefs.map((posRef, i) => (
            <mesh key={i} frustumCulled={false}>
              <bufferGeometry>
                <bufferAttribute
                  ref={posRef}
                  attach="attributes-position"
                  args={[new Float32Array(LIGHTNING_POINTS * 6), 3]}
                />
                <bufferAttribute
                  ref={lightningUvRefs[i]}
                  attach="attributes-uv"
                  args={[new Float32Array(LIGHTNING_POINTS * 4), 2]}
                />
                <bufferAttribute attach="index" args={[lightningIdx, 1]} />
              </bufferGeometry>
              <meshBasicMaterial
                map={lightningTexture}
                transparent
                blending={AdditiveBlending}
                depthWrite={false}
                side={DoubleSide}
                toneMapped={false}
                fog={false}
              />
            </mesh>
          ))
        : null}
      {visual.flareTexture ? (
        <mesh ref={flareRef} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              ref={flarePosRef}
              attach="attributes-position"
              args={[new Float32Array(12), 3]}
            />
            <bufferAttribute
              attach="attributes-uv"
              args={[new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2]}
            />
            <bufferAttribute attach="index" args={[quadIdx, 1]} />
          </bufferGeometry>
          <meshBasicMaterial
            map={flareTexture}
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}
