import { Dialog, DialogHeading } from "@ariakit/react";
import { useEffect, type RefObject } from "react";
import { inputControlsStore } from "../state/inputControls";
import { clipStore } from "../state/clipStore";
import styles from "./ClipRecordingHelpDialog.module.css";

export function ClipRecordingHelpDialog({
  onCancel,
  onStart,
  finalFocus,
  disabled = false,
}: {
  onCancel: () => void;
  onStart: () => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
}) {
  useEffect(() => {
    inputControlsStore.setState({ keys: new Set() });
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  return (
    <Dialog
      open
      aria-label="Record clip"
      className={styles.Dialog}
      backdrop={<div className={styles.Overlay} />}
      onClose={onCancel}
      finalFocus={finalFocus}
      autoFocusOnHide={() => {
        return !clipStore.getState().recording;
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <DialogHeading className={styles.Title}>Record a clip</DialogHeading>
      <p>
        Record up to 60 seconds of a demo to share. Camera moves, view changes,
        and speed changes are captured. Tip: using Quick Cam can assist in
        preparing your shot selection.
      </p>
      <p>
        After recording, you can adjust camera smoothing, transition styles, and
        other settings.
      </p>
      <div className={styles.Buttons}>
        <button
          type="button"
          className={styles.SecondaryButton}
          onClick={onCancel}
        >
          Nevermind
        </button>
        <button
          type="button"
          className={styles.PrimaryButton}
          disabled={disabled}
          onClick={onStart}
        >
          Start recording
        </button>
      </div>
    </Dialog>
  );
}
