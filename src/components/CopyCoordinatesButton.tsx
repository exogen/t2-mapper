import { RefObject, useCallback, useRef, useState } from "react";
import { FaMapPin } from "react-icons/fa";
import { FaClipboardCheck } from "react-icons/fa6";
import { Camera, Quaternion, Vector3 } from "three";
import { useSettings } from "./SettingsProvider";
import styles from "./CopyCoordinatesButton.module.css";

function encodeViewHash({
  position,
  quaternion,
}: {
  position: Vector3;
  quaternion: Quaternion;
}) {
  const trunc = (num: number) => parseFloat(num.toFixed(3));
  const encodedPosition = `${trunc(position.x)},${trunc(position.y)},${trunc(position.z)}`;
  const encodedQuaternion = `${trunc(quaternion.x)},${trunc(quaternion.y)},${trunc(quaternion.z)},${trunc(quaternion.w)}`;
  return `#c${encodedPosition}~${encodedQuaternion}`;
}

export function CopyCoordinatesButton({
  cameraRef,
  missionName,
  missionType,
  disabled,
}: {
  cameraRef: RefObject<Camera | null>;
  missionName: string;
  missionType: string;
  disabled?: boolean;
}) {
  const { fogEnabled } = useSettings();
  const [showCopied, setShowCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyLink = useCallback(async () => {
    clearTimeout(timerRef.current);
    const camera = cameraRef.current;
    if (!camera) return;
    const hash = encodeViewHash(camera);
    const params = new URLSearchParams();
    params.set("mission", `${missionName}~${missionType}`);
    params.set("fog", fogEnabled.toString());
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
  }, [cameraRef, missionName, missionType, fogEnabled]);

  return (
    <button
      type="button"
      className={styles.Root}
      aria-label="Link to coordinates"
      title="Copy the current coordinates to URL"
      onClick={handleCopyLink}
      disabled={disabled}
      data-copied={showCopied ? "true" : "false"}
      id="copyCoordinatesButton"
    >
      <FaMapPin className={styles.MapPin} />
      <FaClipboardCheck className={styles.ClipboardCheck} />
      <span className={styles.ButtonLabel}> Link to coordinates</span>
    </button>
  );
}
