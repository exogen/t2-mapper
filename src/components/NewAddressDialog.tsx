import { useEffect, useRef, useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import styles from "./NewAddressDialog.module.css";

const OLD_HOSTNAME = "exogen.github.io";
const NEW_ORIGIN = "https://play.tribes2.online";

/**
 * The equivalent URL on the new host. The app has no meaningful pathname
 * (the old host's /t2-mapper/ is just its GitHub Pages base), so only the
 * query params and hash carry over. Exported for tests.
 */
export function buildNewUrl(viewParams: string): string {
  return `${NEW_ORIGIN}/${viewParams}`;
}

/**
 * The current `search` + `hash`, readable during render (same
 * useSyncExternalStore pattern as useTouchDevice).
 */
function useViewParams(): string {
  return useSyncExternalStore(subscribeToLocation, getViewParams, () => "");
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

function getViewParams(): string {
  return `${window.location.search}${window.location.hash}`;
}

const newAddressDialogStore = createStore<{ open: boolean }>(() => ({
  open: false,
}));

/**
 * Opens the dialog regardless of hostname (e.g. from the Debug panel).
 */
export function showNewAddressDialog() {
  newAddressDialogStore.setState({ open: true });
}

/**
 * Shown when the app is loaded from its old GitHub Pages address, offering
 * a jump to the same view on the new domain.
 */
export function NewAddressDialog() {
  const open = useStoreWithEqualityFn(newAddressDialogStore, (s) => s.open);
  const newUrl = buildNewUrl(useViewParams());
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-open when loaded from the old host. Checked in an effect rather
  // than at render or module scope so a server render and the first client
  // render would agree.
  useEffect(() => {
    if (window.location.hostname === OLD_HOSTNAME) {
      showNewAddressDialog();
    }
  }, []);

  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const dismiss = () => {
    newAddressDialogStore.setState({ open: false });
  };

  return (
    <div className={styles.Overlay} onClick={dismiss}>
      <div
        ref={dialogRef}
        className={styles.Dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Incoming transmission"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") dismiss();
        }}
      >
        <h1 className={styles.Title}>Incoming transmission</h1>
        <p>
          This app now lives at{" "}
          <a href={newUrl}>
            <strong>play.tribes2.online</strong>
          </a>
          . The new site is faster and more up to date. This one receives fewer
          updates.
        </p>
        <p>
          Follow these links and you&rsquo;ll land on exactly the same mission.
        </p>
        <div className={styles.Buttons}>
          <button
            type="button"
            className={styles.SecondaryButton}
            onClick={dismiss}
          >
            Stay here for now
          </button>
          <button
            type="button"
            className={styles.PrimaryButton}
            onClick={() => {
              window.location.href = newUrl;
            }}
          >
            Take me there
          </button>
        </div>
      </div>
    </div>
  );
}
