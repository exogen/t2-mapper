import type { Dispatch, SetStateAction } from "react";
import type { getMissionList, getMissionInfo } from "@/src/manifest";

declare global {
  interface Window {
    setMissionName?: Dispatch<SetStateAction<string>>;
    getMissionList?: typeof getMissionList;
    getMissionInfo?: typeof getMissionInfo;
  }
}
