import {
  AnimationClip,
  AnimationMixer,
  type AnimationAction,
  type AnimationBlendMode,
  type Object3D,
} from "three";
import { DTSAnimationClip } from "./dtsModel";
import { DTSSequenceFlags } from "./dtsTypes";

type Root = Parameters<AnimationMixer["uncacheRoot"]>[0];
interface PreparedClip {
  pose: AnimationClip;
  source: DTSAnimationClip;
  masks: Map<string, AnimationClip>;
}
interface Thread {
  action: AnimationAction;
  clip: PreparedClip;
  active: boolean;
  priority: number;
  blend: boolean;
  objects?: AnimationAction;
}
const preparedClips = new WeakMap<AnimationClip, PreparedClip>();

function prepare(clip: AnimationClip): PreparedClip | undefined {
  const cached = preparedClips.get(clip);
  if (cached) return cached;
  if (!(clip instanceof DTSAnimationClip) || !clip.objectAnimation) return;
  const names = new Set(clip.objectAnimation.tracks.map((track) => track.name));
  const pose = new DTSAnimationClip(
    clip.name,
    clip.duration,
    clip.tracks.filter((track) => !names.has(track.name)),
    clip.blendMode,
  );
  pose.sequence = clip.sequence;
  pose.objectAnimation = clip.objectAnimation;
  pose.triggers = clip.triggers;
  pose.groundMotion = clip.groundMotion;
  const result = {
    source: clip,
    pose,
    masks: new Map<string, AnimationClip>(),
  };
  preparedClips.set(clip, result);
  preparedClips.set(pose, result);
  return result;
}

/** Three.js pose blending with Torque object-state priorities. All interpolation
 * and property binding stay in native mixers. Ownership changes select disjoint
 * clips; a steady frame only copies action times and evaluates those clips.
 * Nodes still use the host's pose/crossfade policy. No Three private APIs. */
export class DTSAnimationMixer extends AnimationMixer {
  private objects?: AnimationMixer;
  private threads = new Map<AnimationAction, Thread>();
  private dirty = false;

  private resolve(
    clip: AnimationClip | string,
    root = this.getRoot(),
  ): AnimationClip | null {
    return typeof clip === "string"
      ? AnimationClip.findByName(root as Object3D, clip)
      : clip;
  }

  override clipAction(
    clip: AnimationClip,
    root?: Root,
    blendMode?: AnimationBlendMode,
  ): AnimationAction;
  override clipAction(
    clip: AnimationClip | string,
    root?: Root,
    blendMode?: AnimationBlendMode,
  ): AnimationAction | null;
  override clipAction(
    clip: AnimationClip | string,
    root?: Root,
    blendMode?: AnimationBlendMode,
  ): AnimationAction | null {
    const source = this.resolve(clip, root);
    if (!source) return null;
    const prepared = prepare(source);
    const action = super.clipAction(prepared?.pose ?? source, root, blendMode);
    if (prepared && !this.threads.has(action)) {
      this.objects ??= new AnimationMixer(this.getRoot());
      this.threads.set(action, {
        action,
        clip: prepared,
        active: false,
        priority: 0,
        blend: false,
      });
      this.dirty = true;
    }
    return action;
  }

  override existingAction(
    clip: AnimationClip | string,
    root?: Root,
  ): AnimationAction | null {
    const source = this.resolve(clip, root);
    return source
      ? super.existingAction(prepare(source)?.pose ?? source, root)
      : null;
  }

  override update(delta: number): this {
    super.update(delta);
    if (!this.objects) return this;
    for (const thread of this.threads.values()) {
      const active =
        thread.action.isScheduled() &&
        thread.action.enabled &&
        thread.action.getEffectiveWeight() > 0;
      const priority = thread.clip.source.sequence?.priority ?? 0;
      const blend = !!(
        (thread.clip.source.sequence?.flags ?? 0) & DTSSequenceFlags.Blend
      );
      if (
        active !== thread.active ||
        priority !== thread.priority ||
        blend !== thread.blend
      ) {
        thread.active = active;
        thread.priority = priority;
        thread.blend = blend;
        this.dirty = true;
      }
    }
    let evaluateObjects = this.dirty;
    if (this.dirty) this.selectObjectTracks();
    for (const thread of this.threads.values()) {
      if (thread.objects && thread.objects.time !== thread.action.time) {
        thread.objects.time = thread.action.time;
        evaluateObjects = true;
      }
    }
    // Scrubbed/paused threads keep their object state until time or ownership
    // changes. The pose mixer still runs above for native fades and scheduling.
    if (evaluateObjects) this.objects.update(0);
    return this;
  }

  private selectObjectTracks(): void {
    this.dirty = false;
    for (const thread of this.threads.values()) {
      thread.objects?.stop();
      thread.objects = undefined;
    }
    // TSThread::operator<: non-blend threads first, then descending priority.
    // Equal priorities retain creation order; the engine specifies no tie-break.
    const active = [...this.threads.values()]
      .filter((thread) => thread.active)
      .sort(
        (a, b) => Number(a.blend) - Number(b.blend) || b.priority - a.priority,
      );
    const claimed = new Map<Root, Set<string>>();
    for (const thread of active) {
      const root = thread.action.getRoot();
      let names = claimed.get(root);
      if (!names) claimed.set(root, (names = new Set()));
      const animation = thread.clip.source.objectAnimation!;
      const indices: number[] = [];
      animation.tracks.forEach((track, i) => {
        if (names.has(track.name)) return;
        names.add(track.name);
        indices.push(i);
      });
      if (!indices.length) continue;
      const key = indices.join(",");
      let clip = thread.clip.masks.get(key);
      if (!clip) {
        clip = new AnimationClip(
          animation.name,
          animation.duration,
          indices.map((i) => animation.tracks[i]),
        );
        thread.clip.masks.set(key, clip);
      }
      const action = this.objects!.clipAction(clip, root).reset().play();
      action.paused = true;
      thread.objects = action;
    }
  }

  override stopAllAction(): this {
    super.stopAllAction();
    this.objects?.stopAllAction();
    for (const thread of this.threads.values()) {
      thread.active = false;
      thread.objects = undefined;
    }
    this.dirty = true;
    return this;
  }

  override uncacheRoot(root: Root): void {
    super.uncacheRoot(root);
    this.objects?.uncacheRoot(root);
    for (const [action] of this.threads) {
      if (action.getRoot() === root) this.threads.delete(action);
    }
    this.dirty = true;
  }

  override uncacheAction(
    clip: AnimationClip | string,
    root = this.getRoot(),
  ): void {
    const source = this.resolve(clip, root);
    if (!source) return;
    const prepared = prepare(source);
    const action = super.existingAction(prepared?.pose ?? source, root);
    super.uncacheAction(prepared?.pose ?? source, root);
    if (action) this.threads.delete(action);
    if (prepared)
      for (const mask of prepared.masks.values())
        this.objects?.uncacheAction(mask, root);
    this.dirty = true;
  }

  override uncacheClip(clip: AnimationClip): void {
    const prepared = prepare(clip);
    super.uncacheClip(prepared?.pose ?? clip);
    if (prepared) {
      for (const [action, thread] of this.threads)
        if (thread.clip === prepared) this.threads.delete(action);
      for (const mask of prepared.masks.values())
        this.objects?.uncacheClip(mask);
    }
    this.dirty = true;
  }
}
