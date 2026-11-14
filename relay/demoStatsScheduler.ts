/**
 * Computes private player stats for published demos at low priority, after
 * they are already available. Publications are queued as they happen; the
 * queue does not survive restarts, so a sweep at startup and every hour
 * queues recent demos still without stats or their profile refresh. Older gaps are left to
 * `npm run demos:backfill-stats` rather than replayed on the relay.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { isPublishedDemoKey } from "./demoKeys.js";
import {
  DEMO_GUIDS_SUFFIX,
  readDemoGuidSidecar,
  type DemoGuidSidecar,
} from "./demoGuids.js";
import {
  DEMO_STATS_VERSION,
  type DemoStatsSidecar,
} from "./demoPlayerStatsModel.js";
import {
  DEMO_PROFILES_SUFFIX,
  DEMO_STATS_SUFFIX,
  PROFILE_REFRESH_VERSION,
  readCurrentDemoStats,
  isCurrentProfileRefresh,
} from "./demoStats.js";
import type { DemoUploadConfig } from "./demoUpload.js";
import { demoLog as log } from "./logger.js";
import { isMissingObject, type PrivateDemoStore } from "./privateDemoStore.js";

const DAY_MS = 24 * 60 * 60_000;

export interface DemoStatsSchedulerOptions {
  /** The published demo bucket. */
  config: DemoUploadConfig;
  store: PrivateDemoStore;
  /** Compute a local recording's stats (the low-priority worker). */
  compute: (file: string, signal?: AbortSignal) => Promise<DemoStatsSidecar>;
  /** Repair missing GUIDs using the same downloaded recording as stats. */
  readNamesByGuid?: (
    file: string,
    signal?: AbortSignal,
  ) => Promise<Record<string, string[]>>;
  /** Refresh profiles only after the demo's stats have been saved. */
  refreshProfiles?: (
    demoKey: string,
    stats: DemoStatsSidecar,
    signal: AbortSignal,
    beforeSave: () => Promise<void>,
  ) => Promise<void>;
  /** SQLite's per-demo membership snapshot matches this recording. */
  isMembershipCurrent?: (demoKey: string, sourceETag?: string) => boolean;
  /** Replace membership only after the recording's identity is checked again. */
  updateMembership?: (
    demoKey: string,
    guids: DemoGuidSidecar,
    sourceETag: string | undefined,
    observedAt: number,
  ) => void;
  /** A completed public listing can remove membership for deleted recordings. */
  pruneMembership?: (
    publishedFilenames: ReadonlySet<string>,
    observedAt: number,
  ) => void;
  /** Failed workers can retry after this cooldown rather than needing a restart. */
  retryDelayMs?: number;
  client?: S3Client;
  /** Sweeps consider demos published within this window. */
  sweepWindowMs?: number;
  sweepIntervalMs?: number;
  firstSweepDelayMs?: number;
  now?: () => number;
}

