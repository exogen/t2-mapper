import { MOVE_TICK_MS } from "./moveList.js";
import type {
  CreateLiveCastFeed,
  LiveCastIdentity,
  LiveCastPlanBatch,
  LiveCastPlannerFeed,
} from "./liveCastTypes.js";
import type { WatchCatchupPayload } from "./types.js";
import { relayLog } from "./logger.js";

const INITIAL_RETRY_MS = 3_000;
const MAX_RETRY_MS = 60_000;

interface PlannerSessionOptions extends LiveCastIdentity {
  address: string;
  createFeed: CreateLiveCastFeed;
  buildCatchup(): WatchCatchupPayload;
  publish(plan: LiveCastPlanBatch): void;
  setAdmitted(admitted: boolean): void;
}

/** Owns worker recovery for one game. A draining worker can still publish its tail. */
export class LiveCastPlannerSession {
  private readonly options: PlannerSessionOptions;
  private feed?: LiveCastPlannerFeed;
  private tick = 0;
  private retryAtTick = 0;
  private retryMs = INITIAL_RETRY_MS;
  private ending = false;
  private finished = false;

  constructor(options: PlannerSessionOptions) {
    this.options = options;
  }

  advance(
    tick: number,
    packets: Uint8Array[],
    { canStart, matchEnded }: { canStart: boolean; matchEnded: boolean },
  ): void {
    this.tick = tick;
    this.ending ||= matchEnded;
    if (this.finished) return;
    try {
      if (this.feed) {
        const { gameId, epoch } = this.options;
        this.feed.tick({
          gameId,
          epoch,
          tick,
          packets,
        });
      } else if (this.ending) this.finish();
      else if (canStart && this.tick >= this.retryAtTick) this.start();
    } catch (err) {
      this.failed(err);
    }
  }

  close(supported: boolean): void {
    this.ending = true;
    if (this.feed) void this.drain(this.feed);
    else if (supported) this.finish();
  }

  private start(): void {
    const { createFeed, publish, buildCatchup, gameId, setAdmitted } =
      this.options;
    const feed = createFeed(
      (plan) => {
        if (this.feed !== feed || this.finished) return;
        if (plan.shots.length) this.retryMs = INITIAL_RETRY_MS;
        if (plan.ended) this.finished = true;
        publish(plan);
      },
      (err) => {
        if (this.feed === feed) this.failed(err);
      },
    );
    if (!feed) {
      this.scheduleRetry();
      return;
    }
    this.feed = feed;
    feed.hydrate(buildCatchup(), this.tick, gameId);
    if (this.feed === feed) setAdmitted(true);
  }

  private failed(err: unknown): void {
    const feed = this.feed;
    this.feed = undefined;
    if (feed) void this.drain(feed);
    if (this.ending) this.finish();
    else this.scheduleRetry();
    relayLog.warn(
      { err, address: this.options.address },
      "Live CastGenius feed failed",
    );
  }

  private async drain(feed: LiveCastPlannerFeed): Promise<void> {
    try {
      await feed.close();
    } catch (err) {
      relayLog.warn(
        { err, address: this.options.address },
        "Live CastGenius drain failed",
      );
      if (this.feed === feed && this.ending) this.finish();
    }
  }

  private scheduleRetry(): void {
    this.retryAtTick = this.tick + Math.ceil(this.retryMs / MOVE_TICK_MS);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    this.options.setAdmitted(false);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const { gameId, epoch, publish } = this.options;
    publish({
      gameId,
      epoch,
      plannedThroughTick: this.tick,
      shots: [],
      ended: true,
    });
  }
}
