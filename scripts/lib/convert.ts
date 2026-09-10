/**
 * Audio conversion: .wav → .m4a via ffmpeg. Converted files sit beside their sources; the manifest resolves
 * them by swapping the extension.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { derivedPath } from "./assets";

export const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

const toolProbes = new Map<string, boolean>();

/** Whether a converter runs at all (its --version exits cleanly). */
export function toolAvailable(toolPath: string, versionFlag: string): boolean {
  let ok = toolProbes.get(toolPath);
  if (ok === undefined) {
    try {
      execFileSync(toolPath, [versionFlag], { stdio: "ignore" });
      ok = true;
    } catch {
      ok = false;
    }
    toolProbes.set(toolPath, ok);
  }
  return ok;
}

/**
 * Sources whose converted file is missing. Deliberately not an mtime
 * comparison: git stamps files with checkout time, so a fresh clone or
 * branch switch would make every source look newer than its sibling.
 * A changed source gets its derived file removed instead (see
 * planExtract), which lands it here.
 */
export async function findUnconverted(
  sourceFiles: string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const source of sourceFiles) {
    const derived = derivedPath(source);
    if (!derived) continue;
    try {
      await fs.stat(derived);
    } catch {
      out.push(source);
    }
  }
  return out;
}

export async function globSources(pattern: string): Promise<string[]> {
  const out: string[] = [];
  for await (const file of fs.glob(pattern)) out.push(file);
  return out.sort();
}

/**
 * The sample rates MPEG-4 AAC can represent.
 *
 * ffmpeg resamples anything else to the nearest of these on its own, and its
 * choice is not always one Apple's decoder will read back: a 4,500 Hz source
 * becomes 7,350 Hz, which CoreAudio rejects outright, so QuickLook and Safari
 * cannot play the result even though ffprobe calls the file valid. Resampling
 * an odd rate DOWN to a legal one is not reliable either — 11,127 Hz lands on
 * 11,025 Hz and CoreAudio then fails partway through the stream.
 */
const AAC_SAMPLE_RATES = new Set([
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350,
]);

/**
 * What a source at an unrepresentable rate is resampled to instead. High
 * enough to hold every odd rate in the game's audio without losing bandwidth,
 * and verified to decode in CoreAudio.
 */
const FALLBACK_SAMPLE_RATE = 22050;

/**
 * The rate to force for a source, or undefined to let ffmpeg pass the source
 * rate through untouched. Only sources AAC cannot represent are moved.
 */
export function outputSampleRate(sourceRate: number): number | undefined {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0) return undefined;
  return AAC_SAMPLE_RATES.has(sourceRate) ? undefined : FALLBACK_SAMPLE_RATE;
}

/**
 * The sample rate in a WAV file's `fmt ` chunk, or undefined if the header
 * cannot be read. Walks the RIFF chunk list rather than assuming `fmt `
 * comes first, since some of the game's files carry a LIST before it.
 */
export async function wavSampleRate(
  wavFile: string,
): Promise<number | undefined> {
  let head: Buffer;
  try {
    const handle = await fs.open(wavFile);
    try {
      head = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(head, 0, head.length, 0);
      head = head.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
  if (head.length < 44) return undefined;
  if (head.toString("latin1", 0, 4) !== "RIFF") return undefined;
  if (head.toString("latin1", 8, 12) !== "WAVE") return undefined;
  let offset = 12;
  while (offset + 8 <= head.length) {
    const id = head.toString("latin1", offset, offset + 4);
    const size = head.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      if (offset + 16 > head.length) return undefined;
      return head.readUInt32LE(offset + 12);
    }
    // Chunks are word-aligned: an odd size is followed by a pad byte.
    offset += 8 + size + (size % 2);
  }
  return undefined;
}

/**
 * The default AAC bitrate.
 *
 * The game's audio is 22,050 Hz mono, so the 96k this used to be was roughly
 * four times what the content needs — enough that a converted file often came
 * out LARGER than its source, since 77% of the .wav files are already IMA
 * ADPCM at ~88 kbps. 64k halves the corpus (83.8 MB -> 57.9 MB) and stays
 * clear of the coding artifacts that show up around 48k on the voice packs,
 * which are the worst case: AAC over already-lossy ADPCM.
 */
export const DEFAULT_BITRATE = "64k";

export interface WavConvertOptions {
  bitrate?: string;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function convertWav(
  files: string[],
  {
    bitrate = DEFAULT_BITRATE,
    concurrency = 8,
    onProgress,
  }: WavConvertOptions = {},
): Promise<{ completed: number; failed: string[] }> {
  let completed = 0;
  const failed: string[] = [];

  async function convert(wavFile: string) {
    const m4aFile = derivedPath(wavFile)!;
    const sourceRate = await wavSampleRate(wavFile);
    const forcedRate =
      sourceRate === undefined ? undefined : outputSampleRate(sourceRate);
    try {
      execFileSync(
        FFMPEG_PATH,
        [
          "-y",
          "-i",
          wavFile,
          "-c:a",
          "aac",
          ...(forcedRate === undefined ? [] : ["-ar", String(forcedRate)]),
          "-b:a",
          bitrate,
          "-movflags",
          "+faststart",
          "-vn",
          m4aFile,
        ],
        { stdio: "pipe" },
      );
      completed++;
    } catch (err: any) {
      failed.push(wavFile);
      const stderr: string = err.stderr?.toString().trim() ?? "";
      console.error(`  FAILED: ${wavFile}`);
      if (stderr) {
        // Show just the last line of ffmpeg output (the actual error).
        const lines = stderr.split("\n");
        console.error(`    ${lines[lines.length - 1]}`);
      }
    }
  }

  for (let i = 0; i < files.length; i += concurrency) {
    await Promise.all(files.slice(i, i + concurrency).map(convert));
    onProgress?.(Math.min(i + concurrency, files.length), files.length);
  }
  return { completed, failed };
}