export class DemoStatsScheduler {
  private readonly config: DemoUploadConfig;
  private readonly store: PrivateDemoStore;
  private readonly compute: DemoStatsSchedulerOptions["compute"];
  private readonly refreshProfiles: DemoStatsSchedulerOptions["refreshProfiles"];
  private readonly readNamesByGuid: DemoStatsSchedulerOptions["readNamesByGuid"];
  private readonly isMembershipCurrent: DemoStatsSchedulerOptions["isMembershipCurrent"];
  private readonly updateMembership: DemoStatsSchedulerOptions["updateMembership"];
  private readonly pruneMembership: DemoStatsSchedulerOptions["pruneMembership"];
  private readonly retryDelayMs: number;
  private readonly client: S3Client;
  private readonly sweepWindowMs: number;
  private readonly sweepIntervalMs: number;
  private readonly firstSweepDelayMs: number;
  private readonly now: () => number;
  private readonly queue: string[] = [];
  private readonly retryAfter = new Map<string, number>();
  private readonly lifetime = new AbortController();
  private currentAbort: AbortController | null = null;
  private currentWork: Promise<void> | null = null;
  private sweeping: Promise<number> | null = null;
  private started = false;
  private current: string | null = null;
  private pumping: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(options: DemoStatsSchedulerOptions) {
    this.config = options.config;
    this.store = options.store;
    this.compute = options.compute;
    this.refreshProfiles = options.refreshProfiles;
    this.readNamesByGuid = options.readNamesByGuid;
    this.isMembershipCurrent = options.isMembershipCurrent;
    this.updateMembership = options.updateMembership;
    this.pruneMembership = options.pruneMembership;
    this.retryDelayMs = options.retryDelayMs ?? 60 * 60_000;
    this.sweepWindowMs = options.sweepWindowMs ?? 7 * DAY_MS;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 60 * 60_000;
    this.firstSweepDelayMs = options.firstSweepDelayMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.client =
      options.client ??
      new S3Client({
        region: "auto",
        endpoint: options.config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: options.config.accessKeyId,
          secretAccessKey: options.config.secretAccessKey,
        },
      });
  }

  /** Queue a published demo's stats behind any already waiting. */
  enqueue(demoKey: string): boolean {
    if (
      this.stopped ||
      !isPublishedDemoKey(demoKey) ||
      (this.retryAfter.get(demoKey) ?? 0) > this.now() ||
      this.current === demoKey ||
      this.queue.includes(demoKey)
    )
      return false;
    this.retryAfter.delete(demoKey);
    this.queue.push(demoKey);
    this.kick();
    return true;
  }

  private kick(): void {
    this.pumping ??= this.pump().finally(() => {
      this.pumping = null;
      if (this.queue.length && !this.stopped) this.kick();
    });
  }

  /** Abort running work before the publisher removes its sidecars. */
  cancel(demoKey: string): Promise<void> {
    const index = this.queue.indexOf(demoKey);
    if (index >= 0) this.queue.splice(index, 1);
    if (this.current === demoKey) {
      this.currentAbort?.abort(new Error("Demo processing canceled"));
      return this.currentWork?.catch(() => {}) ?? Promise.resolve();
    }
    return Promise.resolve();
  }

  /** Resolves once background processing and any recovery sweep have drained. */
  async idle(): Promise<void> {
    while (this.pumping || this.sweeping)
      await Promise.allSettled([this.pumping, this.sweeping]);
  }

  /** Coalesce callers so a slow listing cannot overlap the next hourly sweep. */
  sweep(): Promise<number> {
    if (this.stopped) return Promise.resolve(0);
    return (this.sweeping ??= this.sweepOnce().finally(() => {
      this.sweeping = null;
    }));
  }

  private async sweepOnce(): Promise<number> {
    const signal = this.lifetime.signal;
    const observedAt = this.now();
    const cutoff = observedAt - this.sweepWindowMs;
    const published = new Set<string>();
    const recent: { demoKey: string; at: number; etag?: string }[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          ContinuationToken: token,
        }),
        { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) },
      );
      signal.throwIfAborted();
      for (const { Key, LastModified, ETag } of page.Contents ?? []) {
        const demoKey = Key?.slice(this.config.prefix.length);
        const at = LastModified?.getTime() ?? 0;
        if (demoKey && isPublishedDemoKey(demoKey)) {
          published.add(demoKey);
          if (at >= cutoff) recent.push({ demoKey, at, etag: ETag });
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token)
        throw new Error("Incomplete demo listing");
    } while (token);
    signal.throwIfAborted();
    this.pruneMembership?.(published, observedAt);
    recent.sort((a, b) => b.at - a.at);
    const missing = new Set<string>();
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(16, recent.length) }, async () => {
        while (next < recent.length) {
          signal.throwIfAborted();
          const { demoKey, etag } = recent[next++];
          try {
            if (
              this.isMembershipCurrent &&
              !this.isMembershipCurrent(demoKey, etag)
            ) {
              missing.add(demoKey);
              continue;
            }
            const stats = await this.readJson(
              demoKey,
              DEMO_STATS_SUFFIX,
              signal,
            );
            if (!readCurrentDemoStats(stats, etag)) {
              missing.add(demoKey);
              continue;
            }
            if (
              (this.readNamesByGuid || this.updateMembership) &&
              !this.validGuids(
                await this.readJson(demoKey, DEMO_GUIDS_SUFFIX, signal),
                etag,
              )
            ) {
              missing.add(demoKey);
              continue;
            }
            if (
              this.refreshProfiles &&
              !isCurrentProfileRefresh(
                await this.readJson(demoKey, DEMO_PROFILES_SUFFIX, signal),
                etag,
              )
            )
              missing.add(demoKey);
          } catch (err) {
            signal.throwIfAborted();
            log.warn(
              { err, demoKey },
              "Could not inspect demo sidecars; queued for retry",
            );
            missing.add(demoKey);
          }
        }
      }),
    );
    let queued = 0;
    for (const { demoKey } of recent)
      if (missing.has(demoKey) && this.enqueue(demoKey)) queued++;
    return queued;
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    const schedule = (delay: number) => {
      this.timer = setTimeout(async () => {
        this.timer = null;
        try {
          const queued = await this.sweep();
          if (queued) log.info({ queued }, "Queued demos for player stats");
        } catch (err) {
          if (!this.stopped)
            log.error(
              { err },
              "Demo player stats sweep failed — retrying later",
            );
        }
        if (!this.stopped) schedule(this.sweepIntervalMs);
      }, delay);
      this.timer.unref();
    };
    schedule(this.firstSweepDelayMs);
  }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.lifetime.abort(new Error("Demo processing stopped"));
    this.currentAbort?.abort(this.lifetime.signal.reason);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async pump(): Promise<void> {
    for (
      let demoKey = this.queue.shift();
      demoKey !== undefined && !this.stopped;
      demoKey = this.queue.shift()
    ) {
      this.current = demoKey;
      const controller = new AbortController();
      this.currentAbort = controller;
      try {
        this.currentWork = this.processOne(demoKey, controller.signal);
        await this.currentWork;
      } catch (err) {
        if (!controller.signal.aborted) {
          if (err instanceof SourceChangedError) this.queue.push(demoKey);
          log.error({ err, demoKey }, "Demo player stats failed");
        }
      } finally {
        this.current = null;
        this.currentAbort = null;
        this.currentWork = null;
      }
    }
  }

  private async readJson(
    demoKey: string,
    suffix: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    try {
      const value = await this.store.read(demoKey, suffix, signal);
      signal.throwIfAborted();
      return value;
    } catch (err) {
      signal.throwIfAborted();
      if (err instanceof SyntaxError) return null;
      throw err;
    }
  }

  private validGuids(
    value: unknown,
    sourceETag?: string,
  ): DemoGuidSidecar | undefined {
    try {
      const guids = readDemoGuidSidecar(value);
      return sourceETag && guids.sourceETag && guids.sourceETag !== sourceETag
        ? undefined
        : guids;
    } catch {
      return undefined;
    }
  }

  private async head(
    key: string,
    signal: AbortSignal,
  ): Promise<{ ETag?: string } | undefined> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) },
      );
      signal.throwIfAborted();
      return result;
    } catch (err) {
      signal.throwIfAborted();
      if (isMissingObject(err)) return;
      throw err;
    }
  }

  private async unchanged(
    key: string,
    etag: string | undefined,
    signal: AbortSignal,
  ): Promise<boolean> {
    const source = await this.head(key, signal);
    if (!source) return false;
    if (etag && source.ETag && source.ETag !== etag)
      throw new SourceChangedError(
        "Demo changed during processing; queued again",
      );
    return true;
  }

  private async processOne(
    demoKey: string,
    signal: AbortSignal,
  ): Promise<void> {
    let observedAt = this.now();
    const key = `${this.config.prefix}${demoKey}`;
    const source = await this.head(key, signal);
    if (!source) return;
    const membershipMissing =
      !!this.updateMembership &&
      !this.isMembershipCurrent?.(demoKey, source.ETag);
    const marker = this.refreshProfiles
      ? await this.readJson(demoKey, DEMO_PROFILES_SUFFIX, signal)
      : null;
    const saved = await this.readJson(demoKey, DEMO_STATS_SUFFIX, signal);
    const statsETag = (saved as DemoStatsSidecar | null)?.sourceETag;
    const markerETag = (marker as { sourceETag?: string } | null)?.sourceETag;
    const sourceChanged = !!(
      source.ETag &&
      ((statsETag && statsETag !== source.ETag) ||
        (markerETag && markerETag !== source.ETag))
    );
    let stats = sourceChanged
      ? undefined
      : readCurrentDemoStats(saved, source.ETag);
    let guids =
      this.readNamesByGuid || this.updateMembership
        ? this.validGuids(
            await this.readJson(demoKey, DEMO_GUIDS_SUFFIX, signal),
            source.ETag,
          )
        : undefined;
    if (sourceChanged) guids = undefined;
    let repairGuids = !!this.readNamesByGuid && !guids;
    const membershipOnly =
      membershipMissing &&
      !!guids &&
      !!stats &&
      !sourceChanged &&
      (!this.refreshProfiles || isCurrentProfileRefresh(marker, source.ETag));
    // A membership-only repair preserves successful R2/profile work. Other
    // attempts must not leave an older successful marker hiding a failure.
    if (this.refreshProfiles && !membershipOnly) {
      await this.store.delete(demoKey, DEMO_PROFILES_SUFFIX, signal);
      signal.throwIfAborted();
    }
    if (guids && membershipMissing) {
      if (
        !(await this.indexMembership(
          demoKey,
          guids,
          source.ETag,
          observedAt,
          signal,
        ))
      )
        return;
    }
    if (membershipOnly) return;
    if (membershipMissing && !guids && !repairGuids)
      throw new Error("Demo GUID sidecar is unavailable for membership repair");
    let etag = source.ETag;
    let computed = false;
    let directory: string | undefined;
    try {
      if (!stats || repairGuids) {
        directory = await fsp.mkdtemp(path.join(os.tmpdir(), "demo-stats-"));
        signal.throwIfAborted();
        const object = await this.client.send(
          new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
          {
            abortSignal: AbortSignal.any([
              signal,
              AbortSignal.timeout(5 * 60_000),
            ]),
          },
        );
        signal.throwIfAborted();
        if (!object.Body) throw new Error(`Empty demo: ${demoKey}`);
        etag = object.ETag ?? source.ETag;
        if (source.ETag && object.ETag && source.ETag !== object.ETag) {
          // The GET can observe a replacement after the initial HEAD, even
          // when legacy cached sidecars had no fingerprint of their own.
          stats = undefined;
          repairGuids = !!this.readNamesByGuid;
          guids = undefined;
        } else stats = readCurrentDemoStats(stats, etag);
        const file = path.join(directory, "demo.rec");
        await pipeline(object.Body as Readable, fs.createWriteStream(file), {
          signal,
        });
        signal.throwIfAborted();
        if (repairGuids) {
          observedAt = this.now();
          try {
            guids = readDemoGuidSidecar({
              namesByGuid: await this.readNamesByGuid!(file, signal),
              ...(etag && { sourceETag: etag }),
            });
          } catch (err) {
            if (!signal.aborted)
              this.retryAfter.set(demoKey, this.now() + this.retryDelayMs);
            throw err;
          }
          signal.throwIfAborted();
          if (!(await this.unchanged(key, etag, signal))) return;
          await this.store.put(demoKey, DEMO_GUIDS_SUFFIX, guids, signal);
          signal.throwIfAborted();
          if (
            !(await this.indexMembership(
              demoKey,
              guids,
              etag,
              observedAt,
              signal,
            ))
          )
            return;
        }
        try {
          if (!stats) {
            const value = await this.compute(file, signal);
            signal.throwIfAborted();
            stats = readCurrentDemoStats(value);
            if (!stats) throw new Error("Worker returned invalid player stats");
            if (etag) stats = { ...stats, sourceETag: etag };
            computed = true;
          }
        } catch (err) {
          if (!signal.aborted)
            this.retryAfter.set(demoKey, this.now() + this.retryDelayMs);
          throw err;
        }
      }
      if (!(await this.unchanged(key, etag, signal))) return;
      if (computed) {
        await this.store.put(demoKey, DEMO_STATS_SUFFIX, stats, signal);
        signal.throwIfAborted();
        log.info(
          { demoKey, players: Object.keys(stats!.statsByGuid).length },
          "Demo player stats saved",
        );
      }
      if (!this.refreshProfiles) return;
      signal.throwIfAborted();
      await this.refreshProfiles(demoKey, stats!, signal, async () => {
        if (!(await this.unchanged(key, etag, signal)))
          throw new Error(
            `Demo was removed before profile updates: ${demoKey}`,
          );
      });
      signal.throwIfAborted();
      if (!(await this.unchanged(key, etag, signal))) return;
      await this.store.put(
        demoKey,
        DEMO_PROFILES_SUFFIX,
        {
          version: PROFILE_REFRESH_VERSION,
          statsVersion: DEMO_STATS_VERSION,
          updatedAt: this.now(),
          ...(etag && { sourceETag: etag }),
        },
        signal,
      );
      signal.throwIfAborted();
    } catch (err) {
      if (isMissingObject(err)) return;
      throw err;
    } finally {
      if (directory) await fsp.rm(directory, { recursive: true, force: true });
    }
  }

  private async indexMembership(
    demoKey: string,
    guids: DemoGuidSidecar,
    sourceETag: string | undefined,
    observedAt: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (!this.updateMembership) return true;
    if (
      !(await this.unchanged(
        `${this.config.prefix}${demoKey}`,
        sourceETag,
        signal,
      ))
    )
      return false;
    signal.throwIfAborted();
    this.updateMembership(demoKey, guids, sourceETag, observedAt);
    return true;
  }
}

class SourceChangedError extends Error {}
