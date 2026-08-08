import {
  createParser,
  parseAsBoolean,
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

const VIEW_MODES = ["command"] as const;

/**
 * View mode requested via the URL (e.g. `?mode=command` opens the map in command
 * circuit view).
 */
export function useModeQueryState() {
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringLiteral(VIEW_MODES),
  );
  return [mode, setMode] as const;
}
