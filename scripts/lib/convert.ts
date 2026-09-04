/**
 * The asset conversions the app depends on: .dif/.dts → .glb via Blender
 * (one invocation per kind, all files at once) and .wav → .m4a via
 * ffmpeg. Converted files sit beside their sources; the manifest resolves
 * them by swapping the extension.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { derivedPath } from "./assets";

export const BLENDER_PATH =
  process.env.BLENDER_PATH ||
  "/Applications/Blender.app/Contents/MacOS/Blender";
export const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

const BLENDER_SCRIPTS = {
  dif: "scripts/blender/dif2gltf.py",
  dts: "scripts/blender/dts2gltf.py",
} as const;

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

/** Blender converts every file in one background run; output streams through. */
export function convertWithBlender(
  kind: keyof typeof BLENDER_SCRIPTS,
  files: string[],
): void {
  if (files.length === 0) return;
  execFileSync(
    BLENDER_PATH,
    ["--background", "--python", BLENDER_SCRIPTS[kind], "--", ...files],
    { stdio: "inherit" },
  );
}

export interface WavConvertOptions {
  bitrate?: string;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function convertWav(
  files: string[],
  { bitrate = "96k", concurrency = 8, onProgress }: WavConvertOptions = {},
): Promise<{ completed: number; failed: string[] }> {
  let completed = 0;
  const failed: string[] = [];

  async function convert(wavFile: string) {
    const m4aFile = derivedPath(wavFile)!;
    try {
      execFileSync(
        FFMPEG_PATH,
        [
          "-y",
          "-i",
          wavFile,
          "-c:a",
          "aac",
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
