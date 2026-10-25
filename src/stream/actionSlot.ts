/**
 * A Player's one action slot (+0x9d8), as Player::setActionThread
 * (Tribes2.exe 0x5d5a10) and pickActionAnimation (0x5d6210) keep it.
 *
 * Every action change goes through setActionThread, which ignores the
 * action the slot already holds. Whether it still holds it depends on
 * clip lengths: a finished, unheld action is replaced by the client's own
 * movement pick unless the player is dead, mounted (which keeps all but
 * table actions; updateMove's jump is table JumpAnim), or a ski jump holds
 * the pick off. The engine has no clip lengths, so it keeps the run of
 * calls with the same action since the slot last took a different one,
 * dropping only calls that are certainly ignored; the pose sampler, which
 * has the clips, resolves the run.
 */

/** One setActionThread call with the slot's action. */
export interface ActionCall {
  timeSec: number;
  /** holdAtEnd: the action stays until another replaces it. */
  hold?: boolean;
  /**
   * The ghost update said the thread was at its end; unpackUpdate snaps
   * the thread there even when setActionThread ignores the call.
   */
  atEnd?: boolean;
  /** Where the server's thread was (0..1), on a ghost's initial update. */
  startPos?: number;
  /** Mounted or dead at the call: pickActionAnimation keeps the action. */
  parked?: boolean;
  /** Until then pickActionAnimation is held off (a ski jump's +0x98c). */
  pickHeldUntilSec?: number;
}

export interface ActionSlot {
  /**
   * A wired action index (non-table, from the ActionMask), or the alias
   * of an action the client set itself: updateMove's jump, standjump or
   * ski.
   */
  action: number | string;
  /** The call that set the action, then any later calls with it. */
  calls: readonly ActionCall[];
  /** The player mounted or died while the slot held the action. */
  parkedSec?: number;
}

/**
 * setActionThread(action) at `call.timeSec`. Returns `slot` itself when
 * the call certainly changes nothing.
 */
export function setActionThread(
  slot: ActionSlot | undefined,
  action: number | string,
  call: ActionCall,
): ActionSlot {
  if (slot?.action !== action) return { action, calls: [call] };
  const last = slot.calls[slot.calls.length - 1];
  // Certainly still the slot's action: whichever call set it holds it on,
  // or the pick has been held off since the last call.
  const forever = slot.calls.every((c) => c.hold || c.parked);
  const kept = forever || call.timeSec < (last.pickHeldUntilSec ?? -Infinity);
  const atEnd = forever ? slot.calls.some((c) => c.atEnd) : last.atEnd;
  if (kept && (!call.atEnd || atEnd)) {
    const held = call.pickHeldUntilSec ?? -Infinity;
    return held > (last.pickHeldUntilSec ?? -Infinity)
      ? withLastCall(slot, { ...last, pickHeldUntilSec: held })
      : slot;
  }
  return { ...slot, calls: [...slot.calls, call] };
}

/**
 * The player died, or mounted: from now an action still playing never
 * ends. A mounted player's pickActionAnimation turns a table action into
 * root, so mounting leaves a jump to end as usual.
 */
export function parkActionSlot(
  slot: ActionSlot | undefined,
  timeSec: number,
  cause: "death" | "mount",
): ActionSlot | undefined {
  if (!slot || slot.parkedSec != null) return slot;
  if (cause === "mount" && slot.action === "jump") return slot;
  return { ...slot, parkedSec: timeSec };
}

/** A 4–30 m/s hop zeroed the ski jump's pick hold. */
export function endActionPickHold(
  slot: ActionSlot | undefined,
  timeSec: number,
): ActionSlot | undefined {
  const last = slot?.calls[slot.calls.length - 1];
  return last && (last.pickHeldUntilSec ?? -Infinity) > timeSec
    ? withLastCall(slot!, { ...last, pickHeldUntilSec: timeSec })
    : slot;
}

function withLastCall(slot: ActionSlot, call: ActionCall): ActionSlot {
  return { ...slot, calls: [...slot.calls.slice(0, -1), call] };
}

/** The slot's action as the client plays it at `nowSec`. */
export interface ResolvedAction {
  /**
   * When the clip would have been at position 0, for the transition into
   * it; -Infinity when it arrived already finished (a scope-in ghost).
   */
  sinceSec: number;
  /** The call that set it, or the last one that snapped it to its end. */
  timeSec: number;
  /** Clip position (0..1) at `timeSec`. */
  startPos: number;
  atEnd: boolean;
  /**
   * When pickActionAnimation replaces it (Infinity: never); the slot
   * holds no action from then on.
   */
  endSec: number;
}

/**
 * Replay a slot's calls up to `nowSec` with the action's clip length,
 * as setActionThread and pickActionAnimation would have taken them.
 */
export function resolveActionSlot(
  slot: ActionSlot,
  durationSec: number,
  nowSec: number,
): ResolvedAction {
  let resolved!: ResolvedAction;
  let pickHeldUntil = -Infinity;
  const settle = () => {
    if (resolved.endSec !== Infinity)
      resolved.endSec = Math.max(resolved.endSec, pickHeldUntil);
  };
  const apply = (call: ActionCall) => {
    const startPos = call.atEnd ? 1 : (call.startPos ?? 0);
    pickHeldUntil = call.pickHeldUntilSec ?? -Infinity;
    resolved = {
      sinceSec: call.atEnd ? -Infinity : call.timeSec - startPos * durationSec,
      timeSec: call.timeSec,
      startPos,
      atEnd: !!call.atEnd,
      endSec:
        call.hold || call.parked
          ? Infinity
          : call.timeSec + (1 - startPos) * durationSec,
    };
    settle();
  };
  // Parked while it still held the action: nothing replaces it again.
  let parkSec = slot.parkedSec;
  const park = (timeSec: number) => {
    if (parkSec == null || parkSec > timeSec) return;
    if (parkSec < resolved.endSec) resolved.endSec = Infinity;
    parkSec = undefined;
  };
  apply(slot.calls[0]);
  for (const call of slot.calls.slice(1)) {
    if (call.timeSec > nowSec) break;
    park(call.timeSec);
    if (call.timeSec >= resolved.endSec) {
      apply(call);
      continue;
    }
    // Ignored by setActionThread; unpackUpdate still snaps an at-end
    // thread, and the client's own pickActionAnimation follows.
    pickHeldUntil = Math.max(pickHeldUntil, call.pickHeldUntilSec ?? -Infinity);
    if (call.atEnd) {
      resolved.timeSec = call.timeSec;
      resolved.startPos = 1;
      resolved.atEnd = true;
      if (resolved.endSec !== Infinity) resolved.endSec = call.timeSec;
    }
    settle();
  }
  park(nowSec);
  return resolved;
}

/** The slot's action and its latest call, as the last ActionMask said. */
export function latestAction(slot: ActionSlot | undefined) {
  const call = slot?.calls[slot.calls.length - 1];
  return (
    slot &&
    call && {
      action: slot.action,
      hold: !!call.hold,
      atEnd: !!call.atEnd,
      startPos: call.startPos,
    }
  );
}
