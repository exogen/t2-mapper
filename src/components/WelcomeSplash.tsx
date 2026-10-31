import { useEffect } from "react";
import { setWelcomeSplashOpen } from "../state/welcomeSplashState";
import { PiCassetteTapeFill } from "react-icons/pi";
import { BsFillLightningChargeFill } from "react-icons/bs";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./WelcomeSplash.module.css";

/**
 * First-visit welcome shown over the explore view when the URL carries no
 * explicit selection. Not a modal: no backdrop, and the map behind it
 * stays interactive — only the panel itself takes pointer events.
 */
export function WelcomeSplash({
  onWatchDemos,
  onWatchLive,
  onDismiss,
  loading,
}: {
  onWatchDemos: () => void;
  /** Omitted when the live feature is disabled. */
  onWatchLive?: () => void;
  onDismiss: () => void;
  /**
   * Scene load progress, moved into the panel's footer while the splash
   * is up — the content-area indicator behind it is hidden, since it
   * only shows through the panel as distracting ghost.
   */
  loading?: { isLoading: boolean; progress: number | null } | null;
}) {
  useEffect(() => {
    setWelcomeSplashOpen(true);
    return () => setWelcomeSplashOpen(false);
  }, []);
  return (
    <div className={styles.Positioner}>
      <div className={styles.PanelWrap}>
        <section className={styles.Panel} aria-label="Welcome">
          <h1 className={styles.Title}>
            <span className={styles.Brand}>MapGenius</span>
            <span className={styles.Subtitle}>Tribes 2 Online</span>
          </h1>
          <p className={styles.Blurb}>
            Experience Tribes 2 like never before –&nbsp;in your web browser.
          </p>
          {/* Chooser-button structure (sidebar ButtonGroup): a fixed-height
            icon slot, then label and hint rows with their own sizes — so
            per-icon size tweaks never shift the text rows. */}
          <div className={styles.HeroButtons}>
            <button
              type="button"
              className={styles.Hero}
              onClick={onWatchDemos}
            >
              <span className={styles.HeroIcon} data-icon="demo" aria-hidden>
                <PiCassetteTapeFill />
              </span>
              <span className={styles.HeroLabel}>Watch demos</span>
            </button>
            {onWatchLive && (
              <button
                type="button"
                className={styles.Hero}
                onClick={onWatchLive}
              >
                <span className={styles.HeroIcon} data-icon="live" aria-hidden>
                  <BsFillLightningChargeFill />
                </span>
                <span className={styles.HeroLabel}>Watch live</span>
              </button>
            )}
          </div>
          <button type="button" className={styles.Dismiss} onClick={onDismiss}>
            Let me explore the maps
          </button>
        </section>
        {/* Hangs below the panel rather than sitting inside it, so
            finishing the load never reflows the panel. */}
        {loading && (
          <div className={styles.Footer}>
            <LoadingIndicator
              id="loadingIndicator"
              inline
              isLoading={loading.isLoading}
              progress={loading.progress}
            />
          </div>
        )}
      </div>
    </div>
  );
}
