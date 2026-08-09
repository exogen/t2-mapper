import { ImSad2 } from "react-icons/im";
import { statsStore, useStats } from "../state/statsStore";
import type { StatsTeamFilter } from "../stats/types";
import type { HeatmapScheme } from "../stats/colormap";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import styles from "./InspectorControls.module.css";

const FILTERS: Array<{ value: StatsTeamFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: 1, label: DEFAULT_TEAM_NAMES[1] },
  { value: 2, label: DEFAULT_TEAM_NAMES[2] },
];

const SCHEMES: Array<{ value: HeatmapScheme; label: string }> = [
  { value: "team", label: "Default" },
  { value: "turbo", label: "Turbo" },
  { value: "viridis", label: "Viridis" },
];

function StatsError({ children }: { children: string }) {
  return (
    <p className={styles.ErrorMessage}>
      <ImSad2 />
      <span>{children}</span>
    </p>
  );
}

/**
 * Sidebar controls for a loaded stats file. The heatmap (position density)
 * is the first visualization; event overlays can join it later. Rendered
 * inside the Stats accordion when data exists.
 */
export function StatsPanel() {
  const data = useStats((s) => s.data);
  const heatmapVisible = useStats((s) => s.heatmapVisible);
  const heatmapTeamFilter = useStats((s) => s.heatmapTeamFilter);
  const heatmapScheme = useStats((s) => s.heatmapScheme);
  const error = useStats((s) => s.error);
  const anchorWarning = useStats((s) => s.anchorWarning);
  if (!data) {
    return error ? <StatsError>{error}</StatsError> : null;
  }

  return (
    <>
      <div className={styles.Field}>
        <div className={styles.Label}>Heatmap</div>
      </div>
      <div className={styles.CheckboxField}>
        <input
          id="heatmapVisibleInput"
          type="checkbox"
          checked={heatmapVisible}
          onChange={(e) =>
            statsStore.getState().setHeatmapVisible(e.target.checked)
          }
        />
        <label className={styles.Label} htmlFor="heatmapVisibleInput">
          Show heatmap in command circuit
        </label>
      </div>
      <div className={styles.Field}>
        <div className={styles.Label}>Team</div>
        <div className={styles.Control} role="radiogroup" aria-label="Team">
          {FILTERS.map(({ value, label }) => (
            <label key={String(value)} className={styles.RadioLabel}>
              <input
                type="radio"
                name="heatmapTeamFilter"
                checked={heatmapTeamFilter === value}
                onChange={() =>
                  statsStore.getState().setHeatmapTeamFilter(value)
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className={styles.Field}>
        <label htmlFor="heatmapSchemeInput">Color scheme</label>
        <div className={styles.Control}>
          <select
            id="heatmapSchemeInput"
            value={heatmapScheme}
            onChange={(e) =>
              statsStore
                .getState()
                .setHeatmapScheme(e.target.value as HeatmapScheme)
            }
          >
            {SCHEMES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <StatsError>{error}</StatsError> : null}
      {anchorWarning ? <StatsError>{anchorWarning}</StatsError> : null}
    </>
  );
}
