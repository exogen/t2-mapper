import { useMemo, useSyncExternalStore } from "react";
import { streamClock, subscribeStreamTime } from "../state/streamPlaybackStore";

/** Events from the timeline scanner are sorted by timestamp. */
export function countTimelineEventsThrough(
  events: readonly { timeSec: number }[],
  timeSec: number,
): number {
  let first = 0;
  let end = events.length;
  while (first < end) {
    const middle = Math.floor((first + end) / 2);
    if (events[middle].timeSec <= timeSec) first = middle + 1;
    else end = middle;
  }
  return first;
}

export function useVisibleTimelineCount(
  events: readonly { timeSec: number }[],
  enabled: boolean,
): number {
  const { getSnapshot, subscribe } = useMemo(() => {
    const getSnapshot = () =>
      enabled
        ? countTimelineEventsThrough(events, streamClock.time)
        : events.length;
    return {
      getSnapshot,
      subscribe(onChange: () => void) {
        if (!enabled || !events.length) return () => {};
        let count = getSnapshot();
        return subscribeStreamTime((time) => {
          // Search and notify only when the visible prefix changes.
          if (
            (count > 0 && events[count - 1].timeSec > time) ||
            (count < events.length && events[count].timeSec <= time)
          ) {
            count = countTimelineEventsThrough(events, time);
            onChange();
          }
        });
      },
    };
  }, [events, enabled]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
