import { HeadlessWorld } from "../src/world/headlessWorld";
import { cloneData } from "../src/cloneData";
import {
  createLiveCastPlanner,
  type LiveCastPlannerFrame,
} from "../src/director/liveCastPlanner";
import { LiveStreamAdapter } from "../src/stream/liveStreaming";
import type { RelayClient } from "../src/stream/relayClient";
import type { DirectorEntity, DirectorSnapshot } from "../src/stream/types";
import type {
  LiveCastWorkerRequest,
  LiveCastWorkerResourceSample,
  LiveCastWorkerResponse,
} from "./liveCastProcess.js";
import {
  LIVE_CAST_METRICS_INTERVAL_MS,
  type LiveCastIdentity,
  type LiveCastShotStart,
  type LiveCastWorldTick,
} from "./liveCastTypes.js";

const [assetRoot, lookaheadArgument] = process.argv.slice(2);
const lookaheadMs = Number(lookaheadArgument);

/** The relay seals each source tick after collecting the preceding tick's packets. */
class CastSourceStream extends LiveStreamAdapter {
  protected override presentationEffectsEnabled = false;
  protected override captureDirectorImpacts = true;
  private readonly sourceTick: number;
  private readFrameSnapshot?: () => DirectorSnapshot;
  private endedDirectorEntities?: DirectorEntity[];
  private parseError?: Error;

  constructor(sourceTick: number) {
    super({} as RelayClient, { mode: "watch" });
    this.sourceTick = sourceTick;
    this.onParseFault = ({ stage, message }) => {
      this.parseError = new Error(`${stage} parse fault: ${message}`);
    };
  }

  protected override seedHydration(): void {
    this.tickCount = this.sourceTick;
  }

  protected override freezeMatchEndEntities(): void {
    this.endedDirectorEntities = cloneData(this.buildDirectorEntities());
  }

  getDirectorSnapshot(): DirectorSnapshot {
    return this.buildDirectorSnapshot(
      this.matchEnded ? this.endedDirectorEntities : undefined,
    );
  }

  readTick({
    tick,
    packets,
  }: LiveCastWorldTick): LiveCastPlannerFrame | undefined {
    if (tick <= this.tickCount) return;
    if (tick > this.tickCount + 1) {
      // A decision inside a gap uses the last available source frame.
      this.readFrameSnapshot?.();
      if (packets.length) this.advanceToTick(tick - 1);
    }
    for (const packet of packets) {
      this.feedPacket(packet);
      if (this.parseError) throw this.parseError;
    }
    this.advanceToTick(tick);

    let snapshot: DirectorSnapshot | undefined;
    const readSnapshot = () => {
      if (!snapshot) {
        if (this.tickCount !== tick)
          throw new Error(
            `Cannot build a CastGenius snapshot for prior tick ${tick}`,
          );
        snapshot = this.getDirectorSnapshot();
      }
      return snapshot;
    };
    this.readFrameSnapshot = readSnapshot;
    return {
      tick,
      matchPhase: this.conn.matchPhase,
      get snapshot() {
        return readSnapshot();
      },
    };
  }
}

interface CastMatch {
  identity: LiveCastIdentity;
  world: HeadlessWorld;
  stream: CastSourceStream;
  planner: ReturnType<typeof createLiveCastPlanner>;
  publishedThroughTick: number;
  finished: boolean;
}

let current: CastMatch | undefined;
let nextResourceSampleMs = 0;

function send(message: LiveCastWorkerResponse): void {
  process.send?.(message);
}

function sampleResources(): LiveCastWorkerResourceSample | undefined {
  const elapsedMs = performance.now();
  if (elapsedMs < nextResourceSampleMs) return;
  nextResourceSampleMs = elapsedMs + LIVE_CAST_METRICS_INTERVAL_MS;
  const { user, system } = process.cpuUsage();
  return {
    elapsedMs,
    cpuMicros: user + system,
    rssBytes: process.memoryUsage.rss(),
  };
}

function publish(
  cast: CastMatch,
  shots: readonly LiveCastShotStart[],
  ended = false,
): void {
  const { plannedThroughTick } = cast.planner;
  if (
    !ended &&
    !shots.length &&
    plannedThroughTick <= cast.publishedThroughTick
  )
    return;
  cast.publishedThroughTick = plannedThroughTick;
  send({
    type: "plan",
    plan: {
      ...cast.identity,
      plannedThroughTick,
      shots: shots.map(({ startTick, shot }) => ({ startTick, shot })),
      ...(ended && { ended: true }),
    },
  });
}

async function finish(
  cast: CastMatch,
  shots: readonly LiveCastShotStart[] = [],
): Promise<void> {
  if (cast.finished) return;
  cast.finished = true;
  try {
    const tail = await cast.world.run(() => cast.planner.finish());
    publish(cast, [...shots, ...tail], true);
  } finally {
    cast.world.dispose();
  }
}

async function handle(request: LiveCastWorkerRequest): Promise<void> {
  switch (request.type) {
    case "hydrate": {
      if (current)
        throw new Error("Live CastGenius worker was already hydrated");
      const { payload, sourceTick: tick, gameId } = request;
      const identity = { gameId, epoch: payload.epoch };
      const world = new HeadlessWorld({ assetRoot });
      const stream = new CastSourceStream(tick);
      stream.setProjectileShapeLoader((name) =>
        world.loadProjectileShapeData(name),
      );
      const snapshot = await world.run(() => {
        stream.hydrate(payload);
        return stream.getDirectorSnapshot();
      });
      let syncedSnapshot: DirectorSnapshot | undefined;
      const planner = createLiveCastPlanner({
        startTick: tick,
        lookaheadSec: lookaheadMs / 1_000,
        metadata: {
          gameClassName: stream.gameClassName,
          missionName: stream.missionName,
          missionDisplayName: stream.missionDisplayName,
          gameType: stream.missionTypeDisplayName ?? null,
          serverDisplayName: stream.serverDisplayName,
        },
        withWorld: async (snapshot, operation) => {
          if (syncedSnapshot !== snapshot) {
            await world.sync(snapshot.entities);
            syncedSnapshot = snapshot;
          }
          return world.run(operation);
        },
      });
      const cast: CastMatch = {
        identity,
        world,
        stream,
        planner,
        publishedThroughTick: tick - 1,
        finished: false,
      };
      current = cast;
      publish(
        cast,
        await planner.pushFrame({
          tick,
          snapshot,
          matchPhase: snapshot.matchPhase,
        }),
      );
      break;
    }
    case "tick": {
      const cast = current;
      if (
        !cast ||
        cast.finished ||
        cast.identity.gameId !== request.gameId ||
        cast.identity.epoch !== request.epoch
      )
        return;
      const { stream, world } = cast;
      await world.run(async () => {
        const frame = stream.readTick(request);
        if (!frame) return;
        const shots = await cast.planner.pushFrame(frame);
        if (stream.matchEnded) await finish(cast, shots);
        else publish(cast, shots);
      });
      break;
    }
    case "close":
      if (current) await finish(current);
      break;
  }
}

// The parent only sends the next request after the current one finishes.
process.on("message", (request: LiveCastWorkerRequest) => {
  void handle(request).then(
    () => {
      const resources = sampleResources();
      send(resources ? { type: "ack", resources } : { type: "ack" });
    },
    (error: unknown) => {
      console.error("Live CastGenius worker failed", error);
      process.exitCode = 1;
      process.disconnect?.();
    },
  );
});
