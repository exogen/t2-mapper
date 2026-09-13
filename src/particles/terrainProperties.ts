import type { ParticleKey } from "./types";

// Retail scripts/{lush,ice,desert,badlands,lava}PropMap.cs. Values are sRGB.
const entries: Record<string, readonly number[]> = {
  "terrain/lushworld.dirtmossy": [0.46, 0.36, 0.26, 0.4, 0.0, 0],
  "terrain/lushworld.grassdark": [0.46, 0.36, 0.26, 0.4, 0.0, 0],
  "terrain/lushworld.grasslight": [0.46, 0.36, 0.26, 0.4, 0.0, 0],
  "terrain/lushworld.grassmixed": [0.46, 0.36, 0.26, 0.4, 0.0, 0],
  "terrain/lushworld.lakebed": [0.46, 0.36, 0.26, 0.4, 0.0, 0],
  "terrain/lushworld.rocklight": [0.46, 0.36, 0.26, 0.4, 0.0, 0],
  "terrain/lushworld.rockmossy": [0.46, 0.36, 0.26, 0.4, 0.0, 0],
  "terrain/iceworld.ice": [0.9, 0.9, 0.9, 0.4, 0.0, 3],
  "terrain/iceworld.rockblue": [0.9, 0.9, 0.9, 0.4, 0.0, 3],
  "terrain/iceworld.snow": [0.9, 0.9, 0.9, 0.4, 0.0, 3],
  "terrain/iceworld.snowice": [0.9, 0.9, 0.9, 0.4, 0.0, 3],
  "terrain/iceworld.snowrock": [0.9, 0.9, 0.9, 0.4, 0.0, 3],
  "terrain/desertworld.rockfractured": [0.35, 0.2, 0.05, 0.7, 0.0, 0],
  "terrain/desertworld.rocksmooth": [0.35, 0.2, 0.05, 0.7, 0.0, 0],
  "terrain/desertworld.sand": [0.35, 0.2, 0.05, 0.7, 0.0, 0],
  "terrain/desertworld.sandbrun": [0.35, 0.2, 0.05, 0.7, 0.0, 0],
  "terrain/desertworld.sanddark": [0.35, 0.2, 0.05, 0.7, 0.0, 0],
  "terrain/desertworld.sandorange": [0.35, 0.2, 0.05, 0.7, 0.0, 0],
  "terrain/desertworld.sandoxidized": [0.35, 0.2, 0.05, 0.7, 0.0, 0],
  "terrain/badlands.dirtbumpy": [0.5, 0.36, 0.16, 0.4, 0.0, 0],
  "terrain/badlands.dirtchipped": [0.5, 0.36, 0.16, 0.4, 0.0, 0],
  "terrain/badlands.dirtyellow": [0.5, 0.36, 0.16, 0.4, 0.0, 0],
  "terrain/badlands.dirtyellowcracked": [0.5, 0.36, 0.16, 0.4, 0.0, 0],
  "terrain/badlands.rockbrown": [0.5, 0.36, 0.16, 0.4, 0.0, 0],
  "terrain/badlands.rockchipped": [0.5, 0.36, 0.16, 0.4, 0.0, 0],
  "terrain/badlands.rockcracked": [0.5, 0.36, 0.16, 0.4, 0.0, 0],
  "terrain/lavaworld.crust": [0.0, 0.0, 0.0, 0.7, 0.0, 0],
  "terrain/lavaworld.lavarockhot": [0.0, 0.0, 0.0, 0.7, 0.0, 0],
  "terrain/lavaworld.muddyash": [0.0, 0.0, 0.0, 0.7, 0.0, 0],
  "terrain/lavaworld.rockblack": [0.0, 0.0, 0.0, 0.7, 0.0, 0],
};
type Colors = Pick<ParticleKey, "r" | "g" | "b" | "a">[];
const cache = new Map<string, Colors | undefined>();
export function terrainParticleColors(
  textureName: string | undefined,
): Pick<ParticleKey, "r" | "g" | "b" | "a">[] | undefined {
  if (!textureName) return undefined;
  const name = textureName
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/^terrain[./]/, "");
  if (cache.has(name)) return cache.get(name);
  const p = entries[`terrain/${name}`];
  const colors = p
    ? [
        { r: p[0], g: p[1], b: p[2], a: p[3] },
        { r: p[0], g: p[1], b: p[2], a: p[4] },
        { r: 1, g: 1, b: 1, a: 0 },
        { r: 1, g: 1, b: 1, a: 0 },
      ]
    : undefined;
  cache.set(name, colors);
  return colors;
}
