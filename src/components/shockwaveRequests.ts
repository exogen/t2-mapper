/**
 * A shockwave ring some shape wants spawned this frame, in Torque space.
 * Mounted images post their muzzle flash here (ShapeBase::setImageState
 * spawns the image datablock's muzzleFlash Shockwave on the client when
 * a fire state is entered); ParticleEffects drains the queue each frame.
 */
export interface ShockwaveRequest {
  /** ShockwaveData datablock id. */
  dataBlockId: number;
  origin: [number, number, number];
  /** Ring axis, for orientToNormal datablocks. */
  normal: [number, number, number];
  /** Entity the ring belongs to, for bookkeeping. */
  ownerId: string;
}

/** Nothing should queue this many; beyond it the oldest are dropped. */
const MAX_PENDING = 64;

let _pending: ShockwaveRequest[] = [];

export function requestShockwave(request: ShockwaveRequest): void {
  if (_pending.length >= MAX_PENDING) _pending.shift();
  _pending.push(request);
}

/** Hands over every pending request and empties the queue. */
export function takeShockwaveRequests(): ShockwaveRequest[] {
  if (_pending.length === 0) return _pending;
  const taken = _pending;
  _pending = [];
  return taken;
}
