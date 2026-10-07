export const DEMO_DELETION_FILTERS = [
  "min-length-seconds",
  "exclude-game-type",
  "exclude-server",
  "min-players",
] as const;

export type DemoDeletionFilter =
  | { name: "min-length-seconds" | "min-players"; value: number }
  | { name: "exclude-game-type" | "exclude-server"; value: string };

export function demoDeletionFilter(
  name: (typeof DEMO_DELETION_FILTERS)[number],
  raw: string,
): DemoDeletionFilter {
  const value = raw.trim();
  if (name === "min-length-seconds") {
    const seconds = Number(value);
    if (
      !/^\d+(?:\.\d+)?$/.test(value) ||
      !Number.isFinite(seconds) ||
      seconds * 1000 > Number.MAX_SAFE_INTEGER
    )
      throw new Error(`--${name} must be non-negative seconds`);
    return { name, value: seconds };
  }
  if (name === "min-players") {
    const players = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(players))
      throw new Error(`--${name} must be a non-negative integer`);
    return { name, value: players };
  }
  if (!value) throw new Error(`--${name} must be a non-empty full name`);
  return { name, value };
}

type MatchResult =
  { matches: boolean; value: number | string | string[] } | { skipped: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Exclusions match metadata names, not filenames, globs, or substrings. */
export function matchesDemoDeletion(
  metadata: unknown,
  filter: DemoDeletionFilter,
): MatchResult {
  if (!record(metadata)) return { skipped: "Missing demo metadata" };
  switch (filter.name) {
    case "min-length-seconds": {
      const duration = metadata.durationMs;
      if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration < 0
      )
        return { skipped: "Missing or invalid durationMs" };
      return {
        matches: duration < filter.value * 1000,
        value: duration / 1000,
      };
    }
    case "min-players": {
      let players = metadata.playerCount;
      if (
        players === undefined &&
        Array.isArray(metadata.players) &&
        metadata.players.every((name) => typeof name === "string")
      )
        players = metadata.players.length;
      if (
        typeof players !== "number" ||
        !Number.isSafeInteger(players) ||
        players < 0
      )
        return { skipped: "Missing or invalid playerCount/players" };
      return { matches: players < filter.value, value: players };
    }
    case "exclude-server": {
      const server = metadata.server;
      if (typeof server !== "string" || !server.trim())
        return { skipped: "Missing or invalid server name" };
      return {
        matches: server.trim().toLowerCase() === filter.value.toLowerCase(),
        value: server,
      };
    }
    case "exclude-game-type": {
      const games = metadata.games;
      let types: string[];
      if (
        Array.isArray(games) &&
        games.every((game) => record(game) && typeof game.gameType === "string")
      )
        types = games.map((game) => game.gameType);
      else if (games === undefined && typeof metadata.gameType === "string")
        types = [metadata.gameType];
      else return { skipped: "Missing or invalid game types" };
      return {
        matches: types.some(
          (type) => type.trim().toLowerCase() === filter.value.toLowerCase(),
        ),
        value: types,
      };
    }
  }
}

/** Use the longest recording key so a.rec.copy.rec keeps its own sidecars. */
export function demoDeletionObjects(
  demoKeys: ReadonlySet<string>,
  objectKeys: readonly string[],
): Map<string, string[]> {
  const objects = new Map([...demoKeys].map((key) => [key, [] as string[]]));
  for (const key of objectKeys) {
    if (demoKeys.has(key)) {
      objects.get(key)!.push(key);
      continue;
    }
    for (
      let end = key.lastIndexOf(".rec.");
      end >= 0;
      end = end === 0 ? -1 : key.lastIndexOf(".rec.", end - 1)
    ) {
      const demoKey = key.slice(0, end + 4);
      if (demoKeys.has(demoKey)) {
        objects.get(demoKey)!.push(key);
        break;
      }
    }
  }
  return objects;
}
