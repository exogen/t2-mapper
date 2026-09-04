/**
 * Convert .wav files under `docs/base` to AAC M4A, placed alongside the
 * originals (like .glb beside .dts). The manifest ignores .m4a files;
 * audioToUrl() swaps the extension at resolution time. --new converts
 * only those without an .m4a.
 */
import { parseArgs } from "node:util";
import { convertWav, findUnconverted, globSources } from "./lib/convert";

const { values } = parseArgs({
  options: {
    new: { type: "boolean", default: false, short: "n" },
    bitrate: { type: "string", default: "96k", short: "b" },
    concurrency: { type: "string", default: "8", short: "j" },
  },
});

const all = await globSources("docs/base/**/*.{wav,WAV}");
const files = values.new ? await findUnconverted(all) : all;
if (files.length === 0) {
  console.log("No .wav files to convert.");
} else {
  console.log(
    `Converting ${files.length} .wav file(s) to AAC M4A (${values.bitrate})…`,
  );
  const { completed, failed } = await convertWav(files, {
    bitrate: values.bitrate,
    concurrency: parseInt(values.concurrency!, 10) || 8,
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });
  process.stdout.write("\n");
  console.log(`Done: ${completed} converted, ${failed.length} failed.`);
  if (failed.length > 0) process.exitCode = 1;
}
