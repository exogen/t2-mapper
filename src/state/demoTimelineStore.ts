import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";

export type TimelineEventType =
  | "match-start"
  | "match-countdown"
  | "match-end"
  | "kill"
  | "death"
  | "flag-grab"
  | "flag-drop"
  | "flag-return"
  | "flag-cap"
  | "generator-offline"
  | "generator-online"
  /** A player changed their name mid-match (MsgClientNameChanged) —
   *  a clan tag added or dropped on the community servers that allow
   *  it, occasionally a whole new name. */
  | "rename";

/** Relationship of the event to the recorder's team. */
export type TeamAffinity = "friendly" | "enemy" | "neutral";

export interface TimelineEvent {
  timeSec: number;
  type: TimelineEventType;
  description: string;
  /** The navigation target is the recorder (deaths target the killer if known).
   *  Resolved at scan time so renames during the seek lead-in don't matter. */
  isRecorder?: boolean;
  /** Whether the recorder's team or enemy team was involved. */
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
   * For flag and generator events: the player responsible, when known.
   * Generator offline credit uses the server's destruction scorer, or falls
   * back to the most recent nearby shooter at the offline transition.
   * Each repairer with a continuous beam gets a separate online event.
   */
  actor?: string;
  /** Generator destruction inferred from a nearby projectile, not server credit. */
  actorInferred?: boolean;
  /** Generator's team label, e.g. "Storm generator". */
  generatorLabel?: string;
  /** Event-time position in Torque coordinates, independent of ghost reuse. */
  generator?: { position: [number, number, number]; dataBlockId: number };
  /** For flag events: name of the flag's team. */
  flagTeamName?: string;
  /** For rename events: the name before the change (`actor` is the
   *  name after). */
  previousName?: string;
  /**
   * The same names as sent, color codes included — the official clan
   * tag is the color-7 segment. For display only; matching uses the
   * stripped fields above.
   */
  raw?: {
    killer?: string;
    victim?: string;
    actor?: string;
    capturer?: string;
    previousName?: string;
  };
}

export interface DemoTimelineState {
  events: TimelineEvent[] | null;
  /** All player-vs-player kills regardless of perspective (director
   *  weapon classification) — never rendered on the timeline. */
  killEvents: TimelineEvent[] | null;
  scanProgress: number | null;
  error: string | null;
  /**
   * The recorder never played — kill/death events are never emitted.
   */
  observerPerspective: boolean;
  setEvents(
    events: TimelineEvent[],
    observerPerspective: boolean,
    killEvents: TimelineEvent[],
  ): void;
  setScanProgress(progress: number | null): void;
  setError(error: string): void;
  reset(): void;
}

export const demoTimelineStore = createStore<DemoTimelineState>((set) => ({
  events: null,
  killEvents: null,
  scanProgress: null,
  error: null,
  observerPerspective: false,
  setEvents(events, observerPerspective, killEvents) {
    set({ events, observerPerspective, killEvents, error: null });
  },
  setScanProgress(progress) {
    set({ scanProgress: progress });
  },
  setError(error) {
    set({ error, scanProgress: null, events: null, killEvents: null });
  },
  reset() {
    set({
      events: null,
      killEvents: null,
      scanProgress: null,
      error: null,
      observerPerspective: false,
    });
  },
}));

export function useDemoTimeline<T>(
  selector: (state: DemoTimelineState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(demoTimelineStore, selector, equality);
}
