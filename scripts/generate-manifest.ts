/**
 * Regenerate the resource manifest from `docs/base` (or BASE_DIR). Logs
 * every resource with its sources unless --quiet; writes nothing without
 * -o. Mount transforms are extracted from the native DTS shape data.
 *
 *   npm run build:manifest [-- --quiet]
 */
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { buildManifest, serializeManifest } from "./lib/manifest";

const { values } = parseArgs({
  options: {
    output: { type: "string", short: "o" },
    quiet: { type: "boolean", short: "q", default: false },
  },
});

const { manifest } = await buildManifest({
  baseDir: process.env.BASE_DIR,
  onResource: values.quiet
    ? undefined
    : (_key, [firstSeenPath, ...sourceTuples]) => {
        console.log(
          `${firstSeenPath}${sourceTuples[0][0] ? ` 📦 ${sourceTuples[0][0]}` : ""}${
            sourceTuples.length > 1
              ? sourceTuples
                  .slice(1)
                  .map((tuple) => ` ❗️ ${tuple[0]}`)
                  .join("")
              : ""
          }`,
        );
      },
});

console.log(
  `${Object.keys(manifest.resources).length} resources, ` +
    `${Object.keys(manifest.missions).length} missions, ` +
    `${Object.keys(manifest.mounts).length} shapes with mount nodes`,
);
if (values.output) {
  await fs.writeFile(values.output, serializeManifest(manifest), "utf8");
  console.log(`Wrote ${values.output}`);
}
