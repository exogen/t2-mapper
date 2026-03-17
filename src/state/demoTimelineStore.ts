import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";

export type TimelineEventType = "match-start" | "match-end" | "kill" | "flag-cap";

/** Relationship of the event to the recorder's team. */
export type TeamAffinity = "friendly" | "enemy" | "neutral";

export interface TimelineEvent {
  timeSec: number;
  type: TimelineEventType;
  description: string;
  /** For flag-cap: whether the recorder's team or enemy team scored. */
  teamAffinity?: TeamAffinity;
  /** For kill events: name of the killer. */
  killer?: string;
  /** For kill events: name of the victim. */
  victim?: string;
  /** For kill events: weapon or method of death (e.g. "disc", "mortar"). */
  weapon?: string;
  /** For flag-cap events: name of the player who captured. */
  capturer?: string;
  /** For flag-cap events: name of the team whose flag was captured. */
  flagTeamName?: string;
}

export interface DemoTimelineState {
  events: TimelineEvent[] | null;
  scanProgress: number | null;
  setEvents(events: TimelineEvent[]): void;
  setScanProgress(progress: number | null): void;
  reset(): void;
}

export const demoTimelineStore = createStore<DemoTimelineState>((set) => ({
  events: null,
  scanProgress: null,
  setEvents(events) {
    set({ events });
  },
  setScanProgress(progress) {
    set({ scanProgress: progress });
  },
  reset() {
    set({ events: null, scanProgress: null });
  },
}));

export function useDemoTimeline<T>(
  selector: (state: DemoTimelineState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(demoTimelineStore, selector, equality);
}
