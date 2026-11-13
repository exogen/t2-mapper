import {
  DEMO_GUIDS_SUFFIX,
  mergeNamesByGuid,
  readDemoGuidSidecar,
  type DemoGuidSidecar,
} from "./demoGuids.js";
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
  const sidecars = new Map<string, DemoGuidSidecar>();
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, demoKeys.length) }, async () => {
      while (next < demoKeys.length) {
        signal?.throwIfAborted();
        const demoKey = demoKeys[next++];
        try {
          const value = await (signal
            ? store.read(demoKey, DEMO_GUIDS_SUFFIX, signal)
            : store.read(demoKey, DEMO_GUIDS_SUFFIX));
          signal?.throwIfAborted();
          sidecars.set(demoKey, readDemoGuidSidecar(value));
        } catch (error) {
          signal?.throwIfAborted();
          failed++;
          onError?.(demoKey, error);
        }
      }
    }),
  );
  signal?.throwIfAborted();
  return {
    sidecars,
    namesByGuid: mergeNamesByGuid(sidecars.values()),
    failed,
    sidecarCount: demoKeys.length,
  };
}
