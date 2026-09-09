import {
  AdditiveAnimationBlendMode,
  BooleanKeyframeTrack,
  InterpolateDiscrete,
  MathUtils,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type KeyframeTrack,
  AnimationClip,
  type AnimationMixer,
} from "three";
import { dtsQuaternion, dtsVector } from "./dtsGeometry";
import { DTSAnimationClip } from "./dtsModel";
import { DTSVisibilityTrack } from "./dtsVisibility";
import {
  DTSSequenceFlags,
  type DTSSequence,
  type DTSShapeData,
} from "./dtsTypes";

export const transformName = (index: number, blend = false) =>
  `__dts_${blend ? "blend" : "transform"}_${index}`;
export const scaleName = (index: number, blend = false) =>
  `__dts_${blend ? "blendScale" : "scale"}_${index}`;
export const objectName = (index: number) => `__dts_object_${index}`;

// Native PropertyBinding object/index paths keep shared clips instance-local.
const targetPath = (name: string) => `.animationTargets[${name}]`;

/** Sample a single-threaded effect on its playback clock. A paused action
 * remains seekable after its end, unlike setTime() on a finished LoopOnce. */
export function sampleDTSSequence(
  mixer: AnimationMixer,
  clip: AnimationClip,
  seconds: number,
  cyclic: boolean,
): void {
  const action = mixer.clipAction(clip).play();
  action.paused = true;
  action.enabled = true;
  action.time =
    clip.duration <= 0
      ? 0
      : cyclic
        ? MathUtils.euclideanModulo(seconds, clip.duration)
        : MathUtils.clamp(seconds, 0, clip.duration);
  mixer.update(0);
}

function timesFor(sequence: DTSSequence): Float32Array {
  const cyclic = !!(sequence.flags & DTSSequenceFlags.Cyclic),
    n = sequence.numKeyframes;
  const count = n + (cyclic && n > 1 ? 1 : 0);
  return Float32Array.from(
    { length: count },
    (_, k) => (sequence.duration * k) / Math.max(cyclic ? n : n - 1, 1),
  );
}

/** One Three clip per DTS sequence, including object/UV/decal state tracks.
 * Blend clips target a separate local transform so translation deltas are
 * rotated by the current base pose, just as TSShapeInstance::handleBlendSequence. */
