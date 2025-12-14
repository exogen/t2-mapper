import { createContext, useContext } from "react";
import { ParsedMission } from "../mission";
import { TorqueObject } from "../torqueScript";

export type MissionContextType = {
  metadata: ParsedMission;
  missionType: string;
  missionGroup: TorqueObject;
};

const MissionContext = createContext<MissionContextType | null>(null);

export const MissionProvider = MissionContext.Provider;

export function useMission() {
  return useContext(MissionContext);
}
