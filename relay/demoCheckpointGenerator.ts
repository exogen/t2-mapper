/** Node-only offline replay; invoked in a child process by the relay. */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { setImmediate } from "node:timers/promises";
import { DemoParser } from "t2-demo-parser";
import {
  DemoStreamAdapter,
  createRecordingFromParser,
  extractMissionInfo,
} from "../src/stream/demoStreaming";
import { scanDemoTimelineParser } from "../src/stream/demoTimelineScanner";
import {
  DEMO_CHECKPOINT_VERSION,
  demoSha256,
  matchStartCheckpointTargets,
  readDemoCheckpoints,
  type DemoCheckpointSidecar,
} from "../src/stream/demoCheckpoints";
import { encodeCheckpoint, bytesToBase64 } from "../src/stream/checkpointCodec";
import { HeadlessWorld, type WorldEntity } from "../src/world/headlessWorld";
import { loadDtsScene } from "../src/dts/nodeDts";
import { getActualResourceKey, getSourceAndPath } from "../src/manifest";
import { registerShapeSequences } from "../src/stream/shapeSequences";
import { OCCLUDER_SHAPE_TYPES } from "../src/world/colliderPolicy";
import { ForceFieldState } from "../src/stream/forceFieldState";

export interface DemoCheckpointGenerationResult {
  version: number;
  demoBytes: number;
  demoSha256: string;
  count: number;
  bytes: number;
  elapsedMS: number;
  reused: boolean;
  peakRSSMiB?: number;
}

export async function generateDemoCheckpoints(
  input: string,
  output: string,
  assetRoot: string,
  progress: (event: unknown) => void = () => {},
  reuseExisting = true,
): Promise<DemoCheckpointGenerationResult> {
  if (
    [output, `${output}.tmp`].some(
      (target) => path.resolve(target) === path.resolve(input),
    )
  )
    throw new Error("Checkpoint output must not overwrite the demo");
  const bytes = await fs.readFile(input);
  const buffer = (
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        )
  ) as ArrayBuffer;
  const start = performance.now();
  if (reuseExisting) {
    try {
      const text = await fs.readFile(output, "utf8");
      await readDemoCheckpoints(text, buffer);
      const existing = JSON.parse(text) as DemoCheckpointSidecar;
      return {
        version: existing.version,
        demoBytes: existing.demoBytes,
        demoSha256: existing.demoSha256,
        count: existing.checkpoints.length,
        bytes: Buffer.byteLength(text),
        elapsedMS: performance.now() - start,
        reused: true,
      };
    } catch {
      // Missing, stale, or interrupted outputs are regenerated atomically.
    }
  }
  const parser = new DemoParser(new Uint8Array(buffer));
  await parser.load();
  const { recorderName } = extractMissionInfo(parser.initialBlock.demoValues);
  const { events } = await scanDemoTimelineParser(parser, recorderName);
  parser.reset();
  const recording = createRecordingFromParser(parser, { checkpoints: false });
  const targets = matchStartCheckpointTargets(events);
  progress({
    phase: "targets",
    input,
    targets: targets.map((target) => ({
      ...target,
      timeSec: target.tick * 0.032,
    })),
  });
  const sidecar: DemoCheckpointSidecar = {
    format: "t2-mapper-seek-checkpoints",
    version: DEMO_CHECKPOINT_VERSION,
    demoBytes: bytes.byteLength,
    demoSha256: await demoSha256(buffer),
    checkpoints: [],
  };
  const world = new HeadlessWorld({ assetRoot });
  try {
    await world.run(async () => {
      const stream = recording.streamingPlayback as DemoStreamAdapter;
      stream.setPlayerPredictionEnabled(true);
      const loadedShapes = new Set<string>();
      const collisionClasses = new Set([
        ...OCCLUDER_SHAPE_TYPES,
        "TerrainBlock",
        "InteriorInstance",
        "ForceFieldBare",
        "WaterBlock",
      ]);
      let preparedWorld = new Map<
        string,
        { sceneData: unknown; fieldOpen?: boolean }
      >();
      let preparedTicks = 0;
      let lastProgress = performance.now();
      for (const target of targets) {
        const checkpoint = await stream.captureCheckpointAt(
          target.tick,
          async (entities) => {
            const collisionEntities: WorldEntity[] = [];
            let worldChanged = false;
            for (const entity of entities) {
              if (!collisionClasses.has(entity.className)) continue;
              const fieldOpen =
                entity.className === "ForceFieldBare"
                  ? entity.forceFieldState === ForceFieldState.Open
                  : undefined;
              collisionEntities.push(
                entity.className === "ForceFieldBare"
                  ? { ...entity, fieldOpen }
                  : entity,
              );
              const previous = preparedWorld.get(entity.id);
              if (
                !previous ||
                previous.sceneData !== entity.sceneData ||
                previous.fieldOpen !== fieldOpen
              )
                worldChanged = true;
            }
            // Player/projectile updates do not change the static collision world.
            if (
              worldChanged ||
              collisionEntities.length !== preparedWorld.size
            ) {
              await world.sync(collisionEntities);
              preparedWorld = new Map(
                collisionEntities.map((entity) => [
                  entity.id,
                  { sceneData: entity.sceneData, fieldOpen: entity.fieldOpen },
                ]),
              );
            }
            if (world.stats().failedAssets)
              throw new Error(
                "Cannot generate accurate checkpoints with missing collision assets",
              );
            if (performance.now() - lastProgress > 10_000) {
              lastProgress = performance.now();
              progress({
                phase: "replay",
                preparedTicks,
                targetTick: target.tick,
                elapsedMS: lastProgress - start,
              });
            }
            if (preparedTicks % 512 === 0) await setImmediate();
            if (preparedTicks++ % 32 !== 0) return;
            for (const asset of stream.getPreloadAssets()) {
              if (asset.kind !== "shape" || loadedShapes.has(asset.name))
                continue;
              loadedShapes.add(asset.name);
              let key: string;
              try {
                key = getActualResourceKey(asset.name);
              } catch {
                continue;
              } // Missing cosmetic shapes use the same fallback as playback.
              const [source, actual] = getSourceAndPath(key);
              const file = source
                ? path.join(assetRoot, "@vl2", source, actual)
                : path.join(assetRoot, actual);
              const scene = await loadDtsScene(file);
              registerShapeSequences(asset.name, scene.animations);
            }
          },
        );
        const packed = gzipSync(encodeCheckpoint(checkpoint));
        sidecar.checkpoints.push({ ...target, data: bytesToBase64(packed) });
        progress({
          phase: "checkpoint",
          tick: target.tick,
          matchStartSec: target.matchStartSec,
          compressedBytes: packed.byteLength,
          elapsedMS: performance.now() - start,
        });
      }
    });
  } finally {
    world.dispose();
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(sidecar));
  await fs.rename(temporary, output);
  return {
    version: sidecar.version,
    demoBytes: sidecar.demoBytes,
    demoSha256: sidecar.demoSha256,
    count: sidecar.checkpoints.length,
    bytes: (await fs.stat(output)).size,
    elapsedMS: performance.now() - start,
    reused: false,
  };
}
