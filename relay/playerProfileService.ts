/** Refresh appearance profiles and best maps from published demo stats.
 * Appearance uses a recent sample; best-map work has an explicit demo scope. */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { setImmediate } from "node:timers/promises";
import type { T2PlayerBestMapUpdate, T2PlayerProfile } from "./accountTypes.js";
import { collectDemoGuidInventory } from "./demoGuidInventory.js";
import type { DemoGuidSidecar } from "./demoGuids.js";
import type { DemoMetadata } from "./demoMetadata.js";
import type { DemoStatsSidecar } from "./demoPlayerStatsModel.js";
import { DEMO_STATS_SUFFIX, readCurrentDemoStats } from "./demoStats.js";
import type { DemoUploadConfig } from "./demoUpload.js";
import {
  createProfileDemoSelector,
  summarizePlayerProfile,
  type PlayerProfileDemo,
  type PlayerProfileSelection,
} from "./playerProfiles.js";
import type { PrivateDemoStore } from "./privateDemoStore.js";

export interface PlayerProfileUpdateCounts {
  stored: number;
  planned: number;
  skipped: number;
  failed: number;
  statsRead: number;
  missingStats: number;
  /** Distinct GUIDs with a positive final map score in the requested demo scope. */
  bestMapsConsidered: number;
  /** Stats reads that prevented a complete historical best-map calculation. */
  bestMapDemosFailed: number;
}

export interface PlayerProfileUpdateResult {
  guid: string;
  result: "stored" | "planned" | "skipped" | "failed";
  reason?: "stats-error" | "profile-error" | "no-data" | "no-published-demos";
  demoCount?: number;
}

export interface UpdatePlayerProfilesOptions {
  store: Pick<PrivateDemoStore, "read">;
  index: readonly DemoMetadata[];
  guids: readonly string[];
  guidSidecars: ReadonlyMap<string, DemoGuidSidecar>;
  /** Omit to compute appearance profiles without writing them. */
  saveProfile?: (profile: T2PlayerProfile) => void;
  /** Atomic max-only writes, independent of appearance snapshot timestamps. */
  saveBestMaps?: (entries: readonly T2PlayerBestMapUpdate[]) => void;
  /** Omit to skip scores; all official demos for backfill, or specific demo keys. */
  bestMapDemos?: "all" | ReadonlySet<string>;
  demoCount?: number;
  suitUps?: number;
  concurrency?: number;
  /** Stats already computed by the current demo's worker need no second read. */
  statsSidecars?: ReadonlyMap<string, DemoStatsSidecar>;
  onResult?: (result: PlayerProfileUpdateResult) => void;
  onError?: (key: string, error: unknown) => void;
  /** Snapshot start, so an older concurrent computation cannot replace a newer one. */
  computedAt?: number;
  signal?: AbortSignal;
}