export function buildDTSAnimations(shape: DTSShapeData): DTSAnimationClip[] {
  return shape.sequences.map((sequence) => {
    const tracks: KeyframeTrack[] = [],
      times = timesFor(sequence),
      n = sequence.numKeyframes;
    const blend = !!(sequence.flags & DTSSequenceFlags.Blend);
    const objectTracks: KeyframeTrack[] = [];
    const addObjectTrack = (track: KeyframeTrack, reference = 0) => {
      objectTracks.push(track);
      // Keep standalone AnimationMixer compatibility. The DTS mixer uses the
      // absolute object clip; only transforms are additive in Torque.
      if (blend && reference !== 0) {
        const delta = track.clone();
        const values = delta.values as Float32Array;
        for (let i = 0; i < values.length; i++) values[i] -= reference;
        tracks.push(delta);
      } else tracks.push(track);
    };
    const sample = (k: number) => (k === n ? 0 : k);
    const nodeMembers = (members: number[]) =>
      members.filter((i) => i < shape.nodes.length);
    for (const [rank, node] of nodeMembers(
      sequence.rotationMatters,
    ).entries()) {
      const values = new Float32Array(times.length * 4);
      for (let k = 0; k < times.length; k++)
        dtsQuaternion(
          shape.rotations,
          (sequence.baseRotation + rank * n + sample(k)) * 4,
        ).toArray(values, k * 4);
      tracks.push(
        new QuaternionKeyframeTrack(
          `${targetPath(transformName(node, blend))}.quaternion`,
          times,
          values,
        ),
      );
    }
    for (const [rank, node] of nodeMembers(
      sequence.translationMatters,
    ).entries()) {
      const values = new Float32Array(times.length * 3);
      for (let k = 0; k < times.length; k++)
        dtsVector(
          shape.translations,
          (sequence.baseTranslation + rank * n + sample(k)) * 3,
        ).toArray(values, k * 3);
      tracks.push(
        new VectorKeyframeTrack(
          `${targetPath(transformName(node, blend))}.position`,
          times,
          values,
        ),
      );
    }
    for (const [rank, node] of nodeMembers(sequence.scaleMatters).entries()) {
      const values = new Float32Array(times.length * 3),
        rotations = new Float32Array(times.length * 4),
        inverses = new Float32Array(times.length * 4);
      for (let k = 0; k < times.length; k++) {
        const index = sequence.baseScale + rank * n + sample(k);
        if (sequence.flags & DTSSequenceFlags.UniformScale)
          values.fill(
            shape.uniformScales[index] - (blend ? 1 : 0),
            k * 3,
            k * 3 + 3,
          );
        else {
          const source =
            sequence.flags & DTSSequenceFlags.AlignedScale
              ? shape.alignedScales
              : shape.arbitraryScaleFactors;
          values[k * 3] = source[index * 3] - (blend ? 1 : 0);
          values[k * 3 + 1] = source[index * 3 + 2] - (blend ? 1 : 0);
          values[k * 3 + 2] = source[index * 3 + 1] - (blend ? 1 : 0);
        }
        if (sequence.flags & DTSSequenceFlags.ArbitraryScale) {
          const q = dtsQuaternion(shape.arbitraryScaleRotations, index * 4);
          q.toArray(rotations, k * 4);
          q.conjugate().toArray(inverses, k * 4);
        }
      }
      tracks.push(
        new VectorKeyframeTrack(
          `${targetPath(scaleName(node, blend))}.scale`,
          times,
          values,
        ),
      );
      if (sequence.flags & DTSSequenceFlags.ArbitraryScale) {
        tracks.push(
          new QuaternionKeyframeTrack(
            `${targetPath(`${scaleName(node, blend)}_rotation`)}.quaternion`,
            times,
            rotations,
          ),
        );
        tracks.push(
          new QuaternionKeyframeTrack(
            `${targetPath(`${scaleName(node, blend)}_inverse`)}.quaternion`,
            times,
            inverses,
          ),
        );
      }
    }
    const members = [
      ...new Set([
        ...sequence.visibilityMatters,
        ...sequence.frameMatters,
        ...sequence.materialFrameMatters,
      ]),
    ]
      .filter((i) => i < shape.objects.length)
      .sort((a, b) => a - b);
    for (const [rank, object] of members.entries()) {
      const state = (k: number) =>
        shape.objectStates[sequence.baseObjectState + rank * n + sample(k)];
      if (sequence.visibilityMatters.includes(object))
        addObjectTrack(
          new DTSVisibilityTrack(
            `${targetPath(objectName(object))}.opacity`,
            times,
            Float32Array.from(times, (_, k) => state(k).visibility),
          ),
          shape.objectStates[object].visibility,
        );
      // Torque changes frame and matFrame at the keyframe midpoint.
      const stepTimes: number[] = [0],
        stepFrames: number[] = [state(0).frame],
        stepMaterialFrames: number[] = [state(0).materialFrame];
      for (let k = 1; k < times.length; k++) {
        stepTimes.push((times[k - 1] + times[k]) / 2);
        stepFrames.push(state(k).frame);
        stepMaterialFrames.push(state(k).materialFrame);
      }
      if (sequence.frameMatters.includes(object))
        addObjectTrack(
          new NumberKeyframeTrack(
            `${targetPath(objectName(object))}.frame`,
            stepTimes,
            stepFrames,
            InterpolateDiscrete,
          ),
          shape.objectStates[object].frame,
        );
      if (sequence.materialFrameMatters.includes(object))
        addObjectTrack(
          new NumberKeyframeTrack(
            `${targetPath(objectName(object))}.materialFrame`,
            stepTimes,
            stepMaterialFrames,
            InterpolateDiscrete,
          ),
          shape.objectStates[object].materialFrame,
        );
    }
    for (const [rank, decal] of sequence.decalMatters
      .filter((i) => i < shape.decals.length)
      .entries()) {
      const values = Float32Array.from(
        times,
        (_, k) =>
          shape.decalStates[sequence.baseDecalState + rank * n + sample(k)],
      );
      addObjectTrack(
        new NumberKeyframeTrack(
          `.decalFrames[${decal}]`,
          Float32Array.from(times, (t, k) => (k ? (t + times[k - 1]) / 2 : 0)),
          values,
          InterpolateDiscrete,
        ),
        shape.decalStates[decal],
      );
    }
    for (const ifl of sequence.iflMatters.filter(
      (i) => i < shape.iflMaterials.length,
    )) {
      addObjectTrack(
        new NumberKeyframeTrack(
          `.iflTimes[${ifl}]`,
          [0, sequence.duration],
          [sequence.toolBegin, sequence.toolBegin + sequence.duration],
        ),
        -1,
      );
      addObjectTrack(
        new BooleanKeyframeTrack(
          `.iflLoops[${ifl}]`,
          [0],
          [!!(sequence.flags & DTSSequenceFlags.Cyclic)],
        ),
      );
    }
    const clip = new DTSAnimationClip(
      shape.names[sequence.nameIndex],
      sequence.duration,
      tracks,
    );
    if (blend) clip.blendMode = AdditiveAnimationBlendMode;
    clip.sequence = sequence;
    if (objectTracks.length)
      clip.objectAnimation = new AnimationClip(
        clip.name,
        clip.duration,
        objectTracks,
      );
    clip.triggers = shape.triggers.slice(
      sequence.firstTrigger,
      sequence.firstTrigger + sequence.numTriggers,
    );
    if (sequence.numGroundFrames && sequence.groundFramesAvailable !== false) {
      const count = sequence.numGroundFrames;
      // TSThread::getGround uses an implicit identity key at time zero.
      const times = Float32Array.from(
        { length: count + 1 },
        (_, i) => (sequence.duration * i) / count,
      );
      const positions = new Float32Array((count + 1) * 3),
        rotations = new Float32Array((count + 1) * 4);
      rotations[3] = 1;
      for (let i = 0; i < count; i++) {
        dtsVector(
          shape.groundTranslations,
          (sequence.firstGroundFrame + i) * 3,
        ).toArray(positions, (i + 1) * 3);
        dtsQuaternion(
          shape.groundRotations,
          (sequence.firstGroundFrame + i) * 4,
        ).toArray(rotations, (i + 1) * 4);
      }
      clip.groundMotion = new DTSAnimationClip(
        `${clip.name}_ground`,
        sequence.duration,
        [
          new VectorKeyframeTrack(".position", times, positions),
          new QuaternionKeyframeTrack(".quaternion", times, rotations),
        ],
      );
    }
    return clip;
  });
}
