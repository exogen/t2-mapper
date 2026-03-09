import { createContext, useContext } from "react";
import { ParsedMission } from "../mission";

export type MissionContextType = {
  metadata: ParsedMission;
  missionType: string;
};

const MissionContext = createContext<MissionContextType | null>(null);

export const MissionProvider = MissionContext.Provider;

export function useMission() {
  return useContext(MissionContext);
}
