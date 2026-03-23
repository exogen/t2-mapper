import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";

export type TimelineEventType =
  | "match-start"
  | "match-end"
  | "kill"
  | "death"
  | "flag-grab"
  | "flag-return"
  | "flag-cap";

/** Relationship of the event to the recorder's team. */
export type TeamAffinity = "friendly" | "enemy" | "neutral";

export interface TimelineEvent {
  timeSec: number;
  type: TimelineEventType;
  description: string;
  /** For flag events: whether the recorder's team or enemy team was involved. */
  teamAffinity?: TeamAffinity;
  /** For kill/death events: name of the killer. */
  killer?: string;
  /** For kill/death events: name of the victim. */
  victim?: string;
  /** For kill/death events: weapon or damage type (e.g. "disc", "ground"). */
  weapon?: string;
  /** For flag-cap events: name of the player who captured. */
  capturer?: string;
  /** For flag-cap/flag-grab events: name of the flag's team. */
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
