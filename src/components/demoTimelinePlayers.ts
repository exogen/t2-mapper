import type { TimelineEvent } from "../state/demoTimelineStore";
import type { SelectItem } from "./Select";
import {
  TIMELINE_ANYONE,
  TIMELINE_RECORDER,
  timelinePlayerBaseName,
} from "./demoTimelineFilters";

/** Include the whole scan's roster, even players without timeline events. */
export function timelinePlayerOptions(
  players: readonly string[],
  events: readonly TimelineEvent[],
  recorderName: string | null,
  recorderAliases: readonly string[] = [],
  playerRawNames: Readonly<Record<string, string>> = {},
): SelectItem[] {
  const names = new Map<string, string>();
  const recorderNames = new Set<string>();
  const otherNames = new Set<string>();
  const initialRecorderName = recorderAliases[0] ?? recorderName ?? "";
  let recorderLabel = timelinePlayerBaseName(
    initialRecorderName,
    undefined,
    playerRawNames,
  );
  for (const name of recorderAliases.length
    ? recorderAliases
    : [recorderName ?? ""]) {
    const baseName = timelinePlayerBaseName(name, undefined, playerRawNames);
    if (baseName) recorderNames.add(baseName.toLowerCase());
  }

  function addName(name: string | undefined, recorder?: boolean, raw?: string) {
    if (!name) return;
    const baseName = timelinePlayerBaseName(name, raw, playerRawNames);
    if (!baseName) return;
    const key = baseName.toLowerCase();
    if (!names.has(key)) names.set(key, baseName);
    if (recorder === true) {
      recorderNames.add(key);
      recorderLabel ||= baseName;
    } else if (recorder === false) {
      otherNames.add(key);
    }
  }

  players.forEach((name) => addName(name));
  for (const event of events) {
    addName(
      event.killer,
      event.type === "kill" && !!event.isRecorder,
      event.raw?.killer,
    );
    addName(
      event.victim,
      event.type === "kill" ? !!event.victimIsRecorder : !!event.isRecorder,
      event.raw?.victim,
    );
    addName(event.actor, !!event.isRecorder, event.raw?.actor);
    addName(event.capturer, !!event.isRecorder, event.raw?.capturer);
    addName(event.previousName, !!event.isRecorder, event.raw?.previousName);
  }

  const others = [...names]
    .filter(([value]) => !recorderNames.has(value) || otherNames.has(value))
    .sort(([, a], [, b]) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    )
    .map(([key, label]) => ({ value: `player:${key}`, label }));
  const options: SelectItem[] = [{ value: TIMELINE_ANYONE, label: "anyone" }];
  if (recorderLabel) {
    options.push(
      { separator: true },
      { value: TIMELINE_RECORDER, label: recorderLabel },
    );
  }
  if (others.length) options.push({ separator: true }, ...others);
  return options;
}
