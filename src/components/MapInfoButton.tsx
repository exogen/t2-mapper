import { LuClipboardList } from "react-icons/lu";
import { hasMission } from "../manifest";
import { useDataSource, useMissionName } from "../state/gameEntityStore";
import styles from "./Button.module.css";

export function MapInfoButton({
  missionName,
  onClick,
}: {
  missionName: string;
  onClick: () => void;
}) {
  const dataSource = useDataSource();
  const storeMissionName = useMissionName();
  const hasStreamData = dataSource === "demo" || dataSource === "live";
  // When streaming, the URL query param may not reflect the actual map.
  // Use the store's mission name (from the server) for the manifest check.
  const effectiveMissionName = hasStreamData ? storeMissionName : missionName;
  const missionInManifest = effectiveMissionName
    ? hasMission(effectiveMissionName)
    : false;

  return (
    <button
      type="button"
      className={styles.Button}
      aria-label="Show map info"
      onClick={onClick}
      disabled={!missionInManifest}
    >
      <LuClipboardList />
      <span className={styles.ButtonLabel}>Show map info</span>
    </button>
  );
}
