import {
  createParser,
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { getMissionInfo } from "../manifest";
import { useCallback } from "react";
import { normalizeAddress } from "../../relay/shared";

export type CurrentMission = {
  missionName: string;
  missionType?: string;
};

const defaultMission: CurrentMission = {
  missionName: "RiverDance",
  missionType: "CTF",
};

const parseAsMissionWithType = createParser<CurrentMission>({
  parse(query: string) {
    const [missionName, missionType] = query.split("~");
    let selectedMissionType = missionType;
    const availableMissionTypes = getMissionInfo(missionName).missionTypes;
    if (!missionType || !availableMissionTypes.includes(missionType)) {
      selectedMissionType = availableMissionTypes[0];
    }
    return { missionName, missionType: selectedMissionType };
  },
  serialize({ missionName, missionType }): string {
    const availableMissionTypes = getMissionInfo(missionName).missionTypes;
    if (!missionType || availableMissionTypes.length === 1) {
      return missionName;
    }
    return `${missionName}~${missionType}`;
  },
  eq(a, b) {
    return a.missionName === b.missionName && a.missionType === b.missionType;
  },
});

export function useMissionQueryState() {
  const [currentMission, setCurrentMission] = useQueryState(
    "mission",
    parseAsMissionWithType.withDefault(defaultMission),
  );
  return [currentMission, setCurrentMission] as const;
}

export function useFogQueryState() {
  const [fogEnabledOverride, setFogEnabledOverride] = useQueryState(
    "fog",
    parseAsBoolean,
  );
  return [fogEnabledOverride, setFogEnabledOverride] as const;
}

const APP_MODES = ["map", "demo", "live"] as const;

export type AppMode = (typeof APP_MODES)[number];

/**
 * App mode selected via the URL: `map` explores a mission (default),
 * `demo` starts with a blank canvas awaiting a .rec file, and `live`
 * shows the server selector / an active spectate session.
 */
export function useModeQueryState() {
  const [query, setQuery] = useQueryStates({
    mode: navigationParsers.mode,
    demo: navigationParsers.demo,
    address: navigationParsers.address,
    name: navigationParsers.name,
  });
  const mode = navigationMode(query);
  const setMode = useCallback(
    (mode: AppMode) => setQuery({ mode }),
    [setQuery],
  );
  return [mode, setMode] as const;
}

const navigationParsers = {
  mode: parseAsStringLiteral(APP_MODES),
  mission: parseAsMissionWithType,
  demo: parseAsString,
  t: parseAsInteger,
  address: parseAsString,
  name: parseAsString,
  view: parseAsStringLiteral(["cc"] as const),
};

/** Related route fields must change in one update, including pending nuqs writes. */
export function useNavigationQueryState() {
  return useQueryStates(navigationParsers);
}

export type NavigationQuery = ReturnType<typeof useNavigationQueryState>[0];

/** Only patch incompatible fields; never replay an entire captured route. */
export function normalizeNavigationQuery(query: NavigationQuery) {
  const mode = navigationMode(query);
  return {
    ...(query.mode === null && mode !== "map" ? { mode } : {}),
    ...(mode !== "map" && query.mission !== null ? { mission: null } : {}),
    ...(mode !== "demo" && query.demo !== null ? { demo: null } : {}),
    ...((mode !== "demo" || !query.demo) && query.t !== null
      ? { t: null }
      : {}),
    ...((mode !== "live" || query.address) && query.name !== null
      ? { name: null }
      : {}),
    ...(mode !== "live" && query.address !== null ? { address: null } : {}),
  };
}

/** A view belongs to a selection, not to the share link's playback time. */
export function navigationViewKey(query: NavigationQuery): string {
  return JSON.stringify([
    navigationMode(query),
    query.mission?.missionName,
    query.mission?.missionType,
    query.demo,
    query.address,
    query.name,
    query.view,
  ]);
}

/** An ending session must not clear a newer server selection. */
export function clearEndedServerQuery(
  query: NavigationQuery,
  server: {
    serverAddress: string | null;
    serverName?: string;
    servers: readonly { address: string; name: string }[];
  },
): Partial<NavigationQuery> {
  if (navigationMode(query) !== "live" || !server.serverAddress) return {};
  const matches = query.address
    ? normalizeAddress(query.address) === normalizeAddress(server.serverAddress)
    : query.name &&
      (query.name === server.serverName ||
        server.servers.some(
          (s) => s.name === query.name && s.address === server.serverAddress,
        ));
  return matches ? { name: null, address: null } : {};
}

export function navigationMode(query: {
  mode: AppMode | null;
  demo: string | null;
  address: string | null;
  name: string | null;
}): AppMode {
  return (
    query.mode ??
    (query.demo ? "demo" : query.address || query.name ? "live" : "map")
  );
}

/**
 * Demo requested via the URL: `?demo=<filename>` loads that published
 * demo when landing in demo mode, and mirrors the current dropdown
 * selection so the page URL can be shared as a link to a demo.
 */
export function useDemoQueryState() {
  const [demo, setDemo] = useQueryState("demo");
  return [demo, setDemo] as const;
}

/**
 * The second of the loaded demo a link points at: `?t=<sec>`. The camera
 * for that moment rides in the URL hash (see demoMoment.ts). Read once
 * when the demo is ready, and written by the "Link to moment" button.
 */
export function useDemoTimeQueryState() {
  const [t, setT] = useQueryState("t", parseAsInteger);
  return [t, setT] as const;
}

/** Builds a shareable URL for a moment's second from the page URL. */
export const serializeDemoTime = createSerializer({ t: parseAsInteger });

/**
 * Drops the URL hash without leaving a bare `#` behind (assigning
 * `location.hash = ""` keeps one). Call before a nuqs setter that should
 * write the URL without it: nuqs preserves whatever hash it finds.
 */
export function dropLocationHash(): void {
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}
