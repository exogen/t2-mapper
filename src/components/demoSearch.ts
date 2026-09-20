import { matchSorter, type KeyOption } from "match-sorter";
import { normalizeMissionType } from "../mission";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { missionDisplayName } from "./demoFormat";

const searchKeys: KeyOption<DemoIndexEntry>[] = [
  // Both the internal name and the display name, so "DX_Ice" and
  // "Dangerous Crossing" each match.
  (demo) => demo.games.map((game) => game.mission),
  (demo) => demo.games.map((game) => missionDisplayName(game.mission)),
  // Both forms so "CTF" and "capture the flag" each match.
  (demo) => demo.games.map((game) => game.gameType),
  (demo) => demo.games.map((game) => normalizeMissionType(game.gameType)),
  "server",
  // Exclude the observer bot, including clan tags and numeric suffixes.
  (demo) =>
    [demo.recorder, ...demo.players].filter((name) => !/mapgenius/i.test(name)),
  "filename",
];

/** Every word must match somewhere in the demo, in any order or field. */
export function searchDemos(
  demos: DemoIndexEntry[],
  query: string,
): DemoIndexEntry[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  return terms.reduce(
    (matches, term) =>
      matchSorter(matches, term, {
        keys: searchKeys,
        // Search only controls inclusion; the picker groups by date.
        sorter: (items) => items,
      }),
    demos,
  );
}
