import type { Object3D } from "three";

/**
 * A particle emitter a shape keeps alive at one of its nodes: player jet
 * nozzles, vehicle jet nozzles, contrails. Each frame ParticleEffects
 * emits along the node's movement with native DTS +Y (model +Z) as the ejection
 * axis, as Player/FlyingVehicle::updateJet do with emitParticles(nodePos,
 * useLastPosition, nodeAxis, velocity, dt). The owner mutates `velocity`
 * and `dtScale` per frame; removing the registration deletes the emitter
 * (deleteWhenEmpty: spawned particles live out their lifetime).
 */
export interface NodeEmitter {
  /** ParticleEmitterData datablock id. */
  dataBlockId: number;
  /** Node whose world transform places and aims the emitter. */
  anchor: Object3D;
  /** Per-frame inputs, shared by an owner's emitters and mutated in place. */
  frame: NodeEmitterFrame;
  /** Entity the emitter belongs to, for bookkeeping. */
  ownerId: string;
}

export interface NodeEmitterFrame {
  /** Driver velocity (Torque space) for inheritedVelFactor. */
  velocity: [number, number, number];
  /**
   * Fraction of the frame delta to emit over. The engine hands the
   * contrail emitter a delta scaled by how far past minTrailSpeed the
   * vehicle is; 0 skips the frame.
   */
  dtScale: number;
}

/** Player::updateJet (0x005d65e0) reads the nozzle's native +Y column. */
export function readNodeEmitterTransform(
  anchor: Object3D,
  origin: [number, number, number],
  axis: [number, number, number],
): void {
  anchor.updateWorldMatrix(true, false);
  const m = anchor.matrixWorld.elements;
  // Native DTS +Y is model +Z. Swizzle Three world back to Torque [z,x,y].
  origin[0] = m[14];
  origin[1] = m[12];
  origin[2] = m[13];
  const length = Math.hypot(m[8], m[9], m[10]) || 1;
  axis[0] = m[10] / length;
  axis[1] = m[8] / length;
  axis[2] = m[9] / length;
}

const _nodeEmitters = new Set<NodeEmitter>();

export function addNodeEmitter(emitter: NodeEmitter): void {
  _nodeEmitters.add(emitter);
}

export function removeNodeEmitter(emitter: NodeEmitter): void {
  _nodeEmitters.delete(emitter);
}

export function nodeEmitters(): ReadonlySet<NodeEmitter> {
  return _nodeEmitters;
}
