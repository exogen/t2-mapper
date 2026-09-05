import {
  createParser,
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { getMissionInfo } from "../manifest";

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
}).withDefault(defaultMission);

export function useMissionQueryState() {
  const [currentMission, setCurrentMission] = useQueryState(
    "mission",
    parseAsMissionWithType,
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
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringLiteral(APP_MODES).withDefault("map"),
  );
  return [mode, setMode] as const;
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

const VIEWS = ["cc"] as const;

/**
 * View requested via the URL: `?view=cc` opens the command circuit once
 * the current mode's data is ready.
 */
export function useViewQueryState() {
  const [view, setView] = useQueryState("view", parseAsStringLiteral(VIEWS));
  return [view, setView] as const;
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
