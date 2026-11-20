import type { ClipSample } from "../../relay/clipTypes";
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
export function shouldUseClipFollowEye(
  sample: Pick<ClipSample, "cameraMode" | "firstPersonPose">,
  eyeFollowId: string | undefined,
  followEntityId: string | null,
): boolean {
  // The stream's original observer camera can supply an orbit target when
  // the clip's player is absent. That target does not own the clip eye.
  return (
    sample.cameraMode === "firstPersonOverride" &&
    sample.firstPersonPose !== false &&
    eyeFollowId !== undefined &&
    eyeFollowId === followEntityId
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
