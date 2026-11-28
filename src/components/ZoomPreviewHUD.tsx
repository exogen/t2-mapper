import { useStore } from "zustand";
import { cameraZoomPreviewStore } from "../state/cameraZoomPreview";
import styles from "./ZoomPreviewHUD.module.css";

/** The selected zoom's framing over the current camera view. */
export function ZoomPreviewHUD() {
  const scale = useStore(cameraZoomPreviewStore, (state) => state.scale);
  if (scale === null) return null;

  const size = `${scale * 100}%`;
  return (
    <div
      aria-hidden="true"
      className={styles.ZoomPreviewHUD}
      style={{ width: size, height: size }}
    >
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
