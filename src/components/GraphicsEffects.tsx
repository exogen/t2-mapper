import { useStore } from "zustand";
import {
  COLOR_GRADE_PATHS,
  GRAPHICS_EFFECT_KEYS,
  GRAPHICS_EFFECTS,
  type ColorGrade,
} from "../graphicsEffects";
import { clipStore } from "../state/clipStore";
import { graphicsEffectsStore } from "../state/graphicsEffectsStore";
import { Checkbox } from "./Checkbox";
import { RangeSlider } from "./RangeSlider";
import { Select } from "./Select";
import styles from "./InspectorControls.module.css";
import fieldsetStyles from "./SidebarFieldset.module.css";

const COLOR_GRADE_OPTIONS = [
  { value: "off", label: "Off" },
  ...Object.keys(COLOR_GRADE_PATHS).map((name) => ({
    value: name,
    label: name,
  })),
];

function EffectIntensity({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div className={styles.Control}>
      <output htmlFor={id}>{percent}%</output>
      <RangeSlider
        id={id}
        min={0}
        max={1}
        step={0.1}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${percent} percent`}
        onValueChange={onChange}
      />
    </div>
  );
}

export function GraphicsEffects() {
  const clipEffects = useStore(clipStore, (state) => state.playbackEffects);
  const effectsStore = clipEffects ?? graphicsEffectsStore;
  const effects = useStore(effectsStore);
  const locked = clipEffects !== null;
  const disabled = locked || !effects.enabled;
  return (
    <fieldset
      className={`${fieldsetStyles.Fieldset} ${styles.GraphicsEffects}`}
      aria-labelledby="graphics-effects-label"
      disabled={disabled}
      title={
        locked ? "This clip uses the creator’s graphics effects." : undefined
      }
    >
      <legend>
        <label className={styles.GraphicsEffectsToggle}>
          <Checkbox
            checked={effects.enabled}
            disabled={locked}
            onChange={(event) =>
              effectsStore.setState({ enabled: event.target.checked })
            }
          />
          <span id="graphics-effects-label">Effects</span>
        </label>
        <span
          className={styles.GraphicsEffectsStatus}
          data-error={effects.gradeStatus === "error" || undefined}
          role="status"
        >
          {effects.gradeStatus === "loading" && "Loading color grade…"}
          {effects.gradeStatus === "error" && "Couldn’t load grade."}
        </span>
        {effects.gradeStatus === "error" && (
          <button
            type="button"
            className={styles.GraphicsEffectsRetry}
            disabled={!effects.enabled}
            aria-label="Retry loading color grade"
            onClick={() => {
              document
                .getElementById("color-grade")
                ?.focus({ preventScroll: true });
              effectsStore.setState({ gradeStatus: "loading" });
            }}
          >
            Retry
          </button>
        )}
      </legend>
      <div className={styles.Field}>
        <label htmlFor="color-grade">Color grade</label>
        <div className={styles.Control}>
          <Select
            id="color-grade"
            value={effects.colorGrade}
            options={COLOR_GRADE_OPTIONS}
            disabled={disabled}
            onChange={(value) => {
              if (value === effects.colorGrade) return;
              effectsStore.setState({
                colorGrade: value as ColorGrade,
                gradeStatus:
                  value === "off" || effects.gradeIntensity === 0
                    ? "idle"
                    : "loading",
              });
            }}
          />
        </div>
      </div>
      <div className={styles.Field}>
        <label htmlFor="color-grade-intensity">Grade intensity</label>
        <EffectIntensity
          id="color-grade-intensity"
          label="Grade intensity"
          value={effects.gradeIntensity}
          disabled={
            disabled ||
            effects.colorGrade === "off" ||
            effects.gradeStatus !== "idle"
          }
          onChange={(gradeIntensity) =>
            effectsStore.setState({ gradeIntensity })
          }
        />
      </div>
      {GRAPHICS_EFFECT_KEYS.map((effect) => (
        <div key={effect} className={styles.CheckboxField}>
          <Checkbox
            id={`graphics-effect-${effect}`}
            checked={effects[effect]}
            onChange={(event) =>
              effectsStore.setState({ [effect]: event.target.checked })
            }
          />
          <label className={styles.Label} htmlFor={`graphics-effect-${effect}`}>
            {GRAPHICS_EFFECTS[effect]}
          </label>
          <EffectIntensity
            id={`graphics-effect-${effect}-intensity`}
            label={`${GRAPHICS_EFFECTS[effect]} intensity`}
            value={effects.intensity[effect]}
            disabled={disabled || !effects[effect]}
            onChange={(value) =>
              effectsStore.setState(({ intensity }) => ({
                intensity: { ...intensity, [effect]: value },
              }))
            }
          />
        </div>
      ))}
    </fieldset>
  );
}
