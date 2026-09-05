import { Quaternion, Vector3 } from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { encodeViewHash, parseViewHash } from "./viewHash";

/**
 * A moment in a demo that a link can point at: the second the viewer
 * is on, and the camera they are watching it through.
 *
 * The second is `?t=<sec>` beside `?demo=`. The camera is the URL hash,
 * the way the coordinates link carries its view, with a letter saying
 * which camera and so what follows:
 *
 *   #c<x>,<y>,<z>~<qx>,<qy>,<qz>,<qw>   free-fly — the coordinates hash
 *   #f<targetId>~<yaw>,<pitch>,<dist>   following a player, orbit
 *   #p<targetId>~<yaw>,<pitch>,<dist>   following a player, first person
 *   #g<slot>~<yaw>,<pitch>,<dist>       following a flag
 *   (no hash)                           the recorded view
 */
export type DemoMomentCamera =
  | { kind: "original" }
  | { kind: "fly"; position: Vector3; quaternion: Quaternion | null }
  | {
      kind: "follow" | "fp";
      targetId: number;
      yaw: number;
      pitch: number;
      distance: number;
    }
  | {
      kind: "flag";
      slot: number;
      yaw: number;
      pitch: number;
      distance: number;
    };

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
  const t = Math.max(0, Math.floor(moment.timeSec));
  const cam = moment.camera;
  switch (cam.kind) {
    case "original":
      return { t, hash: "" };
    case "fly":
      return {
        t,
        hash: encodeViewHash({
          position: cam.position,
          quaternion: cam.quaternion ?? new Quaternion(),
        }),
      };
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
  }
}

function orbitString(o: { yaw: number; pitch: number; distance: number }) {
  return `${round(o.yaw, 3)},${round(o.pitch, 3)},${round(o.distance, 1)}`;
}

/**
 * Null when there is no second to seek to. A hash that does not parse
 * leaves the camera as recorded, so a bad link still lands on the time.
 */
export function parseDemoMoment(
  t: number | null,
  hash: string,
): DemoMoment | null {
  if (t == null || !Number.isFinite(t) || t < 0) return null;
  const timeSec = Math.floor(t);
  return { timeSec, camera: parseCameraHash(hash) };
}

export function parseCameraHash(hash: string): DemoMomentCamera {
  if (hash.startsWith("#c")) {
    const view = parseViewHash(hash);
    return view
      ? { kind: "fly", position: view.position, quaternion: view.quaternion }
      : { kind: "original" };
  }
  const kind = (
    Object.entries(FOLLOW_PREFIX) as [keyof typeof FOLLOW_PREFIX, string][]
  ).find(([, prefix]) => hash.startsWith(prefix))?.[0];
  if (!kind) return { kind: "original" };
  const [idString, orbitString] = hash.slice(2).split("~");
  const id = parseInt(idString, 10);
  if (!Number.isFinite(id)) return { kind: "original" };
  const o = (orbitString ?? "").split(",").map((s) => parseFloat(s));
  const orbit =
    o.length === 3 && o.every(Number.isFinite)
      ? { yaw: o[0], pitch: o[1], distance: o[2] }
      : { yaw: 0, pitch: 0, distance: NaN };
  return kind === "flag"
    ? { kind, slot: id, ...orbit }
    : { kind, targetId: id, ...orbit };
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
  if (sp.cameraMode === "freeFly") {
    const camera = cameraRegistry.perspective;
    if (!camera) return null;
    return {
      timeSec,
      camera: {
        kind: "fly",
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
      },
    };
  }
  return { timeSec, camera: { kind: "original" } };
}
