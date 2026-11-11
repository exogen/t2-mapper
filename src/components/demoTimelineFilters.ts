import type {
  TimelineEvent,
  TimelineEventType,
} from "../state/demoTimelineStore";
import {
  stripTaggedStringMarkup,
  taglessPlayerName,
} from "../stream/streamHelpers";

export const TIMELINE_ANYONE = "anyone";
export const TIMELINE_RECORDER = "recorder";

/** Prefer event-time tag structure; fill in unmarked names from the roster. */
export function timelinePlayerBaseName(
  name: string,
  rawName?: string,
  playerRawNames: Readonly<Record<string, string>> = {},
): string {
  const displayName = stripTaggedStringMarkup(name).trim();
  const key = displayName.toLowerCase();
  const eventBaseName = taglessPlayerName(rawName ?? name, displayName);
  if (eventBaseName.toLowerCase() !== key) return eventBaseName;
  const knownRawName = Object.hasOwn(playerRawNames, key)
    ? playerRawNames[key]
    : undefined;
  return knownRawName != null
    ? taglessPlayerName(knownRawName, displayName)
    : eventBaseName;
}

export function timelinePlayerValue(name: string, rawName?: string): string {
  return `player:${timelinePlayerBaseName(name, rawName).toLowerCase()}`;
}

function matchesPlayerName(
  name: string | undefined,
  playerFilter: string,
  isRecorder: boolean | undefined,
  rawName: string | undefined,
  playerRawNames: Readonly<Record<string, string>>,
): boolean {
  if (isRecorder || !name) return false;
  return (
    `player:${timelinePlayerBaseName(name, rawName, playerRawNames).toLowerCase()}` ===
    playerFilter
  );
}

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

/** Match announcements remain visible while a participant is selected. */
export function involvesTimelinePlayer(
  event: TimelineEvent,
  playerFilter: string,
  playerRawNames: Readonly<Record<string, string>> = {},
): boolean {
  if (isMatchTimelineEvent(event) || playerFilter === TIMELINE_ANYONE)
    return true;
  if (playerFilter === TIMELINE_RECORDER)
    return event.isRecorder === true || event.victimIsRecorder === true;
  return (
    ownsTimelineEvent(event, playerFilter, playerRawNames) ||
    (event.type === "kill" &&
      matchesPlayerName(
        event.victim,
        playerFilter,
        event.victimIsRecorder,
        event.raw?.victim,
        playerRawNames,
      ))
  );
}

function ownsTimelineEvent(
  event: TimelineEvent,
  playerFilter: string,
  playerRawNames: Readonly<Record<string, string>>,
): boolean {
  const matches = (role: keyof NonNullable<TimelineEvent["raw"]>) =>
    matchesPlayerName(
      event[role],
      playerFilter,
      event.isRecorder,
      event.raw?.[role],
      playerRawNames,
    );
  switch (event.type) {
    case "kill":
      return matches("killer");
    case "death":
      return matches("victim");
    case "flag-cap":
      return matches("capturer");
    case "rename":
      return matches("actor") || matches("previousName");
    default:
      return matches("actor");
  }
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
  playerFilter: string,
  playerRawNames: Readonly<Record<string, string>> = {},
): boolean {
  if (!(category.types as readonly TimelineEventType[]).includes(event.type))
    return false;
  if (playerFilter === TIMELINE_ANYONE) return true;
  if (playerFilter === TIMELINE_RECORDER)
    return category.value === "death" && event.type === "kill"
      ? event.victimIsRecorder === true
      : event.isRecorder === true;
  return category.value === "death" && event.type === "kill"
    ? matchesPlayerName(
        event.victim,
        playerFilter,
        event.victimIsRecorder,
        event.raw?.victim,
        playerRawNames,
      )
    : ownsTimelineEvent(event, playerFilter, playerRawNames);
}
