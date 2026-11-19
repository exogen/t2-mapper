import { Quaternion, Vector3 } from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  isTrackableProjectile,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { streamTimeToTick } from "../stream/streamHelpers";
import type { StreamEntity } from "../stream/types";
import { encodeViewHash, parseViewHash } from "../viewHash";

type FlyMomentCamera = {
  kind: "fly";
  position: Vector3;
  quaternion: Quaternion | null;
};

type MomentOrbit = { yaw: number; pitch: number; distance: number };

type ProjectileMomentIdentity = { ghostIndex: number; spawnTick: number };

/**
 * A moment in a demo that a link can point at: the time the viewer
 * is on, and the camera they are watching it through.
 *
 * The time is `?t=<sec>` beside `?demo=`. The camera is the URL hash,
 * the way the coordinates link carries its view, with a letter saying
 * which camera and so what follows:
 *
 *   #c<x>,<y>,<z>~<qx>,<qy>,<qz>,<qw>   free-fly — the coordinates hash
 *   #f<targetId>~<yaw>,<pitch>,<dist>   following a player, orbit
 *   #p<targetId>~<yaw>,<pitch>,<dist>   following a player, first person
 *   #g<slot>~<yaw>,<pitch>,<dist>       following a flag
 *   #s<ghostIndex>,<spawnTick>~<orbit>!<view> following a projectile
 *   (no hash)                           the recorded view
 */
export type DemoMomentCamera =
  | { kind: "original" }
  | FlyMomentCamera
  | (MomentOrbit & { kind: "follow" | "fp"; targetId: number })
  | (MomentOrbit & { kind: "flag"; slot: number })
  | (MomentOrbit &
      ProjectileMomentIdentity & {
        kind: "projectile";
        fallback: FlyMomentCamera;
      });

export interface DemoMoment {
  timeSec: number;
  camera: DemoMomentCamera;
}

const FOLLOW_PREFIX: Record<"follow" | "fp" | "flag", string> = {
  follow: "#f",
  fp: "#p",
  flag: "#g",
};

const round = (n: number, places: number) => parseFloat(n.toFixed(places));

/** The `t` value and the hash a link carries for this moment. */
export function encodeDemoMoment(moment: DemoMoment): {
  t: number;
  hash: string;
} {
  const cam = moment.camera;
  const t = Math.max(
    0,
    cam.kind === "projectile" ? moment.timeSec : Math.floor(moment.timeSec),
  );
  switch (cam.kind) {
    case "original":
      return { t, hash: "" };
    case "fly":
      return { t, hash: encodeFlyCamera(cam) };
    case "follow":
    case "fp":
      return {
        t,
        hash: `${FOLLOW_PREFIX[cam.kind]}${cam.targetId}~${orbitString(cam)}`,
      };
    case "flag":
      return {
        t,
        hash: `${FOLLOW_PREFIX.flag}${cam.slot}~${orbitString(cam)}`,
      };
    case "projectile":
      return {
        t,
        hash: `#s${cam.ghostIndex},${cam.spawnTick}~${orbitString(cam)}!${encodeFlyCamera(cam.fallback).slice(2)}`,
      };
  }
}

function encodeFlyCamera({ position, quaternion }: FlyMomentCamera): string {
  return encodeViewHash({
    position,
    quaternion: quaternion ?? new Quaternion(),
  });
}

function orbitString(o: MomentOrbit) {
  return `${round(o.yaw, 3)},${round(o.pitch, 3)},${round(o.distance, 1)}`;
}

function parseOrbit(serialized: string | undefined): MomentOrbit | undefined {
  const angles = serialized?.split(",").map((value) => parseFloat(value));
  if (angles?.length === 3 && angles.every(Number.isFinite))
    return { yaw: angles[0], pitch: angles[1], distance: angles[2] };
}

/**
 * Missing times are ignored. Malformed camera hashes leave the camera as
 * recorded so a bad link can still land at the requested time.
 */
export function parseDemoMoment(
  t: number | null,
  hash: string,
): DemoMoment | null {
  if (t == null || !Number.isFinite(t) || t < 0) return null;
  const camera = parseCameraHash(hash);
  return { timeSec: camera.kind === "projectile" ? t : Math.floor(t), camera };
}

