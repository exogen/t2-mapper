/**
 * Private per-demo sidecars mapping each authenticated player GUID to the
 * tag-less names it used (stored by `PrivateDemoStore`).
 */
import { runDemoWorker } from "./demoWorkerProcess.js";

export const DEMO_GUIDS_SUFFIX = ".guids.json";

export interface DemoGuidSidecar {
  namesByGuid: Record<string, string[]>;
}

/** Validate a stored sidecar, so one damaged object cannot poison a merge. */
export function readDemoGuidSidecar(value: unknown): DemoGuidSidecar {
  const namesByGuid = (value as Partial<DemoGuidSidecar> | null)?.namesByGuid;
  if (
    !namesByGuid ||
    typeof namesByGuid !== "object" ||
    Array.isArray(namesByGuid) ||
    Object.entries(namesByGuid).some(
      ([guid, names]) =>
        !/^[1-9]\d*$/.test(guid) ||
        !Array.isArray(names) ||
        names.some((name) => typeof name !== "string"),
    )
  )
    throw new Error("Invalid demo GUID sidecar");
  return { namesByGuid };
}

/**
 * Drop `Name.1`–`Name.9` where the same GUID also used `Name`. When a player
 * reconnects while their old connection lingers, the server renames the old
 * connection that way (server.cs `GameConnection::onConnect`). Requiring the
 * base name keeps real names that happen to end in a digit suffix.
 */
export function withoutReconnectNames(
  namesByGuid: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(namesByGuid).map(([guid, names]) => [
      guid,
      names.filter((name) => {
        const base = /^(.+)\.[1-9]$/.exec(name)?.[1];
        return base === undefined || !names.includes(base);
      }),
    ]),
  );
}

/** Every unique name per GUID across demos, in GUID order. */
export function mergeNamesByGuid(
  sidecars: Iterable<DemoGuidSidecar>,
): Record<string, string[]> {
  const merged = new Map<string, Set<string>>();
  for (const { namesByGuid } of sidecars)
    for (const [guid, names] of Object.entries(namesByGuid)) {
      let set = merged.get(guid);
      if (!set) merged.set(guid, (set = new Set()));
      for (const name of names) set.add(name);
    }
  return Object.fromEntries(
    [...merged]
      .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
      .map(([guid, names]) => [
        guid,
        [...names].sort((a, b) =>
          a.localeCompare(b, "en", { sensitivity: "base" }),
        ),
      ]),
  );
}

/** Read a local recording's GUID names in a worker (see `runDemoWorker`). */
export function runDemoGuidProcess(
  input: string,
  signal?: AbortSignal,
): Promise<Record<string, string[]>> {
  return runDemoWorker<DemoGuidSidecar>(
    new URL("./demoGuidWorker.ts", import.meta.url),
    [input],
    // No R2, OAuth, auth-cookie, or database credentials belong in this child.
    {
      signal,
      env: { PATH: process.env.PATH, NODE_ENV: "production", TZ: "UTC" },
    },
  ).then(({ message, code, signal, timedOut, stderr }) => {
    if (code === 0 && message?.namesByGuid) return message.namesByGuid;
    throw new Error(
      timedOut
        ? "Demo GUID extraction timed out"
        : stderr.trim() || `Demo GUID worker exited (${code ?? signal})`,
    );
  });
}