export async function updatePlayerProfiles({
  store,
  index,
  guids,
  guidSidecars,
  saveProfile,
  saveBestMaps,
  bestMapDemos,
  demoCount = 10,
  suitUps = 100,
  concurrency = 16,
  statsSidecars,
  onResult,
  onError,
  computedAt = Date.now(),
  signal,
}: UpdatePlayerProfilesOptions): Promise<PlayerProfileUpdateCounts> {
  signal?.throwIfAborted();
  const select = createProfileDemoSelector(index);
  const selections = new Map<string, PlayerProfileSelection>();
  const byDemo = new Map<
    string,
    { record: DemoMetadata; guids: string[]; bestMaps?: boolean }
  >();
  for (const guid of new Set(guids)) {
    const selection = await select(async (candidates, wanted) => {
      const found: DemoMetadata[] = [];
      for (const record of candidates) {
        if (guidSidecars.get(record.filename)?.namesByGuid[guid])
          found.push(record);
        if (found.length >= wanted) break;
      }
      return found;
    }, demoCount);
    signal?.throwIfAborted();
    selections.set(guid, selection);
    for (const record of selection.selected) {
      let entry = byDemo.get(record.filename);
      if (!entry) byDemo.set(record.filename, (entry = { record, guids: [] }));
      entry.guids.push(guid);
    }
  }

  // Appearance uses a recent sample; best maps use all official history only
  // during backfill. Automatic jobs explicitly request just the new demo.
  if (bestMapDemos) {
    for (const record of index) {
      if (
        record.filename.startsWith("users/") ||
        (bestMapDemos !== "all" && !bestMapDemos.has(record.filename))
      )
        continue;
      let entry = byDemo.get(record.filename);
      if (!entry) byDemo.set(record.filename, (entry = { record, guids: [] }));
      entry.bestMaps = true;
    }
  }

  // Retain only selected players' entries rather than every complete sidecar.
  const playerDemos = new Map<string, Map<string, PlayerProfileDemo>>();
  const failedGuids = new Set<string>();
  const bestMaps = new Map<string, T2PlayerBestMapUpdate>();
  const statsJobs = [...byDemo.values()];
  const counts: PlayerProfileUpdateCounts = {
    stored: 0,
    planned: 0,
    skipped: 0,
    failed: 0,
    statsRead: 0,
    missingStats: 0,
    bestMapsConsidered: 0,
    bestMapDemosFailed: 0,
  };
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, statsJobs.length) },
      async () => {
        while (next < statsJobs.length) {
          signal?.throwIfAborted();
          const {
            record,
            guids: players,
            bestMaps: includeBestMaps,
          } = statsJobs[next++];
          try {
            let value: unknown = statsSidecars?.get(record.filename);
            if (!value) {
              counts.statsRead++;
              value = await (signal
                ? store.read(record.filename, DEMO_STATS_SUFFIX, signal)
                : store.read(record.filename, DEMO_STATS_SUFFIX));
              signal?.throwIfAborted();
            }
            const sidecar = readCurrentDemoStats(value);
            if (!sidecar) {
              counts.missingStats++;
              continue;
            }
            if (includeBestMaps) {
              for (const [guid, stats] of Object.entries(sidecar.statsByGuid)) {
                for (const { mission, score } of stats.mapScores ?? []) {
                  if (score <= 0) continue;
                  const previous = bestMaps.get(guid);
                  if (
                    !previous ||
                    score > previous.score ||
                    (score === previous.score && mission < previous.mission)
                  )
                    bestMaps.set(guid, { guid, mission, score });
                }
              }
            }
            for (const guid of players) {
              const stats = sidecar.statsByGuid[guid];
              if (!stats) continue;
              let demos = playerDemos.get(guid);
              if (!demos) playerDemos.set(guid, (demos = new Map()));
              demos.set(record.filename, {
                record,
                recordedAt: record.recordedAt,
                stats,
              });
            }
          } catch (error) {
            signal?.throwIfAborted();
            for (const guid of players) failedGuids.add(guid);
            if (includeBestMaps) counts.bestMapDemosFailed++;
            onError?.(record.filename, error);
          }
        }
      },
    ),
  );
  signal?.throwIfAborted();
  counts.bestMapsConsidered = bestMaps.size;
  if (bestMaps.size) {
    saveBestMaps?.(
      [...bestMaps.values()].sort((a, b) => a.guid.localeCompare(b.guid)),
    );
  }
  for (const [guid, selection] of selections) {
    // SQLite commits are synchronous; let live socket traffic run between
    // players instead of monopolizing the relay for a whole profile batch.
    await setImmediate();
    signal?.throwIfAborted();
    if (failedGuids.has(guid)) {
      counts.failed++;
      onResult?.({ guid, result: "failed", reason: "stats-error" });
      continue;
    }
    try {
      const demos = playerDemos.get(guid);
      // Match the single-player CLI's stable order for tied timestamps,
      // independently of parallel fetch completion order.
      const selectedDemos = selection.selected.flatMap((record) => {
        const demo = demos?.get(record.filename);
        return demo ? [demo] : [];
      });
      const result = summarizePlayerProfile(
        guid,
        selectedDemos,
        selection.lastSeen,
        suitUps,
        computedAt,
      );
      if (!result) {
        counts.skipped++;
        onResult?.({
          guid,
          result: "skipped",
          reason: selection.selected.length ? "no-data" : "no-published-demos",
        });
        continue;
      }
      if (saveProfile) {
        signal?.throwIfAborted();
        saveProfile(result.profile);
        counts.stored++;
      } else counts.planned++;
      onResult?.({
        guid,
        result: saveProfile ? "stored" : "planned",
        demoCount: result.profile.demoCount,
      });
    } catch (error) {
      signal?.throwIfAborted();
      counts.failed++;
      onError?.(guid, error);
      onResult?.({ guid, result: "failed", reason: "profile-error" });
    }
  }
  signal?.throwIfAborted();
  return counts;
}

export interface DemoPlayerProfileUpdaterOptions {
  config: DemoUploadConfig;
  store: Pick<PrivateDemoStore, "read" | "listDemoKeys">;
  saveProfile: (profile: T2PlayerProfile) => void;
  saveBestMaps?: (entries: readonly T2PlayerBestMapUpdate[]) => void;
  client?: S3Client;
}

/** Called after a demo's stats are saved. Missing publication data and errors
 * reject so the scheduler can retry without replaying the recording. */
export function createDemoPlayerProfileUpdater({
  config,
  store,
  saveProfile,
  saveBestMaps,
  client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  }),
}: DemoPlayerProfileUpdaterOptions) {
  return async (
    demoKey: string,
    stats: DemoStatsSidecar,
    signal?: AbortSignal,
  ): Promise<PlayerProfileUpdateCounts> => {
    signal?.throwIfAborted();
    const computedAt = Date.now();
    const timeout = AbortSignal.timeout(60_000);
    const object = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: `${config.prefix}index.json`,
      }),
      { abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout },
    );
    signal?.throwIfAborted();
    if (!object.Body) throw new Error("Demo index has no body");
    const index = JSON.parse(
      await object.Body.transformToString(),
    ) as DemoMetadata[];
    signal?.throwIfAborted();
    if (!index.some((record) => record.filename === demoKey))
      throw new Error(`Demo is not published in the index yet: ${demoKey}`);
    const errors: Error[] = [];
    const onError = (key: string, cause: unknown) => {
      errors.push(new Error(`Player profile data failed: ${key}`, { cause }));
    };
    const inventory = await collectDemoGuidInventory(store, {
      concurrency: 16,
      onError,
      includeDemoKeys: new Set(index.map((record) => record.filename)),
      signal,
    });
    signal?.throwIfAborted();
    if (inventory.failed)
      throw new AggregateError(
        errors,
        `Could not read ${inventory.failed} GUID sidecars`,
      );
    const current = inventory.sidecars.get(demoKey);
    if (!current) throw new Error(`Demo has no GUID sidecar yet: ${demoKey}`);
    const counts = await updatePlayerProfiles({
      store,
      index,
      guids: Object.keys(current.namesByGuid),
      guidSidecars: inventory.sidecars,
      statsSidecars: new Map([[demoKey, stats]]),
      saveProfile,
      saveBestMaps,
      bestMapDemos: new Set([demoKey]),
      onError,
      computedAt,
      signal,
    });
    signal?.throwIfAborted();
    if (counts.failed || counts.bestMapDemosFailed)
      throw new AggregateError(
        errors,
        `Could not update ${counts.failed} player profiles or ${counts.bestMapDemosFailed} best-map demos for ${demoKey}`,
      );
    return counts;
  };
}
