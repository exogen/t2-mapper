import { useRef, useState } from "react";
import { RiVolumeMuteFill, RiVolumeUpFill } from "react-icons/ri";
import { useStore } from "zustand";
import type { GameEngine } from "../engine/gameEngine";
import { setPreference, settingsStore } from "../state/settingsStore";
import styles from "./Button.module.css";

export function EnableSoundButton({
  engine,
  available,
}: {
  engine: GameEngine;
  available: boolean;
}) {
  const enableSound = useStore(
    engine.audioRecovery,
    (state) => state.enableSound,
  );
  const audioEnabled = useStore(settingsStore, (state) => state.audioEnabled);
  const [keepVisible, setKeepVisible] = useState(false);
  const recoveryPress = useRef(false);
  if (!available || (!enableSound && !keepVisible)) return null;

  const canMute = audioEnabled && !enableSound;
  const label = canMute ? "Mute sound" : "Enable sound";
  const Icon = canMute ? RiVolumeUpFill : RiVolumeMuteFill;

  return (
    <button
      type="button"
      className={styles.ActionButton}
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        // On touch, the document's touchend can recover sound before click.
        recoveryPress.current = event.button === 0 && enableSound !== null;
        if (recoveryPress.current) setKeepVisible(true);
      }}
      onPointerCancel={() => {
        recoveryPress.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      }}
      onClick={(event) => {
        const recovering =
          enableSound || (event.detail > 0 && recoveryPress.current);
        recoveryPress.current = false;
        if (recovering) {
          event.stopPropagation();
          setKeepVisible(true);
          enableSound?.();
        } else {
          // Let an unmute click reach the document's audio unlock handler.
          setPreference("audioEnabled", !audioEnabled);
        }
      }}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
