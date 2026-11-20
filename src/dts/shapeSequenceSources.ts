import { getResourceMap } from "../manifest";
import { shapeKey } from "../stream/shapeSequences";

const sequencePaths = new WeakMap<
  ReturnType<typeof getResourceMap>,
  readonly string[]
>();

/** The named DSQs imported alongside a native shape in both environments. */
export function shapeSequenceSources(shapeName: string) {
  const stem = shapeKey(shapeName).replace(/\.dts$/, "");
  const prefix = `shapes/${stem}_`;
  const resources = getResourceMap();
  let paths = sequencePaths.get(resources);
  if (!paths) {
    paths = Object.keys(resources)
      .filter((path) => path.startsWith("shapes/") && path.endsWith(".dsq"))
      .sort();
    sequencePaths.set(resources, paths);
  }
  return paths
    .filter((path) => path.startsWith(prefix))
    .map((path) => ({ path, name: path.slice(prefix.length, -4) }));
}
