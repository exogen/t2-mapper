import type Database from "better-sqlite3";
import {
  saveT2PlayerBestMaps,
  saveT2PlayerProfile,
} from "../../relay/accountDatabase.js";
import type {
  T2PlayerBestMapUpdate,
  T2PlayerProfile,
} from "../../relay/accountTypes.js";
import type { DemoMetadata } from "../../relay/demoMetadata.js";
import {
  DEMO_GUIDS_SUFFIX,
  readDemoGuidSidecar,
} from "../../relay/demoGuids.js";
import type { DemoStatsSidecar } from "../../relay/demoPlayerStatsModel.js";
import {
  DEMO_STATS_SUFFIX,
  readCurrentDemoStats,
} from "../../relay/demoStats.js";
import { updatePlayerProfiles } from "../../relay/playerProfileService.js";
import { createPlayerDemosReader } from "../../relay/playerDemos.js";
import type { PrivateDemoStore } from "../../relay/privateDemoStore.js";
import { normalizePlayerGuid } from "../../relay/shared.js";

interface DemoDeletionProfilesOptions {
  database: Database.Database;
  store: Pick<PrivateDemoStore, "read">;
  /** The surviving published demos, including user uploads. */
  index: readonly DemoMetadata[];
  guids: readonly string[];
  sourceETags?: ReadonlyMap<string, string>;
  computedAt?: number;
  concurrency?: number;
}

/** Prepare a complete replacement before changing any derived account data. */
export async function prepareDemoDeletionProfiles({
  database,
  store,
  index,
  guids,
  sourceETags,
  computedAt = Date.now(),
  concurrency = 16,
}: DemoDeletionProfilesOptions) {
  const affected = new Set(
    guids.map((guid) => {
      const normalized = normalizePlayerGuid(guid);
      if (!normalized) throw new Error(`Invalid affected player GUID: ${guid}`);
      return normalized;
    }),
  );
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("Profile rebuild concurrency must be a positive integer");
  const profiles: T2PlayerProfile[] = [];
  const bestMaps: T2PlayerBestMapUpdate[] = [];
  const statsSidecars = new Map<string, DemoStatsSidecar>();
  const membersByDemo = new Map<string, ReadonlySet<string>>();
  const memberships = createPlayerDemosReader({ database });
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, affected.size ? index.length : 0) },
      async () => {
        while (next < index.length) {
          const { filename } = index[next++];
          const sidecar = readCurrentDemoStats(
            await store.read(filename, DEMO_STATS_SUFFIX),
            sourceETags?.get(filename),
          );
          if (!sidecar)
            throw new Error(
              `Cannot rebuild profiles: missing or outdated stats for ${filename}. Run demos:backfill-stats first.`,
            );
          let members = memberships.isCurrent(
            filename,
            sourceETags?.get(filename),
          )
            ? memberships.guidsForDemo(filename)
            : undefined;
          if (members === undefined) {
            const value = await store.read(filename, DEMO_GUIDS_SUFFIX);
            if (value == null) members = Object.keys(sidecar.statsByGuid);
            else {
              const guids = readDemoGuidSidecar(value);
              const expectedETag =
                sourceETags?.get(filename) ?? sidecar.sourceETag;
              if (
                expectedETag &&
                guids.sourceETag &&
                expectedETag !== guids.sourceETag
              )
                throw new Error(
                  `Cannot rebuild profiles: outdated GUID sidecar for ${filename}`,
                );
              members = Object.keys(guids.namesByGuid);
            }
          }
          // Preserve observer-only sightings for lastSeenAt and the same
          // recent-demo selection used by ordinary profile updates.
          membersByDemo.set(
            filename,
            new Set(members.filter((guid) => affected.has(guid))),
          );
          // Retain only affected players while scanning the surviving history.
          statsSidecars.set(filename, {
            ...sidecar,
            statsByGuid: Object.fromEntries(
              Object.entries(sidecar.statsByGuid).filter(([guid]) =>
                affected.has(guid),
              ),
            ),
          });
        }
      },
    ),
  );
  if (affected.size) {
    const result = await updatePlayerProfiles({
      store,
      index,
      guids: [...affected],
      statsSidecars,
      hasGuid: (filename, guid) =>
        membersByDemo.get(filename)?.has(guid) ?? false,
      bestMapDemos: "all",
      saveProfile: (profile) => profiles.push(profile),
      saveBestMaps: (entries) => bestMaps.push(...entries),
      computedAt,
    });
    if (result.failed || result.missingStats || result.bestMapDemosFailed)
      throw new Error(
        "Could not completely rebuild the affected player profiles",
      );
  }

  return {
    guids: affected.size,
    profiles: profiles.length,
    bestMaps: bestMaps.length,
    statsRead: statsSidecars.size,
    commit() {
      const newer = database.prepare(
        'SELECT 1 FROM "t2PlayerProfile" WHERE "guid" = ? AND "computedAt" > ?',
      );
      const removeProfile = database.prepare(
        'DELETE FROM "t2PlayerProfile" WHERE "guid" = ?',
      );
      const removeBestMap = database.prepare(
        'DELETE FROM "t2PlayerBestMap" WHERE "guid" = ?',
      );
      database
        .transaction(() => {
          for (const guid of affected) {
            if (newer.get(guid, computedAt))
              throw new Error(
                "Player profiles changed during cleanup. Stop profile writers and retry.",
              );
            removeProfile.run(guid);
            removeBestMap.run(guid);
          }
          for (const profile of profiles)
            saveT2PlayerProfile(database, profile);
          saveT2PlayerBestMaps(database, bestMaps);
        })
        .immediate();
    },
  };
}
