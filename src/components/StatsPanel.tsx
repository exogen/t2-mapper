import { ImSad2 } from "react-icons/im";
import { statsStore, useStats } from "../state/statsStore";
import { useEngineSelector } from "../state/engineStore";
import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import type { HeatmapScheme } from "../stats/colormap";
import { useRecording } from "./usePlayback";
import { ScanProgress } from "./ScanProgress";
import { Select } from "./Select";
import accordionStyles from "./Accordion.module.css";
import buttonStyles from "./Button.module.css";
import styles from "./InspectorControls.module.css";

const SCHEMES: Array<{ value: HeatmapScheme; label: string }> = [
  { value: "turbo", label: "Turbo" },
  { value: "viridis", label: "Viridis" },
  { value: "team", label: "Team" },
];

/** Whole-match heatmaps for the game at the current playback position. */
export function StatsPanel() {
  const recording = useRecording();
  const downloadComplete = useEngineSelector(
    (s) => s.playback.downloadComplete,
  );
  const data = useStats((s) => s.activeMatch);
  const matchCount = useStats((s) => s.data?.matches.length ?? 0);
  const scanProgress = useStats((s) => s.scanProgress);
  const selectedPlayerId = useStats((s) => s.selectedPlayerId);
  const heatmapScheme = useStats((s) => s.heatmapScheme);
  const error = useStats((s) => s.error);
  const commandCircuitActive = useCommandCircuit((s) => s.active);

  if (recording?.source !== "demo") {
    return null;
  }
  if (error) {
    return (
      <div className={accordionStyles.Body}>
        <p className={styles.ErrorMessage} role="alert">
          <ImSad2 />
          <span>{error}</span>
        </p>
      </div>
    );
  }
  if (!data) {
    if (scanProgress != null) return <ScanProgress progress={scanProgress} />;
    return (
      <div className={accordionStyles.Body}>
        <p className={styles.Description} role="status">
          {downloadComplete
            ? "Preparing stats…"
            : "Waiting for the demo to finish downloading…"}
        </p>
      </div>
    );
  }
  if (data.players.length === 0) {
    return (
      <div className={accordionStyles.Body}>
        <p className={styles.Description}>
          {matchCount > 1 ? `Match ${data.id + 1}. ` : ""}
          {data.matchStartSec == null
            ? "No match play could be identified in this recorded portion."
            : "No player positions were recorded during this match."}
        </p>
      </div>
    );
  }

  return (
    <div className={accordionStyles.Body}>
      <div className={styles.Field}>
        <label id="heatmapPlayerLabel" htmlFor="heatmapPlayerInput">
          Player heatmap
        </label>
        <div className={styles.Control}>
          <Select
            id="heatmapPlayerInput"
            aria-labelledby="heatmapPlayerLabel"
            aria-describedby="heatmapDescription"
            value={selectedPlayerId == null ? "" : String(selectedPlayerId)}
            onChange={(value) => {
              const id = value === "" ? null : Number(value);
              statsStore.getState().selectPlayer(id);
              if (id != null) commandCircuitStore.getState().activate();
            }}
            options={[
              { value: "", label: "Disabled" },
              {
                label: "Players",
                options: data.players.map((player) => ({
                  value: String(player.id),
                  label: player.name,
                })),
              },
            ]}
          />
        </div>
        <p id="heatmapDescription" className={styles.Description}>
          {matchCount > 1 ? `Match ${data.id + 1}. ` : ""}
          Heat shows time spent across the match.
          {!data.matchComplete && (
            <>
              {" "}
              This demo includes only part of this match; the heatmap covers the
              recorded portion.
            </>
          )}
        </p>
      </div>
      {selectedPlayerId != null && (
        <>
          <div className={styles.Field}>
            <label id="heatmapSchemeLabel" htmlFor="heatmapSchemeInput">
              Color scheme
            </label>
            <div className={styles.Control}>
              <Select
                id="heatmapSchemeInput"
                aria-labelledby="heatmapSchemeLabel"
                value={heatmapScheme}
                onChange={(value) =>
                  statsStore.getState().setHeatmapScheme(value as HeatmapScheme)
                }
                options={SCHEMES}
              />
            </div>
          </div>
          {!commandCircuitActive && (
            <button
              type="button"
              className={buttonStyles.Button}
              onClick={() => commandCircuitStore.getState().activate()}
            >
              <span className={buttonStyles.ButtonLabel}>View heatmap</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
