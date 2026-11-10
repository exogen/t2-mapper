import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  Dialog,
  DialogDismiss,
  useDialogStore,
  useStoreState,
  type DialogStore,
} from "@ariakit/react";
import { useStore } from "zustand";
import { FaSearch } from "react-icons/fa";
import { IoMdCloseCircle } from "react-icons/io";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { MdFastForward, MdFastRewind } from "react-icons/md";
import { PiFlagBannerFill } from "react-icons/pi";
import { TbDeviceGamepad2Filled } from "react-icons/tb";
import type { GameEngine } from "../engine/gameEngine";
import { suppressCameraMovement } from "../engine/suppressCameraMovement";
import { useCameraOwner } from "../state/cameraOwner";
import { inputControlsStore } from "../state/inputControls";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useControls } from "./SettingsProvider";
import { useMobileCameraActions } from "./useMobileCameraActions";
import styles from "./MobileCameraDrawer.module.css";

type MobileCameraDrawerProps = {
  engine: GameEngine;
  onOpenChange?: (open: boolean) => void;
};

/** An additional touch entry point for the existing spectator camera actions. */
export function MobileCameraDrawer({
  engine,
  onOpenChange,
}: MobileCameraDrawerProps) {
  const owner = useCameraOwner();
  return owner === "input" || owner === "commandCircuit" ? (
    <CameraDrawerControls engine={engine} onOpenChange={onOpenChange} />
  ) : null;
}

function CameraDrawerControls({
  engine,
  onOpenChange,
}: MobileCameraDrawerProps) {
  const { touchMode } = useControls();
  const following = useStore(
    streamPlaybackStore,
    (state) =>
      state.followEntityId != null &&
      (state.cameraMode === "orbitOverride" ||
        state.cameraMode === "firstPersonOverride"),
  );
  const dialog = useDialogStore();
  const open = useStoreState(dialog, "open");
  const mounted = useStoreState(dialog, "mounted");
  const launcher = useRef<HTMLButtonElement>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const launcherClasses = [styles.Launcher];
  if (touchMode === "dualStick") {
    launcherClasses.push(styles.LauncherCentered);
    if (following) launcherClasses.push(styles.LauncherAboveFollowing);
  }

  useEffect(() => {
    if (mounted) return;
    // Release the modal's input filter before dispatching observer triggers.
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  }, [mounted]);

  function select(action: () => void) {
    pendingAction.current = action;
    dialog.hide();
  }

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className={launcherClasses.join(" ")}
        aria-label="Camera controls"
        title="Camera controls"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={mounted && !open ? true : undefined}
        onClick={() => {
          if (!mounted) dialog.show();
        }}
      >
        <span className={styles.LauncherCircle} aria-hidden>
          <TbDeviceGamepad2Filled className={styles.LauncherIcon} />
        </span>
      </button>
      {mounted ? (
        <CameraDrawerDialog
          store={dialog}
          engine={engine}
          onOpenChange={onOpenChange}
          onSelect={select}
          finalFocus={launcher}
        />
      ) : null}
    </>
  );
}

function CameraDrawerDialog({
  store,
  engine,
  finalFocus,
  onOpenChange,
  onSelect,
}: {
  store: DialogStore;
  engine: GameEngine;
  finalFocus: RefObject<HTMLButtonElement | null>;
  onOpenChange?: (open: boolean) => void;
  onSelect: (action: () => void) => void;
}) {
  const actions = useMobileCameraActions();
  const followedFlag = useStore(streamPlaybackStore, (s) => s.followFlagSlot);

  useLayoutEffect(() => {
    onOpenChange?.(true);
    // Match the app's other dialogs: release held input before taking focus.
    inputControlsStore.setState({ keys: new Set() });
    if (document.pointerLockElement) document.exitPointerLock();
    const release = suppressCameraMovement(engine);
    return () => {
      release();
      onOpenChange?.(false);
    };
  }, [engine, onOpenChange]);

  return (
    <Dialog
      store={store}
      portal={false}
      finalFocus={finalFocus}
      autoFocusOnShow={(element) => {
        // Avoid scrolling the game view toward a still-sliding focus target.
        element?.focus({ preventScroll: true });
        return false;
      }}
      backdrop={<div className={styles.Backdrop} />}
      className={styles.Dialog}
      aria-label="Camera controls"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <div className={styles.Header}>
        <div
          className={styles.SeekRow}
          role="group"
          aria-label="Playback seeking"
        >
          <button
            type="button"
            className={styles.SeekButton}
            aria-label="Rewind 30 seconds"
            disabled={!actions.canSeek}
            onClick={actions.rewind30}
          >
            <MdFastRewind aria-hidden />
            <span>−30s</span>
          </button>
          <button
            type="button"
            className={styles.SeekButton}
            aria-label="Rewind 5 seconds"
            disabled={!actions.canSeek}
            onClick={actions.rewind5}
          >
            <MdFastRewind aria-hidden />
            <span>−5s</span>
          </button>
          <button
            type="button"
            className={styles.SeekButton}
            aria-label="Fast forward 5 seconds"
            disabled={!actions.canSeek}
            onClick={actions.forward5}
          >
            <MdFastForward aria-hidden />
            <span>+5s</span>
          </button>
          <button
            type="button"
            className={styles.SeekButton}
            aria-label="Fast forward 30 seconds"
            disabled={!actions.canSeek}
            onClick={actions.forward30}
          >
            <MdFastForward aria-hidden />
            <span>+30s</span>
          </button>
        </div>
        <DialogDismiss
          type="button"
          className={styles.Close}
          aria-label="Close camera controls"
        >
          <IoMdCloseCircle aria-hidden />
        </DialogDismiss>
      </div>

      <div className={styles.Body}>
        <section className={styles.Section} aria-label="Camera mode">
          <div className={styles.ModeRow}>
            {actions.modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={styles.ModeButton}
                aria-pressed={mode.active}
                data-active={mode.active}
                disabled={!mode.enabled}
                onClick={() => onSelect(() => actions.selectMode(mode.id))}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.Section} aria-label="Player cameras">
          <div className={styles.PlayerRow}>
            <button
              type="button"
              className={styles.PreviousPlayerButton}
              disabled={!actions.canCyclePlayers}
              onClick={() => onSelect(actions.previousPlayer)}
            >
              <LuChevronLeft aria-hidden />
              Previous player
            </button>
            <button
              type="button"
              className={styles.TargetButton}
              aria-label="Select target"
              title="Select target"
              aria-haspopup="dialog"
              disabled={!actions.canFindTarget}
              onClick={() => onSelect(actions.findTarget)}
            >
              <FaSearch aria-hidden />
            </button>
            <button
              type="button"
              className={styles.NextPlayerButton}
              disabled={!actions.canCyclePlayers}
              onClick={() => onSelect(actions.nextPlayer)}
            >
              Next player
              <LuChevronRight aria-hidden />
            </button>
          </div>
        </section>

        {actions.canFollowFlags && actions.flags.length > 0 ? (
          <section className={styles.Section} aria-label="Flag cameras">
            <div className={styles.Row}>
              {actions.flags.map((flag) => (
                <button
                  key={flag.slot}
                  type="button"
                  className={styles.FlagButton}
                  aria-label={`Follow ${flag.label}`}
                  title={flag.label}
                  aria-pressed={followedFlag === flag.slot}
                  data-active={followedFlag === flag.slot}
                  onClick={() => {
                    if (actions.followFlag(flag.slot)) store.hide();
                  }}
                >
                  <PiFlagBannerFill aria-hidden />
                  <span className={styles.FlagLabel}>{flag.label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
