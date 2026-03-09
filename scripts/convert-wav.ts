import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

/**
 * Find all .wav files in `docs/base` and convert them to Opus OGG.
 * Converted .ogg files are placed alongside the originals (analogous to
 * how convert-dts.ts places .glb files alongside .dts files). The manifest
 * ignores .ogg files; audioToUrl() swaps the extension at resolution time.
 */
async function run({
  onlyNew,
  bitrate,
  concurrency,
}: {
  onlyNew: boolean;
  bitrate: string;
  concurrency: number;
}) {
  const inputFiles: string[] = [];
  for await (const wavFile of fs.glob("docs/base/**/*.{wav,WAV}")) {
    const oggFile = wavFile.replace(/\.wav$/i, ".ogg");
    if (onlyNew) {
      try {
        await fs.stat(oggFile);
        continue; // .ogg already exists, skip
      } catch  { /* expected */ }
    }
    inputFiles.push(wavFile);
  }

  if (inputFiles.length === 0) {
    console.log("No .wav files to convert.");
    return;
  }

  console.log(
    `Converting ${inputFiles.length} .wav file(s) to Opus OGG (${bitrate})…`,
  );

  let completed = 0;
  let failed = 0;

  async function convert(wavFile: string) {
    const oggFile = wavFile.replace(/\.wav$/i, ".ogg");
    try {
      execFileSync(
        FFMPEG_PATH,
        [
          "-y",
          "-i",
          wavFile,
          "-c:a",
          "libopus",
          "-b:a",
          bitrate,
          "-vn",
          oggFile,
        ],
        { stdio: "pipe" },
      );
      completed++;
    } catch (err: any) {
      failed++;
      const stderr = err.stderr?.toString().trim();
      console.error(`  FAILED: ${wavFile}`);
      if (stderr) {
        // Show just the last line of ffmpeg output (the actual error).
        const lines = stderr.split("\n");
        console.error(`    ${lines[lines.length - 1]}`);
      }
    }
  }

  // Process in batches for parallelism.
  for (let i = 0; i < inputFiles.length; i += concurrency) {
    const batch = inputFiles.slice(i, i + concurrency);
    await Promise.all(batch.map(convert));
    const total = Math.min(i + concurrency, inputFiles.length);
    process.stdout.write(`\r  ${total}/${inputFiles.length}`);
  }
  process.stdout.write("\n");

  console.log(`Done: ${completed} converted, ${failed} failed.`);
}

const { values } = parseArgs({
  options: {
    new: {
      type: "boolean",
      default: false,
      short: "n",
    },
    bitrate: {
      type: "string",
      default: "64k",
      short: "b",
    },
    concurrency: {
      type: "string",
      default: "8",
      short: "j",
    },
  },
});

run({
  onlyNew: values.new!,
  bitrate: values.bitrate!,
  concurrency: parseInt(values.concurrency!, 10) || 8,
});
