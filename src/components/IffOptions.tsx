import { TEAM_COLOR_SCHEMES, type TeamColorScheme } from "../iffTheme";
import {
  IFF_DISTANCE_STEP,
  MAX_IFF_DISTANCE,
  MIN_IFF_DISTANCE,
  type IffVisibility,
} from "../state/settingsStore";
import { Checkbox } from "./Checkbox";
import { RangeSlider } from "./RangeSlider";
import { Select } from "./Select";
import { useSettings } from "./SettingsProvider";
import choiceStyles from "./ChoiceInput.module.css";
import styles from "./InspectorControls.module.css";
import fieldsetStyles from "./SidebarFieldset.module.css";

const VISIBILITY_OPTIONS = [
  { value: "always", label: "Always" },
  { value: "followed", label: "Only followed player" },
  { value: "exceptFollowed", label: "Except followed player" },
  { value: "never", label: "Never" },
] as const;

const OBSERVER_TEAM_COLOR_OPTIONS = Object.entries(TEAM_COLOR_SCHEMES).map(
  ([value, scheme]) => ({ value, label: scheme.label }),
);

const FLAG_COLOR_OPTIONS = [
  {
    value: "matchTeam",
    label: "Flag’s team",
    description: "Keep flag icons the same whether or not they are held.",
  },
  {
    value: "possession",
    label: "Carrier’s team",
    description: "Change flag icons to match the carrier's IFF, like Tribes 2.",
  },
] as const;

export function IffOptions() {
  const {
    showIffs,
    setShowIffs,
    iffMaxDistance,
    setIffMaxDistance,
    observerTeamColors,
    setObserverTeamColors,
    flagColorMode,
    setFlagColorMode,
    followTeamIff,
    setFollowTeamIff,
    firstPersonTeamIff,
    setFirstPersonTeamIff,
  } = useSettings();

  return (
    <fieldset className={`${fieldsetStyles.Fieldset} ${styles.IffOptions}`}>
      <legend>IFFs</legend>
      <div className={styles.Field}>
        <label id="showIffsInput-label" htmlFor="showIffsInput">
          Show IFFs &amp; nameplates
        </label>
        <div className={styles.Control}>
          <Select
            id="showIffsInput"
            aria-labelledby="showIffsInput-label"
            value={showIffs}
            onChange={(value) => setShowIffs(value as IffVisibility)}
            options={VISIBILITY_OPTIONS}
          />
        </div>
      </div>
      <div className={styles.Field}>
        <label id="iffMaxDistanceInput-label" htmlFor="iffMaxDistanceInput">
          Max distance
        </label>
        <div className={styles.Control}>
          <output
            htmlFor="iffMaxDistanceInput"
            className={styles.IffDistanceValue}
            data-max-value={`${MAX_IFF_DISTANCE} m`}
          >
            {iffMaxDistance} m
          </output>
          <RangeSlider
            id="iffMaxDistanceInput"
            aria-labelledby="iffMaxDistanceInput-label"
            aria-valuetext={`${iffMaxDistance} meters`}
            min={MIN_IFF_DISTANCE}
            max={MAX_IFF_DISTANCE}
            step={IFF_DISTANCE_STEP}
            value={iffMaxDistance}
            onValueChange={setIffMaxDistance}
          />
        </div>
      </div>
      <div className={styles.Field}>
        <label
          id="observerTeamColorsInput-label"
          htmlFor="observerTeamColorsInput"
        >
          Colors when observer
        </label>
        <div className={styles.Control}>
          <Select
            id="observerTeamColorsInput"
            aria-labelledby="observerTeamColorsInput-label"
            aria-describedby="observerTeamColorsInput-description"
            value={observerTeamColors}
            onChange={(value) =>
              setObserverTeamColors(value as TeamColorScheme)
            }
            options={OBSERVER_TEAM_COLOR_OPTIONS}
          />
        </div>
        <p
          id="observerTeamColorsInput-description"
          className={styles.Description}
        >
          Colors that will be used to distinguish teams
          (Storm&thinsp;/&thinsp;Inferno) when spectating.
        </p>
      </div>
      <div role="group" aria-labelledby="observerIffModes-label">
        <span id="observerIffModes-label">
          Force green&thinsp;/&thinsp;red when:
        </span>
        <ul className={styles.IffChoiceList}>
          <li className={styles.CheckboxField}>
            <Checkbox
              id="followTeamIffInput"
              checked={followTeamIff}
              onChange={(event) => setFollowTeamIff(event.target.checked)}
            />
            <label className={styles.Label} htmlFor="followTeamIffInput">
              Following
            </label>
          </li>
          <li className={styles.CheckboxField}>
            <Checkbox
              id="firstPersonTeamIffInput"
              checked={firstPersonTeamIff}
              onChange={(event) => setFirstPersonTeamIff(event.target.checked)}
            />
            <label className={styles.Label} htmlFor="firstPersonTeamIffInput">
              First-person
            </label>
          </li>
        </ul>
      </div>
      <fieldset className={styles.FlagColorModes}>
        <legend>Flag colors match:</legend>
        <div className={styles.IffChoiceList}>
          {FLAG_COLOR_OPTIONS.map(({ value, label, description }) => (
            <div className={styles.CheckboxField} key={value}>
              <input
                type="radio"
                name="flagColorMode"
                id={`flag-color-${value}`}
                className={choiceStyles.Radio}
                value={value}
                checked={flagColorMode === value}
                onChange={() => setFlagColorMode(value)}
                aria-describedby={`flag-color-${value}-description`}
              />
              <div className={styles.Label}>
                <span>
                  <label htmlFor={`flag-color-${value}`}>{label}</label>{" "}
                  <span
                    className={styles.Description}
                    id={`flag-color-${value}-description`}
                  >
                    –&nbsp;{description}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </fieldset>
  );
}
