import { matchSorter, type KeyOption } from "match-sorter";
import { normalizeMissionType } from "../mission";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { missionDisplayName } from "./demoFormat";

/** Exclude the observer bot, including clan tags and numeric suffixes. */
function withoutObserver(names: string[]): string[] {
  return names.filter((name) => !/mapgenius/i.test(name));
}

const uploaderNames = (demo: DemoIndexEntry) => [
  demo.discordHandleAtUploadTime ?? "",
  demo.discordDisplayNameAtUploadTime ?? "",
];

const identityKeys: KeyOption<DemoIndexEntry>[] = [
  (demo) => withoutObserver([demo.recorder]),
  uploaderNames,
];

const searchKeys: KeyOption<DemoIndexEntry>[] = [
  (demo) => demo.games.map((game) => game.title ?? ""),
  (demo) => demo.games.flatMap((game) => Object.values(game.teamNames ?? {})),
  // Both the internal name and the display name, so "DX_Ice" and
  // "Dangerous Crossing" each match.
  (demo) => demo.games.map((game) => game.mission),
  (demo) => demo.games.map((game) => missionDisplayName(game.mission)),
  // Both forms so "CTF" and "capture the flag" each match.
  (demo) => demo.games.map((game) => game.gameType),
  (demo) => demo.games.map((game) => normalizeMissionType(game.gameType)),
  "server",
  (demo) => withoutObserver([demo.recorder, ...demo.players]),
  "filename",
  uploaderNames,
];

/** Every word must match; @words match only the recorder or Discord uploader. */
export function searchDemos(
  demos: DemoIndexEntry[],
  query: string,
): DemoIndexEntry[] {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((term) => term && term !== "@");
  return terms.reduce(
    (matches, term) =>
      matchSorter(matches, term.startsWith("@") ? term.slice(1) : term, {
        keys: term.startsWith("@") ? identityKeys : searchKeys,
        // Search only controls inclusion; the picker groups by date.
        sorter: (items) => items,
      }),
    demos,
  );
}
