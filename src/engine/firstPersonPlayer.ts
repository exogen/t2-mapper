import { Quaternion, Vector3 } from "three";
import type { PlayerViewAngles } from "../stream/playerView";
import { getDTSNodeLookup } from "../dts/dtsNodeLookup";
import type { DTSShapeData } from "../dts/dtsTypes";
import type { DemoCameraMode } from "../state/streamPlaybackStore";
import type { StreamCamera, StreamEntity } from "../stream/types";

const FIRST_PERSON_SPINE = [
  "bip01 pelvis",
  "bip01 spine",
  "bip01 spine1",
  "bip01 spine2",
  "bip01 neck",
  "bip01 head",
] as const;
const clipRotation = new Quaternion();
const worldToMount = new Quaternion();
const clipForward = new Vector3();

/** Recover the recorded view angles without a second fit of the demo. */
export function readClipViewAngles(
  quaternion: readonly [number, number, number, number],
  out: PlayerViewAngles,
  mountRotation?: Quaternion,
): void {
  clipRotation.fromArray(quaternion);
  if (mountRotation)
    clipRotation.premultiply(worldToMount.copy(mountRotation).invert());
  clipForward.set(0, 0, -1).applyQuaternion(clipRotation);
  out.yaw = Math.atan2(clipForward.z, clipForward.x);
  out.pitch = Math.atan2(
    -clipForward.y,
    Math.hypot(clipForward.x, clipForward.z),
  );
}

/** PlayerData::preload's six nodes, skipping any absent from this armor. */
export function firstPersonSpineNodes(shape: DTSShapeData): number[] {
  const { names } = getDTSNodeLookup(shape);
  return FIRST_PERSON_SPINE.flatMap((name) => {
    const index = names.get(name);
    return index === undefined ? [] : [index];
  });
}

/** Identify the player whose eye owns the view, if the camera uses one. */
export function firstPersonPlayerId(
  entities: ReadonlyMap<string, StreamEntity>,
  camera: StreamCamera | null,
  mode: DemoCameraMode,
  followEyeId: string | undefined,
  controlAtEye = camera?.mode === "first-person",
  controlEntityId = camera?.controlEntityId,
): string | null {
  const id =
    mode === "firstPersonOverride"
      ? followEyeId
      : mode === "original" && controlAtEye
        ? controlEntityId
        : undefined;
  const player = id === undefined ? undefined : entities.get(id);
  if (player?.type !== "Player" || player.damageState) return null;
  return player.id;
}
