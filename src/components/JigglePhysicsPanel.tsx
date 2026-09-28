import {
  chestSizeFromPercent,
  chestSizeToPercent,
  MAX_CHEST_SIZE_PERCENT,
  useJiggle,
} from "../state/jiggleStore";
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
          <label htmlFor={`${bodyType}ChestSizeInput`}>{label}</label>
          <div className={styles.Control}>
            <output htmlFor={`${bodyType}ChestSizeInput`}>
              {chestSizeToPercent(sizes[bodyType])}%
            </output>
            <input
              id={`${bodyType}ChestSizeInput`}
              type="range"
              min={0}
              max={MAX_CHEST_SIZE_PERCENT}
              step={5}
              value={chestSizeToPercent(sizes[bodyType])}
              onChange={(event) =>
                setSize(
                  bodyType,
                  chestSizeFromPercent(Number(event.target.value)),
                )
              }
            />
          </div>
        </div>
      ))}
      <div className={styles.Field}>
        <label htmlFor="chestFirmnessInput">Firmness</label>
        <div className={styles.Control}>
          <output htmlFor="chestFirmnessInput">{firmness}%</output>
          <input
            id="chestFirmnessInput"
            type="range"
            min={0}
            max={100}
            step={10}
            value={firmness}
            onChange={(event) => setFirmness(Number(event.target.value))}
          />
        </div>
      </div>
    </>
  );
}