export function parseCameraHash(hash: string): DemoMomentCamera {
  if (hash.startsWith("#c")) {
    const view = parseViewHash(hash);
    return view
      ? { kind: "fly", position: view.position, quaternion: view.quaternion }
      : { kind: "original" };
  }
  if (hash.startsWith("#s")) {
    const [follow, view] = hash.slice(2).split("!");
    const [identity, orbitSegment] = follow.split("~");
    const match = /^(\d+),(\d+)$/.exec(identity);
    const ghostIndex = Number(match?.[1]);
    const spawnTick = Number(match?.[2]);
    const orbit = parseOrbit(orbitSegment);
    const fallback = view && parseViewHash(`#c${view}`);
    if (
      Number.isSafeInteger(ghostIndex) &&
      Number.isSafeInteger(spawnTick) &&
      orbit &&
      orbit.distance > 0 &&
      fallback
    ) {
      return {
        kind: "projectile",
        ghostIndex,
        spawnTick,
        ...orbit,
        fallback: {
          kind: "fly",
          position: fallback.position,
          quaternion: fallback.quaternion,
        },
      };
    }
    return { kind: "original" };
  }
  const kind = (
    Object.entries(FOLLOW_PREFIX) as [keyof typeof FOLLOW_PREFIX, string][]
  ).find(([, prefix]) => hash.startsWith(prefix))?.[0];
  if (!kind) return { kind: "original" };
  const [idString, orbitSegment] = hash.slice(2).split("~");
  const id = parseInt(idString, 10);
  if (!Number.isFinite(id)) return { kind: "original" };
  const orbit = parseOrbit(orbitSegment) ?? { yaw: 0, pitch: 0, distance: NaN };
  return kind === "flag"
    ? { kind, slot: id, ...orbit }
    : { kind, targetId: id, ...orbit };
}

function projectileMomentIdentity(
  entity: StreamEntity | undefined,
): ProjectileMomentIdentity | undefined {
  if (
    !isTrackableProjectile(entity) ||
    entity.ghostIndex == null ||
    !Number.isSafeInteger(entity.ghostIndex) ||
    entity.ghostIndex < 0 ||
    entity.spawnTimeSec == null
  )
    return undefined;
  const spawnTick = streamTimeToTick(entity.spawnTimeSec);
  if (Number.isSafeInteger(spawnTick) && spawnTick >= 0)
    return { ghostIndex: entity.ghostIndex, spawnTick };
}

/** Find a recorded flight using its ghost slot and lifetime after a seek. */
export function findDemoMomentProjectile({
  ghostIndex,
  spawnTick,
}: ProjectileMomentIdentity): StreamEntity | undefined {
  const entities = streamRenderFrame.current;
  if (!entities) return undefined;
  for (const entity of entities.values()) {
    if (
      entity.ghostIndex === ghostIndex &&
      projectileMomentIdentity(entity)?.spawnTick === spawnTick
    )
      return entity;
  }
}

/** The moment the viewer is on right now, camera included. */
export function captureDemoMoment(): DemoMoment | null {
  const sp = streamPlaybackStore.getState();
  const timeSec = Math.floor(streamClock.time);
  const orbit = {
    yaw: sp.orbitOverrideYaw,
    pitch: sp.orbitOverridePitch,
    distance: sp.orbitOverrideDistance,
  };
  const following =
    sp.followEntityId != null &&
    (sp.cameraMode === "orbitOverride" ||
      sp.cameraMode === "firstPersonOverride");
  if (following && sp.followFlagSlot != null) {
    return {
      timeSec,
      camera: { kind: "flag", slot: sp.followFlagSlot, ...orbit },
    };
  }
  if (following && sp.followTargetId != null) {
    return {
      timeSec,
      camera: {
        kind: sp.cameraMode === "firstPersonOverride" ? "fp" : "follow",
        targetId: sp.followTargetId,
        ...orbit,
      },
    };
  }
  const tracking =
    sp.projectileFollow?.kind === "tracking" ? sp.projectileFollow : null;
  if (sp.cameraMode === "freeFly" || tracking) {
    const camera = cameraRegistry.perspective;
    if (!camera) return null;
    const fly: FlyMomentCamera = {
      kind: "fly",
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
    const identity =
      tracking &&
      projectileMomentIdentity(
        streamRenderFrame.current?.get(tracking.projectileId),
      );
    if (identity)
      return {
        timeSec: streamClock.time,
        camera: { kind: "projectile", ...identity, ...orbit, fallback: fly },
      };
    return { timeSec, camera: fly };
  }
  return { timeSec, camera: { kind: "original" } };
}
