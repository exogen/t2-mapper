/**
 * Convert .dts shapes under `docs/base` to glTF (all in one Blender run).
 * --new converts only those without a .glb.
 */
import { parseArgs } from "node:util";
import {
  convertWithBlender,
  findUnconverted,
  globSources,
} from "./lib/convert";

const { values } = parseArgs({
  options: {
    new: { type: "boolean", default: false },
  },
});

const all = await globSources("docs/base/**/*.dts");
const files = values.new ? await findUnconverted(all) : all;
if (files.length === 0) {
  console.log("No .dts files to convert.");
} else {
  console.log(`Found ${files.length} .dts file(s) to convert.`);
  convertWithBlender("dts", files);
}
