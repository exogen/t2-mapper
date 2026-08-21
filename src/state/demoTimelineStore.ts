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
  /**
   * For flag-grab/flag-return events: the player responsible (unset for
   * auto-returns and recorder-perspective events).
   */
  actor?: string;
  /** For flag events: name of the flag's team. */
  flagTeamName?: string;
}

export interface DemoTimelineState {
  events: TimelineEvent[] | null;
  scanProgress: number | null;
  /**
   * The recorder never played — kill/death events are never emitted.
   */
  observerPerspective: boolean;
  setEvents(events: TimelineEvent[], observerPerspective: boolean): void;
  setScanProgress(progress: number | null): void;
  reset(): void;
}

export const demoTimelineStore = createStore<DemoTimelineState>((set) => ({
  events: null,
  scanProgress: null,
  observerPerspective: false,
  setEvents(events, observerPerspective) {
    set({ events, observerPerspective });
  },
  setScanProgress(progress) {
    set({ scanProgress: progress });
  },
  reset() {
    set({ events: null, scanProgress: null, observerPerspective: false });
  },
}));

export function useDemoTimeline<T>(
  selector: (state: DemoTimelineState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(demoTimelineStore, selector, equality);
}
