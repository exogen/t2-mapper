import { useControls, useDebug, useSettings } from "./SettingsProvider";
import { MissionSelect } from "./MissionSelect";

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

  return (
    <div
      id="controls"
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <MissionSelect value={missionName} onChange={onChangeMission} />
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
