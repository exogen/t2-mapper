/**
 * The map as a venue — the facts about WHERE the match is that a booth
 * can talk about before anything has happened: how far apart the flags
 * are, what each base is made of, what sits underground.
 *
 * Read from the structure inventory once the world has arrived, so it
 * is available before the whistle and never guesses.
 */
import type { DirectorDataset, Venue, VenueHardware } from "./types";
import { dist } from "./geometry";
import { terrainHeightAt } from "../collision/terrainCollision";
import { getWorldColliderCounts } from "../collision/worldCollision";

/** Hardware that players deploy is not part of the venue. */
const DEPLOYABLE_NAMES = new Set([
  "spider clamp turret",
  "land spike turret",
  "motion sensor",
  "pulse sensor",
  "deployable inventory",
]);

/** Size bands on the flag-to-flag distance: ~500m small, ~1000m
 *  medium, ~1500m large, beyond that very large. */
const SIZE_BANDS: [number, Venue["size"]][] = [
  [750, "small"],
  [1250, "medium"],
  [1750, "large"],
];

/** How far below the terrain a thing has to sit to count as
 *  underground; a base built into a hillside is not a basement. */
const UNDERGROUND_MARGIN = 2;

/**
 * Whether a Torque-space point is below the terrain height map.
 *
 * The HEIGHT MAP, not a ray: a bunker base sits under an empty square
 * — a hole cut in the terrain for its entrance — and a ray, which
 * rightly treats holes as open air, never finds a surface above it.
 */
function underTerrain(pos: readonly [number, number, number]): boolean {
  const ground = terrainHeightAt(pos[0], pos[1]);
  return ground != null && pos[2] < ground - UNDERGROUND_MARGIN;
}

/** The venue, or null while the map is not known well enough. */
export function describeVenue(dataset: DirectorDataset): Venue | null {
  const stands = dataset.flagStands.filter((s) => s.teamId != null);
  if (stands.length < 2) return null;
  const flagDistanceM = Math.round(dist(stands[0].pos, stands[1].pos));
  const size =
    SIZE_BANDS.find(([limit]) => flagDistanceM < limit)?.[1] ?? "very large";

  // One side's hardware. The bases mirror each other; the side with
  // the fuller inventory is the truer picture if they do not.
  const bySide = new Map<
    number,
    Map<string, { count: number; under: number }>
  >();
  for (const st of dataset.structureInventory) {
    if (st.teamId == null || DEPLOYABLE_NAMES.has(st.name)) continue;
    let kinds = bySide.get(st.teamId);
    if (!kinds) bySide.set(st.teamId, (kinds = new Map()));
    const entry = kinds.get(st.name) ?? { count: 0, under: 0 };
    entry.count++;
    if (underTerrain(st.pos)) entry.under++;
    kinds.set(st.name, entry);
  }
  const side = [...bySide.values()].sort(
    (a, b) =>
      [...b.values()].reduce((n, e) => n + e.count, 0) -
      [...a.values()].reduce((n, e) => n + e.count, 0),
  )[0];
  const hardwarePerBase: VenueHardware[] = side
    ? [...side.entries()]
        .map(([kind, e]) => ({ kind, count: e.count, underground: e.under }))
        .sort((a, b) => a.kind.localeCompare(b.kind))
    : [];

  return {
    flagDistanceM,
    size,
    flagStandsUnderground: stands.filter((s) => underTerrain(s.pos)).length,
    hardwarePerBase,
    forceFields: getWorldColliderCounts().forceFields,
  };
}
