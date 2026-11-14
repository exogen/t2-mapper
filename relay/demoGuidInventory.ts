import {
  DEMO_GUIDS_SUFFIX,
  mergeNamesByGuid,
  readDemoGuidSidecar,
  type DemoGuidSidecar,
} from "./demoGuids.js";
import type { PlayerDemosReader } from "./playerDemos.js";
import type { PrivateDemoStore } from "./privateDemoStore.js";

/** Read the private GUID inventory once, retaining valid sidecars for callers
 * that also need to find each player's recordings. Failed reads are reported
 * separately, so the names merge can still produce its partial result. */
export async function collectDemoGuidInventory(
  store: Pick<PrivateDemoStore, "listDemoKeys" | "read">,
  {
    concurrency,
    onError,
    includeDemoKeys,
    signal,
  }: {
    concurrency: number;
    onError?: (demoKey: string, error: unknown) => void;
    /** Automatic refreshes use published recordings; manual merges use all. */
    includeDemoKeys?: ReadonlySet<string>;
    signal?: AbortSignal;
  },
): Promise<{
  sidecars: Map<string, DemoGuidSidecar>;
  namesByGuid: Record<string, string[]>;
  failed: number;
  sidecarCount: number;
}> {
  signal?.throwIfAborted();
  const listed = await (signal
    ? store.listDemoKeys(DEMO_GUIDS_SUFFIX, signal)
    : store.listDemoKeys(DEMO_GUIDS_SUFFIX));
  signal?.throwIfAborted();
  const demoKeys = includeDemoKeys
    ? listed.filter((key) => includeDemoKeys.has(key))
    : listed;
  const { entries: sidecars, failed } = await collectEntries(
    demoKeys,
    async (demoKey) =>
      readDemoGuidSidecar(
        await (signal
          ? store.read(demoKey, DEMO_GUIDS_SUFFIX, signal)
          : store.read(demoKey, DEMO_GUIDS_SUFFIX)),
      ),
    { concurrency, onError, signal },
  );
  signal?.throwIfAborted();
  return {
    sidecars,
    namesByGuid: mergeNamesByGuid(sidecars.values()),
    failed,
    sidecarCount: demoKeys.length,
  };
}

/** Membership-only callers use SQLite where available without loading aliases. */
export async function collectDemoMembershipInventory(
  store: Pick<PrivateDemoStore, "listDemoKeys" | "read">,
  {
    concurrency,
    memberships,
    demoKeys,
    onError,
    signal,
  }: {
    concurrency: number;
    memberships?: Pick<PlayerDemosReader, "guidsForDemo">;
    /** Published scopes can skip the private listing; absent sidecars are ignored. */
    demoKeys?: ReadonlySet<string>;
    onError?: (demoKey: string, error: unknown) => void;
    signal?: AbortSignal;
  },
): Promise<{
  membersByDemo: Map<string, ReadonlySet<string>>;
  guids: Set<string>;
  failed: number;
  sidecarCount: number;
}> {
  signal?.throwIfAborted();
  const keys = demoKeys
    ? [...demoKeys]
    : await (signal
        ? store.listDemoKeys(DEMO_GUIDS_SUFFIX, signal)
        : store.listDemoKeys(DEMO_GUIDS_SUFFIX));
  const { entries: membersByDemo, failed } = await collectEntries<
    ReadonlySet<string>
  >(
    keys,
    async (demoKey) => {
      const indexed = memberships?.guidsForDemo(demoKey);
      if (indexed !== undefined) return new Set(indexed);
      const value = await (signal
        ? store.read(demoKey, DEMO_GUIDS_SUFFIX, signal)
        : store.read(demoKey, DEMO_GUIDS_SUFFIX));
      if (value == null && demoKeys) return undefined;
      return new Set(Object.keys(readDemoGuidSidecar(value).namesByGuid));
    },
    { concurrency, onError, signal },
  );
  return {
    membersByDemo,
    guids: new Set(
      [...membersByDemo.values()].flatMap((members) => [...members]),
    ),
    failed,
    sidecarCount: keys.length,
  };
}

async function collectEntries<T>(
  demoKeys: readonly string[],
  read: (demoKey: string) => Promise<T | undefined>,
  {
    concurrency,
    onError,
    signal,
  }: {
    concurrency: number;
    onError?: (demoKey: string, error: unknown) => void;
    signal?: AbortSignal;
  },
): Promise<{ entries: Map<string, T>; failed: number }> {
  signal?.throwIfAborted();
  const entries = new Map<string, T>();
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, demoKeys.length) }, async () => {
      while (next < demoKeys.length) {
        signal?.throwIfAborted();
        const demoKey = demoKeys[next++];
        try {
          const entry = await read(demoKey);
          signal?.throwIfAborted();
          if (entry !== undefined) entries.set(demoKey, entry);
        } catch (error) {
          signal?.throwIfAborted();
          failed++;
          onError?.(demoKey, error);
        }
      }
    }),
  );
  signal?.throwIfAborted();
  return { entries, failed };
}
