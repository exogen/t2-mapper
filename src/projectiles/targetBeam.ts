import {
  AddEquation,
  CustomBlending,
  Group,
  NormalBlending,
  OneFactor,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type BufferAttribute,
  type Texture,
} from "three";
import {
  renderShapeRaycast,
  type BeamRayHit,
} from "../collision/renderShapeRaycast";
import {
  isFirstPersonMuzzleSource,
  muzzleWorldPosition,
  sourceAimDirection,
} from "../engine/weaponMuzzle";
import { torqueVecToThree } from "../scene/coordinates";
import type { TargetBeamEntity } from "../state/gameEntityTypes";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import {
  TARGET_BEAM_PLAYER_WARP_SEC,
  targetBeamWarpProgress,
} from "../stream/streamHelpers";
import {
  disposeGeometry,
  effectMaterial,
  effectMesh,
  ribbonGeometry,
} from "./geometry";
import {
  beamRenderEnd,
  setRibbonUV,
  writeRibbonQuad,
} from "./projectileGeometry";
import { createBeamMuzzleFlare } from "./beamMuzzleFlare";
import type { ProjectileEntityLookup, ProjectileView } from "./types";

const REPLACE_ENDPOINT_DOT = 0.984;
const RECONCILE_ENDPOINT_DOT = 0.996;

const start = new Vector3();
const end = new Vector3();
const renderEnd = new Vector3();
const direction = new Vector3();
const axis = new Vector3();
const scaledAxis = new Vector3();
const offset = new Vector3();
const fromCamera = new Vector3();
const cameraPosition = new Vector3();

/** TargetProjectile::renderObject (Tribes2.exe 0x647de0). The handheld
 * targeting laser and the bomber targeter use the same four passes. */
