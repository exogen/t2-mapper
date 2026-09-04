/**
 * Loading a demo the way the app does, from a script: the recording,
 * the headless collision world built at the first frame with a scene,
 * and the director's cast or dataset run against it.
 */
import fs from "node:fs";
import { createDemoStreamingRecording } from "@/src/stream/demoStreaming";
import { scanDemoDirector } from "@/src/stream/demoDirectorScanner";
import {
  runCastPipeline,
  type CastPipelineResult,
} from "@/src/director/castPipeline";
import { HeadlessWorld } from "@/src/world/headlessWorld";

export type DemoRecording = Awaited<
  ReturnType<typeof createDemoStreamingRecording>
>;

/** A .rec file as the ArrayBuffer the stream engine takes. */
export function readDemo(path: string): ArrayBuffer {
  const buf = fs.readFileSync(path);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

/**
 * Build (or fill) a world at the first frame with a scene to render —
 * where the app itself sits after loading a demo, so scripts stage
 * against the same geometry the browser does.
 */
export async function loadWorld(
  demo: ArrayBuffer,
  world = new HeadlessWorld(),
  recording?: DemoRecording,
): Promise<{
  world: HeadlessWorld;
  recording: DemoRecording;
  readySec: number;
}> {
  const rec = recording ?? (await createDemoStreamingRecording(demo));
  const readySec = rec.streamingPlayback.findSceneReadyTime();
  await world.sync(
    rec.streamingPlayback.stepToTime(readySec).entities as never,
  );
  return { world, recording: rec, readySec };
}

/** The `ensureWorld` hook the cast pipeline calls before anything
 *  raycasts. */
export function ensureWorldFor(
  world: HeadlessWorld,
  demo: ArrayBuffer,
): () => Promise<void> {
  return async () => {
    await loadWorld(demo, world);
  };
}

/**
 * Cast a demo headlessly: the same pipeline the app streams, driven to
 * the end inside its own collision world. The world is returned so a
 * caller can keep raycasting against it with `world.run`.
 */
export async function castDemo(
  demo: ArrayBuffer,
  world = new HeadlessWorld(),
): Promise<CastPipelineResult & { world: HeadlessWorld }> {
  const result = await world.run(() =>
    runCastPipeline(demo, { ensureWorld: ensureWorldFor(world, demo) }),
  );
  return { ...result, world };
}

/** The director's dataset alone — events, samples, match facts — with
 *  no world built, for probes that never raycast. */
export function scanDemo(demo: ArrayBuffer) {
  return scanDemoDirector(demo);
}
