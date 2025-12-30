import type { getMissionList, getMissionInfo } from "@/src/manifest";

declare global {
  interface Window {
    setMissionName?: (missionName: string) => void;
    getMissionList?: typeof getMissionList;
    getMissionInfo?: typeof getMissionInfo;
  }
}
