import { useEffect, useEffectEvent } from "react";
import { getMissionInfo, getMissionList } from "../manifest";
import { usePlaybackActions } from "./RecordingProvider";

export function usePublicWindowAPI({ onChangeMission }) {
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
