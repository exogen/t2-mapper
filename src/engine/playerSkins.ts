import { textureToUrl } from "../loaders";
import { settingsStore } from "../state/settingsStore";

const SKIN_BASE_URL = "https://assets.tribes2.online/skins/files/";
const SKIN_MANIFEST_URL = "https://assets.tribes2.online/skins/manifest.json";

/** Model suffixes used by the separate custom-skin bucket. */
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

/** Tribes2.exe 0x005eff80 builds one hi-res filename under skins/. */
function hiResSkinBasename(basename: string): string {
  const dot = basename.indexOf(".");
  const skin = basename.slice(0, dot);
  const model = basename.slice(dot + 1);
  switch (skin) {
    case "basebot":
    case "basebbot":
      return `${skin === "basebot" ? "a" : "b"}.${model[0]}robot_512`;
    case "base":
    case "baseb":
      if (model.slice(1) === "bioderm")
        return `${skin === "base" ? "a" : "b"}.${model}_512`;
      break;
    case "horde":
      return `base.${model}_512`;
    case "cotp":
    case "swolf":
      return `${skin}_${model}_512`;
    case "dsword":
      return `ds.${model}_512`;
  }
  return `${basename}_512`;
}

const builtInUrls = {
  hd: new Map<string, string | undefined>(),
  stock: new Map<string, string | undefined>(),
};

function builtInSkinUrl(path: string): string | undefined {
  const urls = settingsStore.getState().hdTexturesEnabled
    ? builtInUrls.hd
    : builtInUrls.stock;
  if (!urls.has(path)) {
    let url: string | undefined;
    try {
      url = textureToUrl(path, null);
    } catch {
      // A missing candidate is a normal part of skin selection.
    }
    urls.set(path, url);
  }
  return urls.get(path);
}

interface SkinLookup {
  byModel: Record<string, Set<string>>;
  sizeMultiplier: Record<string, number>;
}

let manifest: SkinLookup | undefined;
let pending: Promise<SkinLookup | undefined> | undefined;

async function fetchSkinManifest(): Promise<SkinLookup> {
  const res = await fetch(SKIN_MANIFEST_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const raw: {
    customSkins?: Record<string, string[]>;
    sizeMultiplier?: Record<string, number>;
  } = await res.json();
  const byModel: SkinLookup["byModel"] = {};
  for (const [suffix, names] of Object.entries(raw.customSkins ?? {})) {
    byModel[suffix] = new Set(names);
  }
  return { byModel, sizeMultiplier: raw.sizeMultiplier ?? {} };
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

interface SkinChoice {
  name: string;
  customBasename?: string;
}

export interface PlayerSkinSelection {
  preferred?: SkinChoice;
  team?: SkinChoice;
}

export function getPlayerSkinSelection(
  shapeName: string,
  preferredSkin: string | undefined,
  teamSkin?: string,
): PlayerSkinSelection {
  const model = SKIN_SUFFIXES[shapeName.toLowerCase()];
  function choice(name: string | undefined): SkinChoice | undefined {
    if (!name) return undefined;
    const skinName = name.toLowerCase();
    const customBasename = manifest?.byModel[model]?.has(name)
      ? `${name}.${model}`
      : undefined;
    return { name: skinName, customBasename };
  }
  return { preferred: choice(preferredSkin), team: choice(teamSkin) };
}

/**
 * Gameplay (0x005e76f0) tries the preferred skin, then the regular team skin.
 * The profile preview (0x0067cfd0) supplies only the preferred skin.
 */
export function playerSkinUrls(
  resourcePath: string,
  { preferred, team }: PlayerSkinSelection,
): string[] {
  const base = resourcePath.indexOf("base.");
  if (base < 0 || resourcePath.length <= 5) return [];
  const prefix = resourcePath.slice(0, base).toLowerCase();
  const suffix = resourcePath.slice(base + 4).toLowerCase();
  const { hdTexturesEnabled } = settingsStore.getState();
  const customUrl = ({ customBasename }: SkinChoice) => {
    if (!customBasename || !manifest) return;
    // The skin catalog publishes a prepared @1x copy for each HD original.
    const variant =
      !hdTexturesEnabled && manifest.sizeMultiplier[`${customBasename}.png`] > 1
        ? "@1x"
        : "";
    return `${SKIN_BASE_URL}${encodeURIComponent(customBasename)}${variant}.png`;
  };
  const urls: string[] = [];
  if (preferred) {
    const path = prefix + preferred.name + suffix;
    if (hdTexturesEnabled && path.startsWith("skins/")) {
      const hiRes = builtInSkinUrl("skins/" + hiResSkinBasename(path.slice(6)));
      if (hiRes) urls.push(hiRes);
    }
    const regular = builtInSkinUrl(path);
    if (regular) urls.push(regular);
    else {
      const custom = customUrl(preferred);
      // A failed bucket download uses the authored texture, as before.
      if (custom) {
        urls.push(custom);
        return urls;
      }
    }
  }
  if (team) {
    const regular =
      builtInSkinUrl(prefix + team.name + suffix) ?? customUrl(team);
    if (regular) urls.push(regular);
  }
  return urls;
}
