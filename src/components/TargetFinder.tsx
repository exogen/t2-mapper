import { useEffect, useMemo, useRef, useState } from "react";
import {
  Combobox,
  ComboboxItem,
  ComboboxList,
  ComboboxProvider,
  Dialog,
  DialogDismiss,
  useComboboxStore,
} from "@ariakit/react";
import { useStore } from "zustand";
import { matchSorter } from "match-sorter";
import { FaSearch } from "react-icons/fa";
import { LuUser, LuX } from "react-icons/lu";
import { PiFlagBannerFill } from "react-icons/pi";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { targetFinderStore } from "../state/targetFinderStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { exitDirector } from "../state/demoDirectorStore";
import { gameEntityStore } from "../state/gameEntityStore";
import {
  enterWatchFollow,
  followFlag,
  getFollowTargets,
  type FollowTarget,
} from "../state/watchFollow";
import { inputControlsStore, useInputAction } from "./InputControls";
import {
  IFF_NEUTRAL,
  isObserverView,
  resolveIffDisplay,
  rgbString,
} from "./iffTheme";
import { useSettings } from "./SettingsProvider";
import { ColoredName } from "./ColoredName";
import { restorePointerLock } from "./restorePointerLock";
import styles from "./TargetFinder.module.css";

function close() {
  targetFinderStore.setState({ open: false });
}

function targetsEqual(a: FollowTarget[], b: FollowTarget[]) {
  return (
    a.length === b.length &&
    a.every(
      (target, i) =>
        target.key === b[i].key &&
        target.label === b[i].label &&
        target.rawName === b[i].rawName &&
        target.entityId === b[i].entityId,
    )
  );
}

function PlayerTargetIcon({ entityId }: { entityId: string }) {
  const { observerTeamColors } = useSettings();
  // Affiliation can change in place without changing the target list.
  const color = useStreamSnapshot(() => {
    const entity = gameEntityStore.getState().streamEntities.get(entityId);
    const display =
      entity?.renderType === "Player"
        ? resolveIffDisplay(entity, isObserverView(), observerTeamColors)
        : IFF_NEUTRAL;
    return rgbString(display.color);
  });
  return <LuUser aria-hidden color={color} />;
}

export function TargetFinder() {
  const open = useStore(targetFinderStore, (s) => s.open);
  const pointerLockTarget = useRef<Element | null>(null);
  const cancelRestore = useRef<(() => void) | null>(null);
  useInputAction("findTarget", () => {
    cancelRestore.current?.();
    cancelRestore.current = null;
    // Release held movement keys before the text input takes focus.
    inputControlsStore.setState({ keys: new Set() });
    pointerLockTarget.current = document.pointerLockElement;
    if (pointerLockTarget.current) document.exitPointerLock();
    targetFinderStore.setState({ open: true });
  });
  function dismiss() {
    close();
    const target = pointerLockTarget.current;
    pointerLockTarget.current = null;
    if (!target) return;
    cancelRestore.current = restorePointerLock(
      target,
      () =>
        !targetFinderStore.getState().open &&
        document.hasFocus() &&
        !commandCircuitStore.getState().active,
    );
  }
  // Mission changes/unmounts close the finder without recapturing the mouse.
  useEffect(
    () => () => {
      cancelRestore.current?.();
      close();
    },
    [],
  );
  return open ? <TargetFinderDialog onClose={dismiss} /> : null;
}

function TargetFinderDialog({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Let the opening key event finish before focusing, so T isn't typed
    // into the newly mounted input by the browser's default key action.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const [query, setQuery] = useState("");
  // Mounted only while searching; closed launchers do no entity-list work.
  const targets = useStreamSnapshot(getFollowTargets, targetsEqual);
  const spawnedPlayers = targets.filter(
    (target) => target.flagSlot == null,
  ).length;
  const matches = useMemo(
    () => (query ? matchSorter(targets, query, { keys: ["label"] }) : targets),
    [targets, query],
  );
  const combobox = useComboboxStore({
    defaultOpen: true,
    setValue: (value) => setQuery(value.trim()),
  });

  function select(key: string) {
    // Resolve again: the player may have respawned or a flag changed hands
    // while the user was choosing an option.
    const target = getFollowTargets().find(
      (candidate) => candidate.key === key,
    );
    if (!target) return;
    exitDirector();
    if (target.flagSlot != null) {
      followFlag(target.flagSlot);
    } else {
      streamPlaybackStore.setState({ followCameraMode: "orbitOverride" });
      enterWatchFollow(target.entityId);
    }
    inputRef.current?.blur();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      portal={false}
      autoFocusOnShow={false}
      autoFocusOnHide={false}
      backdrop={<div className={styles.Backdrop} />}
      className={styles.Dialog}
      aria-label="Find target"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ComboboxProvider store={combobox}>
        <div className={styles.Search}>
          <span className={styles.Icon}>
            <FaSearch aria-hidden />
          </span>
          <Combobox
            ref={inputRef}
            autoSelect="always"
            placeholder="Find a player or flag…"
            aria-label="Find a player or flag"
            className={styles.Input}
          />
          <DialogDismiss
            className={styles.Close}
            aria-label="Close target finder"
          >
            <LuX aria-hidden />
          </DialogDismiss>
        </div>
        <ComboboxList className={styles.List} alwaysVisible>
          {matches.map((target) => (
            <ComboboxItem
              key={target.key}
              value={target.key}
              className={styles.Item}
              focusOnHover
              hideOnClick={false}
              setValueOnClick={false}
              onClick={() => select(target.key)}
            >
              <span className={styles.Icon}>
                {target.flagSlot != null ? (
                  <PiFlagBannerFill
                    aria-hidden
                    color={rgbString(
                      resolveIffDisplay(
                        { teamId: target.flagSlot },
                        true,
                        "blueOrange",
                      ).color,
                    )}
                  />
                ) : (
                  <PlayerTargetIcon entityId={target.entityId} />
                )}
              </span>
              <span className={styles.Name}>
                {target.rawName ? (
                  <ColoredName raw={target.rawName} />
                ) : (
                  target.label
                )}
              </span>
              <span className={styles.Kind}>
                {target.flagSlot != null ? "Flag" : "Player"}
              </span>
            </ComboboxItem>
          ))}
          {matches.length === 0 && (
            <div className={styles.Empty} role="status">
              {targets.length
                ? "No targets found"
                : "No players or flags available"}
            </div>
          )}
        </ComboboxList>
      </ComboboxProvider>
      <div className={styles.Footer}>
        <span className={styles.PlayerCount}>
          {spawnedPlayers} {spawnedPlayers === 1 ? "player" : "players"} spawned
        </span>
        <div className={styles.Hint}>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> follow
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </Dialog>
  );
}
