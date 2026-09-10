import type { ThreadState } from "./types";

/** ShapeBase::unpackUpdate keeps a thread's position when its sequence matches.
 * Repeated flags do not restart it; Stop and Play-atEnd establish a new origin. */
export function updateShapeThread(
  previous: ThreadState | undefined,
  incoming: ThreadState,
  timeSec: number,
): ThreadState {
  if (
    previous &&
    previous.sequence === incoming.sequence &&
    previous.state === incoming.state &&
    previous.forward === incoming.forward &&
    previous.atEnd === incoming.atEnd
  )
    return previous;
  const preservesPosition =
    previous?.sequence === incoming.sequence &&
    incoming.state !== 1 &&
    !(incoming.state === 0 && incoming.atEnd);
  return {
    ...incoming,
    timeline: { timeSec, previous: preservesPosition ? previous : undefined },
  };
}

interface Anchor {
  duration: number;
  cyclic: boolean;
  time: number;
}
const anchors = new WeakMap<ThreadState, Anchor>();

function advance(
  time: number,
  elapsed: number,
  thread: ThreadState,
  duration: number,
  cyclic: boolean,
): number {
  if (thread.state !== 0 || thread.atEnd) return time;
  time += Math.max(0, elapsed) * (thread.forward ? 1 : -1);
  return cyclic
    ? ((time % duration) + duration) % duration
    : Math.max(0, Math.min(duration, time));
}

/** TSThread time in seconds. Resolve each immutable transition once, after the
 * asset is available; ordinary frames only advance the cached time anchor. */
export function shapeThreadTime(
  thread: ThreadState,
  timeSec: number,
  duration: number,
  cyclic: boolean,
): number {
  if (!(duration > 0)) return 0;
  const cached = anchors.get(thread);
  if (cached?.duration === duration && cached.cyclic === cyclic)
    return advance(
      cached.time,
      timeSec - (thread.timeline?.timeSec ?? timeSec),
      thread,
      duration,
      cyclic,
    );
  const pending: ThreadState[] = [];
  let current: ThreadState | undefined = thread;
  let anchor: Anchor | undefined;
  while (current) {
    anchor = anchors.get(current);
    if (anchor?.duration === duration && anchor.cyclic === cyclic) break;
    pending.push(current);
    current = current.timeline?.previous;
  }
  let time = current ? anchor!.time : 0;
  for (let i = pending.length - 1; i >= 0; i--) {
    const next = pending[i];
    if (current)
      time = advance(
        time,
        (next.timeline?.timeSec ?? 0) - (current.timeline?.timeSec ?? 0),
        current,
        duration,
        cyclic,
      );
    if (next.state === 1) time = 0;
    else if (next.state === 0 && next.atEnd) time = next.forward ? duration : 0;
    anchors.set(next, { duration, cyclic, time });
    current = next;
  }
  return advance(
    time,
    timeSec - (thread.timeline?.timeSec ?? timeSec),
    thread,
    duration,
    cyclic,
  );
}
