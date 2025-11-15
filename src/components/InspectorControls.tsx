import { getResourceList } from "../manifest";
import { useSettings } from "./SettingsProvider";

const excludeMissions = new Set([
  "SkiFree",
  "SkiFree_Daily",
  "SkiFree_Randomizer",
]);

const missions = getResourceList()
  .map((resourcePath) => resourcePath.match(/^missions\/(.+)\.mis$/))
  .filter(Boolean)
  .map((match) => match[1])
  .filter((name) => !excludeMissions.has(name));

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
    speedMultiplier,
    setSpeedMultiplier,
    fov,
    setFov,
  } = useSettings();

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
        {missions.map((missionName) => (
          <option key={missionName}>{missionName}</option>
        ))}
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
      <div className="Field">
        <label htmlFor="fovInput">FOV</label>
        <input
          id="speedInput"
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
