/**
 * The world bounds the sun's shadow camera has to cover.
 *
 * The ortho frustum used to be a fixed 8192 m box for a map that is 2048 m
 * across, so fifteen sixteenths of the shadow map's area fell outside the
 * world and the part that mattered got a quarter of the resolution in each
 * axis. Casters publish their bounds here and the camera is fitted to them.
 */
import { Box3, Sphere } from "three";

const contributions = new Map<string, Box3>();
const listeners = new Set<() => void>();

/**
 * The sphere is cached so repeated reads return the SAME object. Consumers
 * subscribe with useSyncExternalStore, which loops forever if its snapshot
 * changes identity on every call.
 */
let cached: Sphere | null = null;
let dirty = true;

/** Publish (or with null, withdraw) a caster's world-space bounds. */
export function setShadowCasterBounds(id: string, box: Box3 | null): void {
  if (box) {
    contributions.set(id, box.clone());
  } else if (!contributions.delete(id)) {
    return;
  }
  dirty = true;
  for (const listener of listeners) listener();
}

/**
 * A sphere enclosing every caster, or null when nothing casts. A sphere
 * rather than a box because the shadow camera is oriented by the sun: a
 * box would have to be re-fitted per direction, a sphere never does.
 */
export function shadowCasterSphere(): Sphere | null {
  if (!dirty) return cached;
  dirty = false;
  if (contributions.size === 0) {
    cached = null;
    return cached;
  }
  const union = new Box3();
  union.makeEmpty();
  for (const box of contributions.values()) union.union(box);
  cached = union.isEmpty() ? null : union.getBoundingSphere(new Sphere());
  return cached;
}

export function onShadowBoundsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
