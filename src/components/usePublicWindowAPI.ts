import { useEffect, useEffectEvent } from "react";
import { getMissionInfo, getMissionList } from "../manifest";
import { usePlaybackActions } from "./usePlayback";
import type { CurrentMission } from "./useQueryParams";

declare global {
  interface Window {
    setMissionName?: (missionName: string) => void;
    getMissionList?: typeof getMissionList;
    getMissionInfo?: typeof getMissionInfo;
    loadDemoRecording?: ReturnType<typeof usePlaybackActions>["setRecording"];
  }
}

export function usePublicWindowAPI({
  onChangeMission,
}: {
  onChangeMission: (mission: CurrentMission) => void;
}) {
  const { setRecording } = usePlaybackActions();
  const handleChangeMission = useEffectEvent(onChangeMission);

  useEffect(() => {
    // For automation, like the t2-maps app!
    window.setMissionName = (missionName: string) => {
      const availableMissionTypes = getMissionInfo(missionName).missionTypes;
      handleChangeMission({
        missionName,
        missionType: availableMissionTypes[0],
      });
    };
    window.getMissionList = getMissionList;
    window.getMissionInfo = getMissionInfo;
    window.loadDemoRecording = setRecording;

    return () => {
      delete window.setMissionName;
      delete window.getMissionList;
      delete window.getMissionInfo;
      delete window.loadDemoRecording;
    };
  }, [setRecording]);
}
