import type { TimelineEvent } from "../state/demoTimelineStore";
import {
  IFF_ENEMY,
  IFF_FRIENDLY,
  resolveObserverTeamColor,
  rgbString,
  type TeamColorScheme,
} from "../iffTheme";

/** Shared Command Circuit colors for timeline flags and capture seek markers. */
export function timelineFlagColor(
  event: TimelineEvent,
  observerTeamColors: TeamColorScheme,
): string | undefined {
  if (!event.type.startsWith("flag-")) return undefined;
  const display =
    event.teamAffinity === "friendly"
      ? IFF_FRIENDLY
      : event.teamAffinity === "enemy"
        ? IFF_ENEMY
        : resolveObserverTeamColor(event.actorTeamId, observerTeamColors);
  return rgbString(display.mapColor);
}
