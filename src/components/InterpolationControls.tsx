import { useState } from "react";
import { useStore } from "zustand";
import { clipStore, type ClipState } from "../state/clipStore";
import {
  DEFAULT_PLAYER_INTERPOLATION,
  RETAIL_PLAYER_INTERPOLATION,
  normalizePlayerInterpolation,
  PLAYER_INTERPOLATION_RANGES,
  samePlayerInterpolation,
  type PlayerInterpolationSettings,
} from "../stream/playerInterpolation";
import { useDebug } from "./SettingsProvider";
import styles from "./InspectorControls.module.css";
import fieldsetStyles from "./SidebarFieldset.module.css";

const INTERPOLATION_FIELDS = [
  ["maxLatencyTicks", "Max latency ticks"],
  ["maxPredictionTicks", "Max prediction ticks"],
  ["maxWarpTicks", "Max warp ticks"],
  ["minWarpTicks", "Min warp ticks"],
] as const;

const INTERPOLATION_PRESETS = [
  ["MapGenius defaults", DEFAULT_PLAYER_INTERPOLATION],
  ["Tribes 2 defaults", RETAIL_PLAYER_INTERPOLATION],
] as const;

function isClipInUse({ recording, draft, active }: ClipState): boolean {
  return recording || draft !== null || active !== null;
}

function InterpolationTickField({
  name,
  label,
  value,
  onCommit,
}: {
  name: keyof PlayerInterpolationSettings;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = `interpolation-${name}`;
  return (
    <div className={styles.Field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.Control}>
        <input
          id={id}
          className={styles.InterpolationInput}
          type="number"
          {...PLAYER_INTERPOLATION_RANGES[name]}
          value={draft ?? value}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            const next = event.currentTarget.valueAsNumber;
            setDraft(null);
            if (Number.isFinite(next)) onCommit(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}

export function InterpolationControls({
  viewingClip,
}: {
  viewingClip: boolean;
}) {
  const clipInUse = useStore(clipStore, isClipInUse);
  const activeInterpolation = useStore(
    clipStore,
    ({ active }) =>
      active && (active.playerInterpolation ?? RETAIL_PLAYER_INTERPOLATION),
  );
  const { playerInterpolation, setPlayerInterpolation } = useDebug();
  const [resetCount, setResetCount] = useState(0);
  const locked = clipInUse || viewingClip;
  const shownInterpolation = activeInterpolation ?? playerInterpolation;

  function applyInterpolation(
    getNext: (
      previous: Readonly<PlayerInterpolationSettings>,
    ) => Readonly<PlayerInterpolationSettings>,
  ): boolean {
    if (viewingClip || isClipInUse(clipStore.getState())) return false;
    setPlayerInterpolation((previous) => {
      const next = getNext(previous);
      return samePlayerInterpolation(previous, next) ? previous : next;
    });
    return true;
  }

  return (
    <fieldset
      className={`${fieldsetStyles.Fieldset} ${styles.PlayerInterpolation}`}
      disabled={locked}
    >
      <legend>Interpolation</legend>
      {INTERPOLATION_FIELDS.map(([name, label]) => (
        <InterpolationTickField
          key={`${name}:${locked}:${resetCount}`}
          name={name}
          label={label}
          value={shownInterpolation[name]}
          onCommit={(value) => {
            applyInterpolation((previous) =>
              normalizePlayerInterpolation({ ...previous, [name]: value }),
            );
          }}
        />
      ))}
      <div className={styles.InterpolationPresets}>
        {INTERPOLATION_PRESETS.map(([label, preset]) => (
          <button
            key={label}
            type="button"
            className={styles.InterpolationPreset}
            onClick={() => {
              if (applyInterpolation(() => preset))
                setResetCount((count) => count + 1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