export function createTargetBeamView(
  visual: TargetBeamEntity["visual"],
  textures: readonly Texture[],
  viewportHeight: () => number,
  findEntity: ProjectileEntityLookup,
): ProjectileView<TargetBeamEntity> {
  const { r, g, b } = visual.color;
  const root = new Group();
  const mainMaterial = effectMaterial(textures[0]);
  mainMaterial.color.setRGB(r, g, b, SRGBColorSpace);
  mainMaterial.blending = NormalBlending;
  const pulseMaterial = effectMaterial(textures[2]);
  pulseMaterial.color.copy(mainMaterial.color);
  pulseMaterial.blending = NormalBlending;
  const main = effectMesh(ribbonGeometry(), mainMaterial);
  const pulse = effectMesh(ribbonGeometry(), pulseMaterial);
  const mainPosition = main.geometry.getAttribute(
    "position",
  ) as BufferAttribute;
  const pulsePosition = pulse.geometry.getAttribute(
    "position",
  ) as BufferAttribute;
  const pulseUV = pulse.geometry.getAttribute("uv") as BufferAttribute;

  const flare = createBeamMuzzleFlare(
    visual,
    textures[1],
    mainMaterial.color,
    viewportHeight,
  );
  const impact = new Sprite(
    new SpriteMaterial({
      map: textures[3],
      color: 0x00ff00,
      transparent: true,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  impact.scale.setScalar(0.6);
  pulse.renderOrder = 1;
  main.renderOrder = 2;
  root.add(...flare.sprites, impact, pulse, main);
  const remoteTarget = new Vector3();
  const remoteFrom = new Vector3();
  const remoteEnd = new Vector3();
  let remoteSample: TargetBeamEntity["targetBeam"];

  return {
    root,
    reset() {
      remoteSample = undefined;
    },
    release() {},
    dispose: () => disposeGeometry(root),
    update(entity, camera) {
      const time = streamClock.worldTime;
      const elapsed = Math.max(0, time - (entity.spawnTime ?? time));
      const { linkSourceId, sourceSlot = 0, targetBeam } = entity;
      const warp = targetBeam?.warp;
      const shooter = linkSourceId
        ? streamRenderFrame.current?.get(linkSourceId)
        : undefined;
      const source =
        shooter?.type === "Player" && (shooter.damageState ?? 0) !== 0
          ? undefined
          : findEntity(linkSourceId)?.mounts?.model;
      if (source) muzzleWorldPosition(linkSourceId, source, sourceSlot, start);
      else torqueVecToThree(entity.beamStart, start);

      camera.getWorldPosition(cameraPosition);
      torqueVecToThree(entity.beamEnd, end);
      const scopedPlayer =
        source && shooter?.type === "Player" ? shooter : undefined;
      // A followed first-person view owns the displayed aim, even when the
      // recording was made by an observer and the ghost is remote.
      const localAim =
        isFirstPersonMuzzleSource(linkSourceId) || targetBeam?.clientOwned;
      const remote = !localAim && scopedPlayer ? targetBeam : undefined;
      if (remote) {
        if (remoteSample !== remote) {
          remoteTarget.copy(end);
          // setClientWarp uses the last rendered endpoint. After a seek
          // only the packet-derived starting point is available.
          if (remoteSample) remoteFrom.copy(remoteEnd);
          else if (warp) torqueVecToThree(warp.from, remoteFrom);
        }
        end.copy(remoteTarget);
      }
      remoteSample = remote;

      let impactHit: BeamRayHit | undefined;
      let useWarp = true;
      if (source && linkSourceId && (localAim || scopedPlayer)) {
        sourceAimDirection(
          linkSourceId,
          source,
          localAim ? sourceSlot : 0,
          start,
          camera,
          direction,
        );
        const agreement = localAim
          ? -1
          : offset.subVectors(end, start).normalize().dot(direction);
        // TargetProjectile::advanceTime (0x648f90) casts against the
        // rendered muzzle when a remote player's network point falls behind.
        if (agreement < RECONCILE_ENDPOINT_DOT) {
          end.copy(start).addScaledVector(direction, visual.range);
          const hit = renderShapeRaycast.targetBeamHit(
            start,
            end,
            linkSourceId,
          );
          if (hit) end.lerp(start, 1 - hit.t);
          useWarp = agreement >= REPLACE_ENDPOINT_DOT;
          if (!useWarp) impactHit = hit;
          else if (remote) remoteTarget.copy(end);
        }
      }
      if (useWarp && warp) {
        const from = remote ? remoteFrom : torqueVecToThree(warp.from, offset);
        const t = targetBeamWarpProgress(
          warp.startedAtSec,
          time,
          scopedPlayer ? TARGET_BEAM_PLAYER_WARP_SEC : warp.durationSec,
        );
        end.lerp(from, 1 - t);
      }
      if (remote) remoteEnd.copy(end);
      direction.subVectors(end, start);
      const length = direction.length();
      root.visible = length > 1e-6;
      if (!root.visible) return;
      direction.multiplyScalar(1 / length);

      fromCamera.subVectors(start, cameraPosition).normalize();
      flare.update(camera, start, direction, linkSourceId, elapsed);

      impact.position.copy(end);
      const { cameraMode, followEntityId } = streamPlaybackStore.getState();
      const thirdPerson =
        (cameraMode === "orbitOverride" && followEntityId === linkSourceId) ||
        (cameraMode === "original" &&
          streamRenderFrame.camera?.mode === "third-person");
      const includeSource = targetBeam?.clientOwned && thirdPerson;
      impact.visible = renderShapeRaycast.targetBeamFlareVisible(
        cameraPosition,
        start,
        end,
        direction,
        includeSource ? undefined : linkSourceId,
        includeSource ? undefined : impactHit,
      );

      axis.crossVectors(fromCamera, direction);
      if (axis.lengthSq() === 0) axis.set(0, 1, 0);
      else axis.normalize();
      main.visible = pulse.visible = beamRenderEnd(
        renderEnd,
        start,
        end,
        direction,
        fromCamera,
        length,
      );
      if (!main.visible) return;

      writeRibbonQuad(
        mainPosition,
        start,
        renderEnd,
        scaledAxis.copy(axis).multiplyScalar(visual.width / 2),
      );
      writeRibbonQuad(
        pulsePosition,
        start,
        renderEnd,
        scaledAxis.copy(axis).multiplyScalar(visual.pulseWidth / 2),
      );
      const u = -elapsed * visual.pulseSpeed;
      setRibbonUV(pulseUV, u, u + length * visual.pulseLength);
    },
  };
}
