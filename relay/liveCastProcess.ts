import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import type { WatchCatchupPayload } from "./types.js";
import type {
  CreateLiveCastFeed,
  LiveCastIdentity,
  LiveCastMetrics,
  LiveCastPlanBatch,
  LiveCastPlannerFeed,
  LiveCastWorkerMetrics,
  LiveCastWorldTick,
} from "./liveCastTypes.js";

export type LiveCastWorkerRequest =
  | {
      type: "hydrate";
      payload: WatchCatchupPayload;
      sourceTick: number;
      gameId: string;
    }
  | ({ type: "tick" } & LiveCastWorldTick)
  | { type: "close" };

export interface LiveCastWorkerResourceSample {
  elapsedMs: number;
  cpuMicros: number;
  rssBytes: number;
}

export type LiveCastWorkerResponse =
  | { type: "ack"; resources?: LiveCastWorkerResourceSample }
  | { type: "plan"; plan: LiveCastPlanBatch };

export interface LiveCastFeedFactory extends CreateLiveCastFeed {
  getMetrics(): LiveCastMetrics;
}

interface LiveCastFeed extends LiveCastPlannerFeed {
  getMetrics(): LiveCastWorkerMetrics | undefined;
}

const MAX_PENDING_TICKS = 32 * 60;
const WORKER_TIMEOUT_MS = 30_000;
const WORKER_MEMORY_BUDGET = 512 * 1024 * 1024;
const RELAY_MEMORY_RESERVE = 256 * 1024 * 1024;
const WORKER_STARTUP_CPU = 25;

export function createLiveCastFeedFactory(
  assetRoot: string,
  lookaheadMs: number,
): LiveCastFeedFactory {
  const active = new Set<LiveCastFeed>();
  const cpuBudget = availableParallelism() * 75;
  let lastSample = performance.eventLoopUtilization();
  let relayLoad = 0;

  function hasHeadroom(): boolean {
    const sample = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(sample, lastSample);
    if (delta.active + delta.idle >= 1_000) {
      relayLoad = delta.utilization * 100;
      lastSample = sample;
    }
    let memoryNeeded = RELAY_MEMORY_RESERVE + WORKER_MEMORY_BUDGET;
    let cpuNeeded = relayLoad + WORKER_STARTUP_CPU;
    for (const feed of active) {
      const usage = feed.getMetrics();
      // Free memory already accounts for each worker's current RSS.
      memoryNeeded += Math.max(
        0,
        WORKER_MEMORY_BUDGET - (usage?.rssBytes ?? 0),
      );
      cpuNeeded += usage?.cpuPercent ?? WORKER_STARTUP_CPU;
    }
    return process.availableMemory() >= memoryNeeded && cpuNeeded <= cpuBudget;
  }

  function createFeed(
    emitPlan: (plan: LiveCastPlanBatch) => void,
    onFailure: (error: Error) => void,
  ) {
    if (!hasHeadroom()) return;
    const feed = createLiveCastFeed(
      assetRoot,
      lookaheadMs,
      emitPlan,
      onFailure,
      () => active.delete(feed),
    );
    active.add(feed);
    return feed;
  }
  return Object.assign(createFeed, {
    getMetrics: (): LiveCastMetrics => ({
      activeWorkers: active.size,
      workers: [...active].flatMap((feed) => feed.getMetrics() ?? []),
    }),
  });
}

