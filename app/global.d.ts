import type { getMissionList, getMissionInfo } from "@/src/manifest";
import type { DemoRecording } from "@/src/demo/types";

declare global {
  interface Window {
    setMissionName?: (missionName: string) => void;
    getMissionList?: typeof getMissionList;
    getMissionInfo?: typeof getMissionInfo;
    loadDemoRecording?: (recording: DemoRecording) => void;
  }
}
