import { Vector3 } from "three";
import {
  DTSShape,
  type DTSAnimationClip,
  type DTSModel,
} from "../dts/dtsModel";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { sampleDTSSequence } from "../dts/dtsAnimation";
import { DTSSequenceFlags } from "../dts/dtsTypes";
import { shapeKey } from "../stream/shapeSequences";
import {
  buildActionAnimMap,
  countEmbeddedNonTableSequences,
} from "../stream/playerActionMap";
import type { StreamingPlayback } from "../stream/types";

export interface WheelGroundData {
  position: [number, number, number];
  spring: [number, number, number];
}
export interface GroundShape {
  model: DTSModel;
  clips: Map<string, DTSAnimationClip>;
  wheels?: WheelGroundData[];
}
const shapes = new Map<string, GroundShape>();
export let groundAssetsVersion = 0;
export function registerGroundEffectShape(name: string, model: DTSModel): void {
  const key = shapeKey(name);
  if (shapes.has(key)) return;
  shapes.set(key, {
    model,
    clips: new Map(model.animations.map((c) => [c.name.toLowerCase(), c])),
  });
  groundAssetsVersion++;
}
export function getGroundEffectShape(name: string): GroundShape | undefined {
  return shapes.get(shapeKey(name));
}

const actionMaps = new WeakMap<
  StreamingPlayback,
  Map<GroundShape, ReturnType<typeof buildActionAnimMap>>
>();
export function clearGroundActionMaps(playback: StreamingPlayback): void {
  actionMaps.delete(playback);
}

export function groundActionName(
  playback: StreamingPlayback,
  shape: GroundShape,
  name: string,
  index: number,
): string | undefined {
  let maps = actionMaps.get(playback);
  if (!maps) actionMaps.set(playback, (maps = new Map()));
  let actions = maps.get(shape);
  if (!actions) {
    const sequences = playback.getShapeConstructorSequences(name) ?? [];
    const prefix = shapeKey(name).replace(/\.dts$/, "_");
    actions = buildActionAnimMap(
      sequences,
      prefix,
      countEmbeddedNonTableSequences(
        shape.model.scene,
        shape.model.animations,
        sequences,
        prefix,
      ),
    );
    // A model can arrive before its TSShapeConstructor datablock.
    if (sequences.length) maps.set(shape, actions);
  }
  return actions.get(index)?.clipName;
}
export function groundClipInfo(shape: GroundShape, name: string) {
  const clip = shape.clips.get(name);
  return clip
    ? {
        duration: clip.duration,
        cyclic: !!((clip.sequence?.flags ?? 0) & DTSSequenceFlags.Cyclic),
      }
    : undefined;
}

/** WheeledVehicleData::preload: groundN at both ends of springN, with the
 * engine's matching-Y mirror rule. Evaluate once, with no render meshes. */
export function groundWheels(shape: GroundShape): readonly WheelGroundData[] {
  if (shape.wheels) return shape.wheels;
  const wheels: WheelGroundData[] = [];
  const root = new DTSShape();
  root.data = shape.model.data;
  root.prepareAnimationTargets();
  const mixer = new DTSAnimationMixer(root);
  const p = new Vector3();
  const read = (node: import("three").Object3D): [number, number, number] => {
    node.updateWorldMatrix(true, false);
    p.setFromMatrixPosition(node.matrixWorld);
    return [-p.x, p.z, p.y];
  };
  for (let i = 0; i < 8; i++) {
    const clip = shape.clips.get(`spring${i}`),
      node = root.getNodeByName(`ground${i}`);
    if (!clip || !node) continue;
    mixer.stopAllAction();
    sampleDTSSequence(mixer, clip, 0, false);
    const extended = read(node);
    sampleDTSSequence(mixer, clip, clip.duration, false);
    let position = read(node),
      spring: WheelGroundData["spring"] = [0, 0, extended[2] - position[2]];
    const mirror = wheels.find(
      (w) => Math.abs(w.position[1] - position[1]) < 0.5,
    );
    if (mirror) {
      position = [-mirror.position[0], mirror.position[1], mirror.position[2]];
      spring = [...mirror.spring];
    }
    wheels.push({ position, spring });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  shape.wheels = wheels;
  return wheels;
}
