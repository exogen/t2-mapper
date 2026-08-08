import { useCallback, useRef, useState } from "react";
import { FaMapPin } from "react-icons/fa";
import { FaClipboardCheck } from "react-icons/fa6";
import { useSettings } from "./SettingsProvider";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { cameraRegistry } from "../state/cameraRegistry";
import { encodeViewHash } from "./viewHash";
import buttonStyles from "./Button.module.css";
import styles from "./CopyCoordinatesButton.module.css";

export function CopyCoordinatesButton({
  missionName,
  missionType,
  disabled,
}: {
  missionName: string;
  missionType?: string;
  disabled?: boolean;
}) {
  const { fogEnabled } = useSettings();
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const [showCopied, setShowCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyLink = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Command circuit links describe the ortho camera (including zoom);
    // everything else describes the regular perspective camera.
    const camera = isCommandCircuit
      ? cameraRegistry.ortho
      : cameraRegistry.perspective;
    if (!camera) return;
    const hash = encodeViewHash({
      position: camera.position,
      quaternion: camera.quaternion,
      zoom: isCommandCircuit ? camera.zoom : undefined,
    });
    const params = new URLSearchParams();
    const missionString = missionType
      ? `${missionName}~${missionType}`
      : missionName;
    params.set("mission", missionString);
    if (isCommandCircuit) {
      // Fog is always disabled in command circuit view, so no fog param.
      params.set("mode", "command");
    } else {
      params.set("fog", fogEnabled.toString());
    }
    const fullPath = `${window.location.pathname}?${params}${hash}`;
    const fullUrl = `${window.location.origin}${fullPath}`;
    window.history.replaceState(null, "", fullPath);
    try {
      await navigator.clipboard.writeText(fullUrl);
      setShowCopied(true);
      timerRef.current = setTimeout(() => {
        setShowCopied(false);
      }, 1100);
    } catch (err) {
      console.error(err);
    }
  }, [missionName, missionType, fogEnabled, isCommandCircuit]);

  return (
    <button
      type="button"
      className={styles.Button}
      aria-label="Link to coordinates"
      title="Copy the current coordinates to URL"
      onClick={handleCopyLink}
      disabled={disabled}
      data-copied={showCopied ? "true" : "false"}
      id="copyCoordinatesButton"
    >
      <FaMapPin className={styles.PinIcon} />
      <FaClipboardCheck className={styles.ClipboardIcon} />
      <span className={buttonStyles.ButtonLabel}> Link to coordinates</span>
    </button>
  );
}
