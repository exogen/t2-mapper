import { Fragment, useMemo } from "react";
import { getMissionInfo, getMissionList, getSourceAndPath } from "../manifest";
import { useControls, useDebug, useSettings } from "./SettingsProvider";
import orderBy from "lodash.orderby";

const excludeMissions = new Set([
  "SkiFree",
  "SkiFree_Daily",
  "SkiFree_Randomizer",
]);

const sourceGroupNames = {
  "missions.vl2": "Official",
  "TR2final105-client.vl2": "Team Rabbit 2",
  "z_mappacks/CTF/Classic_maps_v1.vl2": "Classic",
  "z_mappacks/CTF/DynamixFinalPack.vl2": "Official",
  "z_mappacks/CTF/KryMapPack_b3EDIT.vl2": "KryMapPack",
  "z_mappacks/CTF/S5maps.vl2": "S5",
  "z_mappacks/CTF/S8maps.vl2": "S8",
  "z_mappacks/CTF/TWL-MapPack.vl2": "TWL",
  "z_mappacks/CTF/TWL-MapPackEDIT.vl2": "TWL",
  "z_mappacks/CTF/TWL2-MapPack.vl2": "TWL2",
  "z_mappacks/CTF/TWL2-MapPackEDIT.vl2": "TWL2",
  "z_mappacks/TWL_T2arenaOfficialMaps.vl2": "Arena",
  "z_mappacks/z_DMP2-V0.6.vl2": "DMP2 (Discord Map Pack)",
  "z_mappacks/zDMP-4.7.3DX.vl2": "DMP (Discord Map Pack)",
  // "SkiFreeGameType.vl2": "SkiFree",
};

const dirGroupNames = {
  "z_mappacks/DM": "DM",
  "z_mappacks/LCTF": "LCTF",
  "z_mappacks/Lak": "LakRabbit",
};

const getDirName = (sourcePath: string) => {
  const match = sourcePath.match(/^(.*)(\/[^/]+)$/);
  return match ? match[1] : "";
};

const groupedMissions = getMissionList().reduce(
  (groupMap, missionName) => {
    const missionInfo = getMissionInfo(missionName);
    const [sourcePath] = getSourceAndPath(missionInfo.resourcePath);
    const sourceDir = getDirName(sourcePath);
    const groupName =
      sourceGroupNames[sourcePath] ?? dirGroupNames[sourceDir] ?? null;
    const groupMissions = groupMap.get(groupName) ?? [];
    if (!excludeMissions.has(missionName)) {
      groupMissions.push({
        resourcePath: missionInfo.resourcePath,
        missionName,
        displayName: missionInfo.displayName,
        sourcePath,
      });
      groupMap.set(groupName, groupMissions);
    }
    return groupMap;
  },
  new Map<
    string | null,
    Array<{
      resourcePath: string;
      missionName: string;
      displayName: string;
      sourcePath: string;
    }>
  >(),
);

groupedMissions.forEach((groupMissions, groupName) => {
  groupedMissions.set(
    groupName,
    orderBy(
      groupMissions,
      [
        (missionInfo) =>
          (missionInfo.displayName || missionInfo.missionName).toLowerCase(),
      ],
      ["asc"],
    ),
  );
});

export function InspectorControls({
  missionName,
  onChangeMission,
}: {
  missionName: string;
  onChangeMission: (name: string) => void;
}) {
  const {
    fogEnabled,
    setFogEnabled,
    fov,
    setFov,
    audioEnabled,
    setAudioEnabled,
    animationEnabled,
    setAnimationEnabled,
  } = useSettings();
  const { speedMultiplier, setSpeedMultiplier } = useControls();
  const { debugMode, setDebugMode } = useDebug();

  const groupedMissionOptions = useMemo(() => {
    const groups = orderBy(
      Array.from(groupedMissions.entries()),
      [
        ([groupName]) =>
          groupName === "Official" ? 0 : groupName == null ? 2 : 1,
        ([groupName]) => (groupName ? groupName.toLowerCase() : ""),
      ],
      ["asc", "asc"],
    );
    return groups;
  }, []);

  return (
    <div
      id="controls"
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        id="missionList"
        value={missionName}
        onChange={(event) => onChangeMission(event.target.value)}
      >
        {groupedMissionOptions.map(([groupName, groupMissions]) =>
          groupName ? (
            <optgroup key={groupName} label={groupName}>
              {groupMissions.map((mission) => (
                <option key={mission.missionName} value={mission.missionName}>
                  {mission.displayName || mission.missionName}
                </option>
              ))}
            </optgroup>
          ) : (
            <Fragment key="null">
              <hr />
              {groupMissions.map((mission) => (
                <option key={mission.missionName} value={mission.missionName}>
                  {mission.displayName || mission.missionName}
                </option>
              ))}
            </Fragment>
          ),
        )}
      </select>
      <div className="CheckboxField">
        <input
          id="fogInput"
          type="checkbox"
          checked={fogEnabled}
          onChange={(event) => {
            setFogEnabled(event.target.checked);
          }}
        />
        <label htmlFor="fogInput">Fog?</label>
      </div>
      <div className="CheckboxField">
        <input
          id="audioInput"
          type="checkbox"
          checked={audioEnabled}
          onChange={(event) => {
            setAudioEnabled(event.target.checked);
          }}
        />
        <label htmlFor="audioInput">Audio?</label>
      </div>
      <div className="CheckboxField">
        <input
          id="animationInput"
          type="checkbox"
          checked={animationEnabled}
          onChange={(event) => {
            setAnimationEnabled(event.target.checked);
          }}
        />
        <label htmlFor="animationInput">Animation?</label>
      </div>
      <div className="CheckboxField">
        <input
          id="debugInput"
          type="checkbox"
          checked={debugMode}
          onChange={(event) => {
            setDebugMode(event.target.checked);
          }}
        />
        <label htmlFor="debugInput">Debug?</label>
      </div>
      <div className="Field">
        <label htmlFor="fovInput">FOV</label>
        <input
          id="fovInput"
          type="range"
          min={75}
          max={120}
          step={5}
          value={fov}
          onChange={(event) => setFov(parseInt(event.target.value))}
        />
        <output htmlFor="speedInput">{fov}</output>
      </div>
      <div className="Field">
        <label htmlFor="speedInput">Speed</label>
        <input
          id="speedInput"
          type="range"
          min={0.1}
          max={5}
          step={0.05}
          value={speedMultiplier}
          onChange={(event) =>
            setSpeedMultiplier(parseFloat(event.target.value))
          }
        />
      </div>
    </div>
  );
}
