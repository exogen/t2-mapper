import { textureToUrl } from "../loaders";

const SKIN_BASE_URL = "https://assets.tribes2.online/skins/files/";
const SKIN_MANIFEST_URL = "https://assets.tribes2.online/skins/manifest.json";

/** Map shape DTS name to skin texture suffix. */
const SKIN_SUFFIXES: Record<string, string> = {
  "light_male.dts": "lmale",
  "light_female.dts": "lfemale",
  "medium_male.dts": "mmale",
  "medium_female.dts": "mfemale",
  "heavy_male.dts": "hmale",
  "bioderm_light.dts": "lbioderm",
  "bioderm_medium.dts": "mbioderm",
  "bioderm_heavy.dts": "hbioderm",
};

/** Processed custom skin manifest: suffix → Set of available skin names. */
type SkinLookup = Record<string, Set<string>>;

let manifest: SkinLookup | undefined;
let pending: Promise<SkinLookup | undefined> | undefined;

async function fetchSkinManifest(): Promise<SkinLookup> {
  const res = await fetch(SKIN_MANIFEST_URL);
  if (!res.ok) throw new Error(`${res.status}`);
  const raw: { customSkins?: Record<string, string[]> } = await res.json();
  const lookup: SkinLookup = {};
  if (raw.customSkins) {
    for (const [suffix, names] of Object.entries(raw.customSkins)) {
      lookup[suffix] = new Set(names);
    }
  }
  return lookup;
}

/**
 * Fetch the custom skin manifest (once, with one retry). Prefetched at
 * app startup so player models usually find it already loaded.
 */
export function loadSkinManifest(): Promise<SkinLookup | undefined> {
  pending ??= fetchSkinManifest()
    .catch(() => fetchSkinManifest())
    .then(
      (lookup) => (manifest = lookup),
      () => undefined,
    );
  return pending;
}

/**
 * A player's skin texture URL: the local manifest first (built-in skins
 * like beagle, swolf, baseb), then the remote custom skin manifest.
 */
export function resolvePlayerSkinUrl(
  shapeName: string,
  skin: string | undefined,
): string | undefined {
  if (!skin || skin === "base") return undefined;
  const suffix = SKIN_SUFFIXES[shapeName.toLowerCase()];
  if (!suffix) return undefined;
  try {
    return textureToUrl(`skins/${skin}.${suffix}`, null);
  } catch {
    // Not in local manifest.
  }
  if (manifest?.[suffix]?.has(skin)) {
    return `${SKIN_BASE_URL}${skin}.${suffix}.png`;
  }
  return undefined;
}
