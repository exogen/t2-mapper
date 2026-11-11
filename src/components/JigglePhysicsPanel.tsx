import {
  chestSizeFromPercent,
  chestSizeToPercent,
  MAX_CHEST_SIZE_PERCENT,
  useJiggle,
} from "../state/jiggleStore";
import { RangeSlider } from "./RangeSlider";
import styles from "./InspectorControls.module.css";

export function JigglePhysicsPanel() {
  const { sizes, firmness, setSize, setFirmness } = useJiggle();
  return (
    <>
      {(
        [
          ["male", "Male chest"],
          ["female", "Female chest"],
          ["bioderm", "Bioderm chest"],
        ] as const
      ).map(([bodyType, label]) => (
        <div key={bodyType} className={styles.Field}>
          <label
            id={`${bodyType}ChestSizeInput-label`}
            htmlFor={`${bodyType}ChestSizeInput`}
          >
            {label}
          </label>
          <div className={styles.Control}>
            <output htmlFor={`${bodyType}ChestSizeInput`}>
              {chestSizeToPercent(sizes[bodyType])}%
            </output>
            <RangeSlider
              id={`${bodyType}ChestSizeInput`}
              aria-labelledby={`${bodyType}ChestSizeInput-label`}
              aria-valuetext={`${chestSizeToPercent(sizes[bodyType])} percent`}
              min={0}
              max={MAX_CHEST_SIZE_PERCENT}
              step={5}
              value={chestSizeToPercent(sizes[bodyType])}
              onValueChange={(value) =>
                setSize(bodyType, chestSizeFromPercent(value))
              }
            />
          </div>
        </div>
      ))}
      <div className={styles.Field}>
        <label id="chestFirmnessInput-label" htmlFor="chestFirmnessInput">
          Firmness
        </label>
        <div className={styles.Control}>
          <output htmlFor="chestFirmnessInput">{firmness}%</output>
          <RangeSlider
            id="chestFirmnessInput"
            aria-labelledby="chestFirmnessInput-label"
            aria-valuetext={`${firmness} percent`}
            min={0}
            max={100}
            step={10}
            value={firmness}
            onValueChange={setFirmness}
          />
        </div>
      </div>
    </>
  );
}
