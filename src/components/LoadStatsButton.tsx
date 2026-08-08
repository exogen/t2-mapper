import { useCallback, useRef } from "react";
import { RiFileChartLine } from "react-icons/ri";
import { createLogger } from "../logger";
import { getMissionInfo, getMissionList, hasMission } from "../manifest";
import { statsStore, useStats } from "../state/statsStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { parseStatsJson } from "../stats/statsJson";
import type { CurrentMission } from "./useQueryParams";
import styles from "./Button.module.css";

const log = createLogger("LoadStatsButton");

/**
 * Resolves a source map name against the manifest, case-insensitively
 * (Torque mission names are case-insensitive).
 */
function resolveMissionName(name: string): string | null {
  if (hasMission(name)) return name;
  const lower = name.toLowerCase();
  return getMissionList().find((m) => m.toLowerCase() === lower) ?? null;
}

export function LoadStatsButton({
  missionName,
  onChangeMission,
}: {
  missionName: string;
  onChangeMission: (mission: CurrentMission) => void;
}) {
  const isLoaded = useStats((s) => s.data !== null);
  const inputRef = useRef<HTMLInputElement>(null);
  const parseTokenRef = useRef(0);

  const handleClick = useCallback(() => {
    if (isLoaded) {
      parseTokenRef.current += 1;
      statsStore.getState().clear();
      return;
    }
    inputRef.current?.click();
  }, [isLoaded]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset the input so the same file can be re-selected.
      e.target.value = "";
      const parseToken = parseTokenRef.current + 1;
      parseTokenRef.current = parseToken;
      try {
        const text = await file.text();
        if (parseTokenRef.current !== parseToken) return;
        const data = parseStatsJson(text, file.name);
        const resolved = resolveMissionName(data.missionName);
        if (!resolved) {
          statsStore
            .getState()
            .setError(
              `Map "${data.missionName}" is not available in this app.`,
            );
          return;
        }
        data.missionName = resolved;
        statsStore.getState().setData(data);
        // Switch when viewing a different mission — or the same mission in
        // demo/live mode, since the overlay only works in map viewing.
        const dataSource = gameEntityStore.getState().dataSource;
        if (
          dataSource !== "map" ||
          resolved.toLowerCase() !== missionName.toLowerCase()
        ) {
          onChangeMission({
            missionName: resolved,
            missionType: getMissionInfo(resolved).missionTypes[0],
          });
        }
      } catch (err) {
        if (parseTokenRef.current !== parseToken) return;
        log.error("Failed to load stats file: %o", err);
        statsStore
          .getState()
          .setError(
            err instanceof Error ? err.message : "Failed to load stats file.",
          );
      }
    },
    [missionName, onChangeMission],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button
        type="button"
        className={styles.Button}
        aria-label={isLoaded ? "Unload stats" : "Load match stats (.json)"}
        title={isLoaded ? "Unload stats" : "Load match stats (.json)"}
        onClick={handleClick}
        data-active={isLoaded}
      >
        <RiFileChartLine />
        <span className={styles.ButtonLabel}>Stats</span>
        <span className={styles.ButtonHint}>
          {isLoaded ? "Click to unload" : "Load stats file"}
        </span>
      </button>
    </>
  );
}
