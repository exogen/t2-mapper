import manifest from "../public/manifest.json";

export function getSource(resourcePath: string) {
  const sources = manifest[resourcePath];
  if (sources && sources.length > 0) {
    return sources[sources.length - 1];
  } else {
    throw new Error(`Resource not found in manifest: ${resourcePath}`);
  }
}

export function getActualResourcePath(resourcePath: string) {
  if (manifest[resourcePath]) {
    return resourcePath;
  }
  const resourcePaths = getResourceList();
  const lowerCased = resourcePath.toLowerCase();

  // First, try exact case-insensitive match
  const foundLowerCase = resourcePaths.find(
    (s) => s.toLowerCase() === lowerCased
  );
  if (foundLowerCase) {
    return foundLowerCase;
  }

  // For paths with numeric suffixes (e.g., "generator0.png"), strip the number and try again
  // e.g., "generator0.png" -> "generator.png"
  const pathWithoutNumber = resourcePath.replace(/\d+(\.(png))$/i, "$1");
  const lowerCasedWithoutNumber = pathWithoutNumber.toLowerCase();

  if (pathWithoutNumber !== resourcePath) {
    // If we stripped a number, try to find the version without it
    const foundWithoutNumber = resourcePaths.find(
      (s) => s.toLowerCase() === lowerCasedWithoutNumber
    );
    if (foundWithoutNumber) {
      return foundWithoutNumber;
    }
  }

  const isTexture = resourcePath.startsWith("textures/");
  if (isTexture) {
    const foundNested = resourcePaths.find(
      (s) =>
        s
          .replace(
            /^(textures\/)((lush|desert|badlands|lava|ice|jaggedclaw|terrainTiles)\/)/,
            "$1"
          )
          .toLowerCase() === lowerCased
    );
    if (foundNested) {
      return foundNested;
    }
  }
  return resourcePath;
}

export function getResourceList() {
  return Object.keys(manifest).sort();
}

export function getFilePath(resourcePath: string) {
  const source = getSource(resourcePath);
  if (source) {
    return `public/base/@vl2/${source}/${resourcePath}`;
  } else {
    return `public/base/${resourcePath}`;
  }
}