/** An isolated, ordered consumer. Its work never blocks watcher fan-out. */
function createLiveCastFeed(
  assetRoot: string,
  lookaheadMs: number,
  emitPlan: (plan: LiveCastPlanBatch) => void,
  onFailure: (error: Error) => void,
  onExit: () => void,
): LiveCastFeed {
  const child = fork(
    new URL("./liveCastWorker.ts", import.meta.url),
    [assetRoot, String(lookaheadMs)],
    {
      execArgv: ["--import=tsx/esm", "--max-old-space-size=256"],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    },
  );
  const pending: LiveCastWorkerRequest[] = [];
  let identity: LiveCastIdentity | undefined;
  let inFlight:
    { kind: LiveCastWorkerRequest["type"]; sourceTick?: number } | undefined;
  let closing = false;
  let stopped = false;
  let finalPlan = false;
  let closeTimeout: ReturnType<typeof setTimeout> | undefined;
  let responseTimeout: ReturnType<typeof setTimeout> | undefined;
  let sourceTick = 0;
  let processedThroughTick: number | null = null;
  let plannedThroughTick: number | null = null;
  let resources: LiveCastWorkerResourceSample | undefined;
  let cpuPercent: number | null = null;
  let sampledAtMs: number | null = null;
  let resolveDrain: () => void;
  const drained = new Promise<void>((resolve) => {
    resolveDrain = resolve;
  });
  let exited = false;

  function release(): void {
    if (exited) return;
    exited = true;
    onExit();
    resolveDrain();
  }

  function stop(error?: Error): void {
    if (stopped) return;
    stopped = true;
    clearTimeout(closeTimeout);
    clearTimeout(responseTimeout);
    pending.length = 0;
    if (child.connected) child.disconnect();
    if (error) {
      child.kill();
      if (!finalPlan) onFailure(error);
    }
  }

  function pump(): void {
    if (stopped || inFlight) return;
    const request = pending.shift();
    if (!request) {
      if (closing) stop();
      return;
    }
    inFlight = { kind: request.type };
    if (request.type === "hydrate") inFlight.sourceTick = request.sourceTick;
    else if (request.type === "tick" && isCurrentTick(request))
      inFlight.sourceTick = request.tick;
    responseTimeout = setTimeout(() => {
      stop(
        new Error(`Live CastGenius worker did not acknowledge ${request.type}`),
      );
    }, WORKER_TIMEOUT_MS);
    responseTimeout.unref();
    try {
      child.send(request, (error) => {
        if (error) stop(error);
      });
    } catch (error) {
      stop(error instanceof Error ? error : new Error(String(error)));
    }
  }

  function enqueue(request: LiveCastWorkerRequest): void {
    if (stopped) return;
    if (pending.length >= MAX_PENDING_TICKS) {
      stop(new Error("Live CastGenius worker fell behind its tick queue"));
      return;
    }
    pending.push(request);
    pump();
  }

  function isCurrentTick(world: LiveCastWorldTick): boolean {
    return world.gameId === identity?.gameId && world.epoch === identity?.epoch;
  }

  function recordResources(sample: LiveCastWorkerResourceSample): void {
    const elapsedMs = sample.elapsedMs - (resources?.elapsedMs ?? 0);
    const cpuMs = (sample.cpuMicros - (resources?.cpuMicros ?? 0)) / 1_000;
    cpuPercent = elapsedMs > 0 ? (cpuMs / elapsedMs) * 100 : null;
    resources = sample;
    sampledAtMs = Date.now();
  }

  child.on("message", (message: LiveCastWorkerResponse) => {
    if (stopped) return;
    if (message.type === "plan") {
      plannedThroughTick = message.plan.plannedThroughTick;
      finalPlan = message.plan.ended === true;
      emitPlan(message.plan);
      return;
    }
    // Node's watch mode can report module dependencies on this channel too.
    if (message.type !== "ack") return;
    clearTimeout(responseTimeout);
    if (inFlight?.sourceTick !== undefined)
      processedThroughTick = Math.max(
        processedThroughTick ?? 0,
        inFlight.sourceTick,
      );
    inFlight = undefined;
    if (message.resources) recordResources(message.resources);
    if (finalPlan) {
      stop();
      return;
    }
    pump();
  });
  child.on("error", (error) => {
    stop(error);
    if (!child.pid) release();
  });
  child.on("exit", (code, signal) => {
    stop(new Error(`Live CastGenius worker exited (${signal ?? code})`));
    release();
  });
  child.on("disconnect", () =>
    stop(new Error("Live CastGenius worker disconnected")),
  );

  return {
    hydrate(payload, tick, gameId) {
      if (closing || stopped) return;
      if (identity)
        throw new Error("Live CastGenius feed was already hydrated");
      identity = { gameId, epoch: payload.epoch };
      sourceTick = tick;
      enqueue({
        type: "hydrate",
        payload,
        sourceTick: tick,
        gameId,
      });
    },
    tick(world) {
      if (!identity || closing || stopped) return;
      if (isCurrentTick(world)) sourceTick = Math.max(sourceTick, world.tick);
      enqueue({ type: "tick", ...world });
    },
    close() {
      if (closing || stopped) return drained;
      closing = true;
      closeTimeout = setTimeout(() => {
        stop(new Error("Live CastGenius worker did not finish draining"));
      }, WORKER_TIMEOUT_MS);
      closeTimeout.unref();
      enqueue({ type: "close" });
      return drained;
    },
    getMetrics() {
      if (!identity) return;
      return {
        ...identity,
        cpuPercent,
        rssBytes: resources?.rssBytes ?? null,
        sampledAtMs,
        sourceTick,
        processedThroughTick,
        plannedThroughTick,
        pendingTicks: pending.reduce(
          (count, request) => count + Number(request.type === "tick"),
          Number(inFlight?.kind === "tick"),
        ),
      };
    },
  };
}
