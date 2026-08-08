import { getMissionInfo } from "./manifest";
import { getUrlForPath } from "./loaders";

/**
 * Warms caches for the resources on the mission-load critical path before
 * the React tree and TorqueScript runtime get around to requesting them:
 * the .mis file, the root server script, and (after a light scan of the
 * .mis source) the terrain and sky files. Every fetch here lands in the
 * browser's HTTP cache, so the real loaders hit warm entries later. All
 * failures are swallowed — this is purely an optimization.
 */

function prefetch(url: string) {
  // Drain the body so the download completes and lands in the HTTP cache.
  fetch(url)
    .then((res) => res.arrayBuffer())
    .catch(() => {});
}

function prefetchPath(resourcePath: string) {
  try {
    prefetch(getUrlForPath(resourcePath));
  } catch {
    // Not in the manifest; the real loader will deal with it.
  }
}

/**
 * Scan raw .mis source for the heavyweight scene files it references.
 * Values are bare filenames; the same prefixes the real loaders use
 * (terrains/, textures/) resolve them in the manifest.
 */
function prefetchMissionResources(misSource: string) {
  const terrain = misSource.match(/terrainFile\s*=\s*"([^"]+)"/i);
  if (terrain) {
    const fileName = terrain[1].split("/").pop()!;
    prefetchPath(`terrains/${fileName}`);
  }
  const sky = misSource.match(/materialList\s*=\s*"([^"]+\.dml)"/i);
  if (sky) {
    const fileName = sky[1].split("/").pop()!;
    prefetchPath(`textures/${fileName}`);
  }
}

export function prefetchFromLocation() {
  const missionParam = new URLSearchParams(window.location.search).get(
    "mission",
  );
  // Matches the default mission in useQueryParams.
  const missionName = missionParam?.split("~")[0] || "RiverDance";

  prefetchPath("scripts/server.cs");

  let misUrl: string;
  try {
    misUrl = getUrlForPath(getMissionInfo(missionName).resourcePath);
  } catch {
    return;
  }
  // Fetch (rather than just warm) the .mis so its text can be scanned for
  // the terrain/sky files, which are otherwise requested seconds later.
  fetch(misUrl)
    .then((res) => (res.ok ? res.text() : ""))
    .then((source) => {
      if (source) prefetchMissionResources(source);
    })
    .catch(() => {});
}
