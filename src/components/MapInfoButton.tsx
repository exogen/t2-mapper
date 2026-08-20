import { LuClipboardList } from "react-icons/lu";
import { hasMission } from "../manifest";
import { useDataSource, useMissionName } from "../state/gameEntityStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
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
  // Even for maps missing from our library, the server sends the
  // loading-screen info (quote/objectives/rules) at join — enough to
  // populate the dialog.
  const hasServerLoadInfo = useStreamSnapshot((s) => s?.loadInfo != null);

  return (
    <button
      type="button"
      className={styles.Button}
      aria-label="Show map info"
      onClick={onClick}
      // Requires an actually loaded map (explore, demo, or live) — the
      // mission URL param alone has a default value.
      disabled={
        dataSource == null || (!missionInManifest && !hasServerLoadInfo)
      }
    >
      <LuClipboardList />
      <span className={styles.ButtonLabel}>Show map info</span>
    </button>
  );
}
