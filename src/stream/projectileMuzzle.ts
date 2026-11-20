import { Matrix4, Vector3, type AnimationAction } from "three";
import {
  getProjectileShapeData,
  type ProjectileShapePoses,
} from "../collision/projectileShapeAssets";
import { buildDTSAnimations } from "../dts/dtsAnimation";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { DTSShape } from "../dts/dtsModel";
import { getDTSImageMountTransform } from "../dts/dtsMount";
import { getDTSNodeLookup } from "../dts/dtsNodeLookup";
import { readDtsSequences } from "../dts/dtsSequences";
import { holdDtsAction } from "../dts/dtsThread";
import type { DTSShapeData } from "../dts/dtsTypes";
import { turretThreadPositions } from "../engine/turretAim";
import { threeToTorque } from "../scene/coordinates";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { ANIM_TRANSITION_TIME, samplePlayerPose } from "./playerAnimation";
import {
  buildActionAnimMap,
  getPlayerAnimationActions,
} from "./playerActionMap";
import { getPlayerHeadAngles, playerLookPitchPosition } from "./playerView";
import { imageThreadPosition } from "./imageAnimation";
import { MAX_LOOK_ANGLE } from "./quantizedPlayerAim";
import { shapeThreadTime } from "./shapeThreads";
import { shapeKey } from "./shapeSequences";
import { MAX_PITCH } from "./streamHelpers";
import type { ImageSlot, StreamEntity } from "./types";

/** Image and control aim recorded when the launch's ghost was applied. */
export type ProjectileMuzzleFrame = Pick<StreamEntity, "turretAim"> & {
  image?: ImageSlot;
};

type Shooter = Parameters<ProjectileShapePoses["get"]>[0] &
  Pick<
    StreamEntity,
    | "className"
    | "imageSlots"
    | "threads"
    | "turretAim"
    | "actionSlot"
    | "armAction"
    | "clientAnimation"
    | "playerDelta"
    | "viewQuantized"
    | "headPitch"
    | "headYaw"
    | "damageState"
  >;

class ShapePose {
  readonly shape = new DTSShape();
  readonly mixer: DTSAnimationMixer;
  readonly actions = new Map<string | number, AnimationAction>();
  readonly cyclic: ReadonlySet<string>;
  private readonly clips: ReturnType<typeof buildDTSAnimations>;
  private readonly playerActionMaps = new WeakMap<
    readonly string[],
    Map<string | number, AnimationAction>
  >();

  constructor(data: DTSShapeData) {
    this.shape.data = data;
    const clips = (this.clips = buildDTSAnimations(data));
    if (clips.length) this.shape.prepareAnimationTargets();
    this.mixer = new DTSAnimationMixer(this.shape);
    const sequences = readDtsSequences(this.shape, clips);
    this.cyclic = sequences.cyclic;
    const names = new Map(clips.map((clip) => [clip.name.toLowerCase(), clip]));
    sequences.names.forEach((name, index) => {
      const clip = names.get(name);
      if (!clip) return;
      const action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
      this.actions.set(index, action);
    });
  }

  hold(
    action: AnimationAction | undefined,
    position: number,
    weight = 1,
  ): void {
    if (!action) return;
    holdDtsAction(action, position);
    action.setEffectiveWeight(weight);
  }

  playerActions(shapeName: string, sequences: readonly string[]) {
    let actions = this.playerActionMaps.get(sequences);
    if (!actions) {
      const prefix = shapeKey(shapeName).replace(/\.dts$/, "_");
      actions = getPlayerAnimationActions(
        this.clips,
        this.mixer,
        buildActionAnimMap(sequences, prefix, this.clips),
      );
      this.playerActionMaps.set(sequences, actions);
    }
    return actions;
  }

  isCyclic(action: AnimationAction): boolean {
    return this.cyclic.has(action.getClip().name.toLowerCase());
  }

  nodeMatrix(index: number): Matrix4 {
    this.mixer.update(0);
    const node = this.shape.getNode(index) ?? this.shape;
    node.updateWorldMatrix(true, false);
    return node.matrixWorld;
  }
}

const bodyPoses = new WeakMap<DTSShapeData, ShapePose>();
const imagePoses = new WeakMap<DTSShapeData, ShapePose>();
const modelRotation = new Matrix4().makeRotationY(SHAPE_MODEL_ROTATION_Y);
const muzzleMatrix = new Matrix4();
const muzzle = new Vector3();
const headAngles = { pitch: 0, yaw: 0 };
const noSequences: readonly string[] = [];

