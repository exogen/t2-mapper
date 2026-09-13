import type { DTSTrigger } from "./dtsTypes";

/** TSThread::animateTriggers/activateTriggers: half-open intervals in either
 * direction. On multiple wraps only the last cycle contributes trigger state. */
export function advanceDTSTriggers(
  triggers: readonly DTSTrigger[],
  from: number,
  to: number,
  cyclic: boolean,
  state = 0,
): number {
  if (from === to || !Number.isFinite(from) || !Number.isFinite(to))
    return state;
  const activate = (a: number, b: number) => {
    const forward = a <= b;
    for (
      let i = forward ? 0 : triggers.length - 1;
      forward ? i < triggers.length : i >= 0;
      i += forward ? 1 : -1
    ) {
      const { position, state: bits } = triggers[i];
      if (position < Math.min(a, b) || position >= Math.max(a, b)) continue;
      let on = !!(bits & 0x80000000);
      if (!forward && bits & 0x40000000) on = !on;
      const mask = bits & 0x1f;
      state = on ? state | mask : state & ~mask;
    }
  };
  const loops = cyclic ? Math.floor(to) - Math.floor(from) : 0;
  const a = cyclic ? from - Math.floor(from) : from;
  const b = cyclic ? to - Math.floor(to) : to;
  if (!loops) activate(a, b);
  else if (loops > 0) {
    activate(loops === 1 ? a : b, 1);
    activate(0, b);
  } else {
    activate(loops === -1 ? a : b, 0);
    activate(1, b);
  }
  return state;
}
