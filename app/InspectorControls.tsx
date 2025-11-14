import { getResourceList } from "@/src/manifest";

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
  fogEnabled,
  onChangeFogEnabled,
}: {
  missionName: string;
  onChangeMission: (name: string) => void;
  fogEnabled: boolean;
  onChangeFogEnabled: (enabled: boolean) => void;
}) {
  return (
    <div
      id="controls"
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
            onChangeFogEnabled(event.target.checked);
          }}
        />
        <label htmlFor="fogInput">Fog?</label>
      </div>
    </div>
  );
}
