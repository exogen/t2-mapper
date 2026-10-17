import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";

export type TimelineEventType =
  | "match-start"
  | "match-countdown"
  | "match-end"
  /** One player-vs-player incident, selectable under both Kills and Deaths. */
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
  /** Original message-log text, when this event has a corresponding message. */
  originalMessage?: string;
  /** The actor/navigation target is the recorder: killer for kills, victim for deaths.
   * Resolved at scan time so renames during the seek lead-in don't matter. */
  isRecorder?: boolean;
  /** The victim of a player-vs-player kill is the recorder. Used by Mine + Deaths. */
  victimIsRecorder?: boolean;
  /** Whether the recorder's team or enemy team was involved. */
  teamAffinity?: TeamAffinity;
  /** For kill/death events: name of the killer. */
  killer?: string;
  /** For kill/death events: name of the victim. */
  victim?: string;
  /** For kill/death events: weapon or damage type (e.g. "disc", "ground"). */
  weapon?: string;
  /** Own-weapon death; excludes cratering, hazards and explicit suicide. */
  selfKill?: boolean;
  /** Lowercase server Msg* type for deaths without a separate player killer. */
  deathMessage?: string;
  /** Event-time character pronoun supplied in the server's death message. */
  victimPronoun?: "him" | "her";
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
  /** For flag events: the flag's team ID, independent of the actor's team. */
  flagTeamId?: number;
  /** For flag events: the action owner's team at the event time. */
  actorTeamId?: number;
  /** For flag events: the action owner's team name at the event time. */
  actorTeamName?: string;
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
  scanProgress: number | null;
  error: string | null;
  setEvents(events: TimelineEvent[]): void;
  setScanProgress(progress: number | null): void;
  setError(error: string): void;
  reset(): void;
}

export const demoTimelineStore = createStore<DemoTimelineState>((set) => ({
  events: null,
  scanProgress: null,
  error: null,
  setEvents(events) {
    set({ events, error: null });
  },
  setScanProgress(progress) {
    set({ scanProgress: progress });
  },
  setError(error) {
    set({ error, scanProgress: null, events: null });
  },
  reset() {
    set({
      events: null,
      scanProgress: null,
      error: null,
    });
  },
}));

export function useDemoTimeline<T>(
  selector: (state: DemoTimelineState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(demoTimelineStore, selector, equality);
}
