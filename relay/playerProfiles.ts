import type { T2PlayerProfile } from "./accountTypes.js";
import type { DemoMetadata } from "./demoMetadata.js";
import {
  buildT2PlayerProfile,
  summarizePlayerStats,
  type PlayerDemo,
  type PlayerStatsSummary,
} from "./t2PlayerProfile.js";

export function isCTFDemo(record: DemoMetadata): boolean {
  return record.games.some((game) =>
    /^Capture the Flag\b/i.test(game.gameType),
  );
}

const newestFirst = (a: DemoMetadata, b: DemoMetadata) =>
  b.recordedAt.localeCompare(a.recordedAt);

export interface PlayerProfileSelection {
  selected: DemoMetadata[];
  lastSeen: DemoMetadata | undefined;
}

/** Reuse one sorted index while each player's lookup finds its appearances.
 * Prefer CTF (which has inventory stations), filling gaps with other games. */
export function createProfileDemoSelector(index: readonly DemoMetadata[]) {
  const newest = [...index].sort(newestFirst);
  const ctf = newest.filter(isCTFDemo);
  const other = newest.filter((record) => !isCTFDemo(record));
  return async (
    findAppearances: (
      candidates: DemoMetadata[],
      wanted: number,
    ) => Promise<DemoMetadata[]>,
    demoCount: number,
  ): Promise<PlayerProfileSelection> => {
    const ctfDemos = await findAppearances(ctf, demoCount);
    const otherDemos =
      ctfDemos.length < demoCount
        ? await findAppearances(other, demoCount - ctfDemos.length)
        : [];
    const selected = [...ctfDemos, ...otherDemos].sort(newestFirst);
    if (!selected.length) return { selected, lastSeen: undefined };
    // Last seen includes newer games omitted by the CTF preference.
    const [lastSeen] = await findAppearances(newest, 1);
    return { selected, lastSeen };
  };
}

export type PlayerProfileDemo = PlayerDemo & { record: DemoMetadata };

/** Current per-player stats only; fetching may have finished in any order.
 * Even a single partial observation can yield a representative profile. */
export function summarizePlayerProfile(
  guid: string,
  demos: readonly PlayerProfileDemo[],
  lastSeen: DemoMetadata | undefined,
  suitUps: number,
  computedAt = Date.now(),
): {
  stats: PlayerStatsSummary;
  used: DemoMetadata[];
  profile: T2PlayerProfile;
} | null {
  if (!demos.length) return null;
  const ordered = [...demos].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );
  const stats = summarizePlayerStats(ordered, suitUps);
  const used = ordered.slice(0, stats.sampledDemos).map(({ record }) => record);
  const profile = buildT2PlayerProfile(guid, stats, {
    lastSeenAt: lastSeen ? Date.parse(lastSeen.recordedAt) : null,
    computedAt,
  });
  return { stats, used, profile };
}
