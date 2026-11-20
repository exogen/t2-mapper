import { Matrix4, Vector3, type AnimationAction } from "three";
import {
  getProjectileShapeData,
  type ProjectileShapePoses,
} from "../collision/projectileShapeAssets";
import { castWaterRay } from "../collision/waterLevel";
import { castWorldRay, type Vec3 } from "../collision/worldCollision";
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
import {
  ANIM_TRANSITION_TIME,
  samplePlayerPose,
  usesPlayerBodyMuzzleAim,
} from "./playerAnimation";
import {
  buildActionAnimMap,
  getPlayerAnimationActions,
} from "./playerActionMap";
import { getPlayerHeadAngles, playerLookPitchPosition } from "./playerView";
import { createPlayerRecoil } from "./playerRecoil";
import { imageThreadPosition } from "./imageAnimation";
import { MAX_LOOK_ANGLE } from "./quantizedPlayerAim";
import { shapeThreadTime } from "./shapeThreads";
import { shapeKey } from "./shapeSequences";
import { MAX_PITCH } from "./streamHelpers";
import type { ImageSlot, StreamEntity } from "./types";

/** Image and control aim recorded when the launch's ghost was applied. */
export type ProjectileMuzzleFrame = Pick<
  StreamEntity,
  "turretAim" | "recoilStartedAtSec"
> & { image?: ImageSlot };

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
    | "recoilStartedAtSec"
  >;

class ShapePose {
  readonly shape = new DTSShape();
  readonly mixer: DTSAnimationMixer;
  readonly actions = new Map<string | number, AnimationAction>();
  readonly cyclic: ReadonlySet<string>;
  private readonly clips: ReturnType<typeof buildDTSAnimations>;
  private readonly playerActionMaps = new WeakMap<
    readonly string[],
    {
      actions: Map<string | number, AnimationAction>;
      recoil: ReturnType<typeof createPlayerRecoil>;
    }
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
    let player = this.playerActionMaps.get(sequences);
    if (!player) {
      const prefix = shapeKey(shapeName).replace(/\.dts$/, "_");
      const actions = getPlayerAnimationActions(
        this.clips,
        this.mixer,
        buildActionAnimMap(sequences, prefix, this.clips),
      );
      player = {
        actions,
        recoil: createPlayerRecoil(
          (name) => actions.get(name) ?? this.actions.get(name),
          (action) => this.isCyclic(action),
        ),
      };
      this.playerActionMaps.set(sequences, player);
    }
    return player;
  }

  isCyclic(action: AnimationAction): boolean {
    return this.cyclic.has(action.getClip().name.toLowerCase());
  }

  nodeMatrix(index: number): Matrix4 {
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
  directionOut?: [number, number, number],
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
  let bodyAimPitch: number | undefined;
  if (source.type === "Player") {
    const { actions, recoil } = pose.playerActions(
      bodyName,
      constructorSequences,
    );
    const getAction = (name: string | number) =>
      actions.get(name) ??
      (typeof name === "string" ? pose.actions.get(name) : undefined);
    const move = source.clientAnimation?.move;
    let currentAction = source.actionSlot?.action;
    if (move) {
      const bodyPoses = samplePlayerPose(
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
      );
      currentAction = bodyPoses[0]?.name;
      for (const body of bodyPoses)
        pose.hold(getAction(body.name), body.position, body.weight);
    }
    if (!source.damageState || directionOut) {
      const look = getPlayerHeadAngles(source, 1, headAngles);
      const pitchScale =
        source.playerDelta?.maxLookAngle ??
        (source.viewQuantized === false ? MAX_PITCH : maxLookAngle);
      const pitch = look.pitch * pitchScale;
      if (directionOut && usesPlayerBodyMuzzleAim(currentAction))
        bodyAimPitch = pitch;
      if (!source.damageState) {
        const position = playerLookPitchPosition(pitch);
        const arm = source.armAction ?? "look";
        pose.hold(getAction(arm) ?? getAction("look"), position);
        pose.hold(getAction("head"), position);
        pose.hold(getAction("headside"), (look.yaw + 1) / 2);
      }
    }
    recoil?.(
      timeSec,
      launch ? launch.recoilStartedAtSec : source.recoilStartedAtSec,
    );
  }
  const mount = getDTSNodeLookup(body).mounts[image.mountPoint] ?? -1;
  pose.mixer.update(0);
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
  imagePose.mixer.update(0);
  const nodes = getDTSNodeLookup(weapon).names;
  const muzzleNode = nodes.get("muzzlepoint") ?? -1;
  muzzleMatrix.multiply(getDTSImageMountTransform(weapon, image.mountOffset));
  let node = muzzleNode;
  let contact: Vec3 | undefined;
  if (source.type === "Player" && !source.damageState) {
    // Player::getMuzzleTransform casts from the raw image transform toward
    // its retraction node, using the hit for the initial projectile warp.
    const retractionNode = nodes.get("retractionpoint") ?? muzzleNode;
    if (retractionNode >= 0) {
      const from = threeToTorque(muzzle.setFromMatrixPosition(muzzleMatrix));
      const to = threeToTorque(
        muzzle
          .setFromMatrixPosition(imagePose.nodeMatrix(retractionNode))
          .applyMatrix4(muzzleMatrix),
      );
      if (from.some((value, axis) => value !== to[axis])) {
        const solid = castWorldRay(from, to, { includeStatics: true });
        const water = castWaterRay(from, to);
        const hit = water && (!solid || water.t < solid.t) ? water : solid;
        if (hit) {
          contact = hit.point;
          node = retractionNode;
        }
      }
    }
  }
  if (!contact || (directionOut && bodyAimPitch === undefined))
    muzzleMatrix.multiply(imagePose.nodeMatrix(node));
  if (directionOut) {
    const direction = threeToTorque(
      bodyAimPitch === undefined
        ? muzzle.set(0, 0, 1).transformDirection(muzzleMatrix)
        : muzzle
            .set(Math.cos(bodyAimPitch), -Math.sin(bodyAimPitch), 0)
            .transformDirection(world),
    );
    [directionOut[0], directionOut[1], directionOut[2]] = direction;
  }
  return contact ?? threeToTorque(muzzle.setFromMatrixPosition(muzzleMatrix));
}
