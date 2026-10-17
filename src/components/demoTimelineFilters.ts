import type {
  TimelineEvent,
  TimelineEventType,
} from "../state/demoTimelineStore";

export const TIMELINE_CATEGORIES = [
  { value: "kill", label: "Kills", types: ["kill"] },
  { value: "death", label: "Deaths", types: ["kill", "death"] },
  { value: "flag-grab", label: "Grabs", types: ["flag-grab"] },
  { value: "flag-drop", label: "Drops", types: ["flag-drop"] },
  { value: "flag-return", label: "Returns", types: ["flag-return"] },
  { value: "flag-cap", label: "Caps", types: ["flag-cap"] },
  {
    value: "gens",
    label: "Gens",
    types: ["generator-offline", "generator-online"],
  },
  { value: "rename", label: "Renames", types: ["rename"] },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  types: readonly TimelineEventType[];
}>;

export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number]["value"];

export function isMatchTimelineEvent(event: TimelineEvent): boolean {
  return event.type.startsWith("match-");
}

export function defaultTimelineCategories(): Set<TimelineCategory> {
  return new Set(
    TIMELINE_CATEGORIES.map(({ value }) => value).filter(
      (value) => value !== "kill" && value !== "death",
    ),
  );
}

/** One kill belongs to both categories, with a different owner in each. */
export function matchesTimelineCategory(
  event: TimelineEvent,
  category: (typeof TIMELINE_CATEGORIES)[number],
  mine: boolean,
): boolean {
  return (
    (category.types as readonly TimelineEventType[]).includes(event.type) &&
    (!mine ||
      (category.value === "death" && event.type === "kill"
        ? event.victimIsRecorder === true
        : event.isRecorder === true))
  );
}