function samplePose(
  cache: WeakMap<DTSShapeData, ShapePose>,
  data: DTSShapeData,
) {
  let pose = cache.get(data);
  if (!pose) cache.set(data, (pose = new ShapePose(data)));
  pose.mixer.stopAllAction();
  return pose;
}

/** The fixed-tick counterpart of ShapeBase::getMuzzlePoint (0x5f7380).
 * It samples the recorded shape threads on CPU, including the player's arm
 * aim and turret pose. The sample is independent of camera and asset views. */
export function projectileMuzzlePosition(
  source: Shooter,
  slot: number,
  poses: ProjectileShapePoses,
  timeSec: number,
  maxLookAngle = MAX_LOOK_ANGLE,
  constructorSequences: readonly string[] = noSequences,
  launch?: ProjectileMuzzleFrame,
): [number, number, number] | undefined {
  const image = launch ? launch.image : source.imageSlots?.[slot];
  if (!image) return;
  const bodyName = source.shapeHint ?? source.dataBlock;
  if (!bodyName) return;
  const body = getProjectileShapeData(bodyName);
  const weapon = getProjectileShapeData(image.shapeName);
  if (!body || !weapon) return;
  const world = poses.get(source);
  if (!world) return;

  const pose = samplePose(bodyPoses, body);
  for (const thread of source.threads ?? []) {
    const action = pose.actions.get(thread.sequence);
    const duration = action?.getClip().duration;
    if (!action || !duration) continue;
    pose.hold(
      action,
      shapeThreadTime(thread, timeSec, duration, pose.isCyclic(action)) /
        duration,
    );
  }
  const turretAim = launch ? launch.turretAim : source.turretAim;
  if (turretAim) {
    const { activate, elevate, turn } = turretThreadPositions(turretAim);
    if (activate != null) pose.hold(pose.actions.get("activate"), activate);
    if (elevate != null) pose.hold(pose.actions.get("elevate"), elevate);
    if (turn != null) pose.hold(pose.actions.get("turn"), turn);
  }
  if (source.type === "Player") {
    const actions = pose.playerActions(bodyName, constructorSequences);
    const getAction = (name: string | number) =>
      actions.get(name) ??
      (typeof name === "string" ? pose.actions.get(name) : undefined);
    const move = source.clientAnimation?.move;
    if (move) {
      for (const body of samplePlayerPose(
        move,
        source,
        timeSec,
        ANIM_TRANSITION_TIME,
        (name) => name,
        (name) => {
          const action = getAction(name);
          return (
            action && {
              duration: action.getClip().duration,
              cyclic: pose.isCyclic(action),
            }
          );
        },
      ))
        pose.hold(getAction(body.name), body.position, body.weight);
    }
    if (!source.damageState) {
      const look = getPlayerHeadAngles(source, 1, headAngles);
      const pitchScale =
        source.playerDelta?.maxLookAngle ??
        (source.viewQuantized === false ? MAX_PITCH : maxLookAngle);
      const pitch = playerLookPitchPosition(look.pitch * pitchScale);
      const arm = source.armAction ?? "look";
      pose.hold(getAction(arm) ?? getAction("look"), pitch);
      pose.hold(getAction("head"), pitch);
      pose.hold(getAction("headside"), (look.yaw + 1) / 2);
    }
  }
  const mount = getDTSNodeLookup(body).mounts[image.mountPoint] ?? -1;
  muzzleMatrix
    .copy(world)
    .multiply(modelRotation)
    .multiply(pose.nodeMatrix(mount));

  const imagePose = samplePose(imagePoses, weapon);
  const thread = image.animation?.anim;
  const action = thread && imagePose.actions.get(thread.sequence);
  if (thread && action) {
    const scale =
      thread.scaleSequence == null
        ? undefined
        : imagePose.actions.get(thread.scaleSequence);
    imagePose.hold(
      action,
      imageThreadPosition(
        thread,
        timeSec,
        action.getClip().duration,
        imagePose.isCyclic(action),
        scale?.getClip().duration,
      ),
    );
  }
  const muzzleNode = getDTSNodeLookup(weapon).names.get("muzzlepoint") ?? -1;
  return threeToTorque(
    muzzle.setFromMatrixPosition(
      muzzleMatrix
        .multiply(getDTSImageMountTransform(weapon, image.mountOffset))
        .multiply(imagePose.nodeMatrix(muzzleNode)),
    ),
  );
}
