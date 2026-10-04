import type { TimelineEvent } from "../state/demoTimelineStore";
import {
  IFF_ENEMY,
  IFF_FRIENDLY,
  IFF_NEUTRAL,
  resolveIffDisplay,
  rgbString,
  type TeamColorScheme,
} from "./iffTheme";

/** Shared Command Circuit colors for timeline flags and capture seek markers. */
export function timelineFlagColor(
  event: TimelineEvent,
  observerPerspective: boolean,
  observerTeamColors: TeamColorScheme,
): string | undefined {
  if (!event.type.startsWith("flag-")) return undefined;
  const display = observerPerspective
    ? resolveIffDisplay({ teamId: event.actorTeamId }, true, observerTeamColors)
    : event.teamAffinity === "friendly"
      ? IFF_FRIENDLY
      : event.teamAffinity === "enemy"
        ? IFF_ENEMY
        : IFF_NEUTRAL;
  return rgbString(display.mapColor);
}
