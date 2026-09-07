import type { Object3D } from "three";

/**
 * A particle emitter a shape keeps alive at one of its nodes: player jet
 * nozzles, vehicle jet nozzles, contrails. Each frame ParticleEffects
 * emits along the node's movement with the node's local Y as the ejection
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
