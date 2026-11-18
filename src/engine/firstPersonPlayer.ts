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
const clipForward = new Vector3();

/** Recover the recorded view angles without a second fit of the demo. */
export function readClipViewAngles(
  quaternion: readonly [number, number, number, number],
  out: PlayerViewAngles,
): void {
  clipForward.set(0, 0, -1).applyQuaternion(clipRotation.fromArray(quaternion));
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

/** A recorded control view uses the control object. Free spectator follow
 * resolves a mounted player's view to the carrier instead. */
export function firstPersonPlayerId(
  entities: ReadonlyMap<string, StreamEntity>,
  camera: StreamCamera | null,
  mode: DemoCameraMode,
  firstPersonFollowId: string | undefined,
): string | null {
  const id =
    mode === "firstPersonOverride"
      ? firstPersonFollowId
      : mode === "original" && camera?.mode === "first-person"
        ? camera.controlEntityId
        : undefined;
  const player = id === undefined ? undefined : entities.get(id);
  if (player?.type !== "Player") return null;
  if (
    mode === "firstPersonOverride" &&
    player.mountObjectId &&
    entities.has(player.mountObjectId)
  )
    return null;
  return player.id;
}
