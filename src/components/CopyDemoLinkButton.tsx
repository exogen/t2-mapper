import { useCallback, useEffect, useRef, useState } from "react";
import { RiShareForwardFill } from "react-icons/ri";
import { FaClipboardCheck } from "react-icons/fa6";
import { captureDemoMoment, encodeDemoMoment } from "./demoMoment";
import { serializeDemoTime, useNavigationQueryState } from "./useQueryParams";
import { useIsSeeking } from "./usePlayback";
import { engineStore } from "../state/engineStore";
import { clipShareUrl } from "../stream/clipApi";
import buttonStyles from "./Button.module.css";
import styles from "./CopyDemoLinkButton.module.css";

/**
 * Copies the demo moment's time and camera, or the current clip's URL.
 */
export function CopyDemoLinkButton() {
  const [route] = useNavigationQueryState();
  const sharingClip = !!route.clip;
  const isSeeking = useIsSeeking();
  const [showCopied, setShowCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopyLink = useCallback(async () => {
    let fullUrl: string;
    if (route.clip) {
      if (!route.demo) return;
      fullUrl = clipShareUrl({ id: route.clip, sourceDemo: route.demo });
    } else {
      if (engineStore.getState().playback.status === "seeking") return;
      const moment = captureDemoMoment();
      if (!moment) return;
      const { t, hash } = encodeDemoMoment(moment);
      const base = `${window.location.pathname}${window.location.search}`;
      const fullPath = `${serializeDemoTime(base, { t })}${hash}`;
      fullUrl = `${window.location.origin}${fullPath}`;
      window.history.replaceState(window.history.state, "", fullPath);
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      if (timerRef.current) clearTimeout(timerRef.current);
      setShowCopied(true);
      timerRef.current = setTimeout(() => setShowCopied(false), 1100);
    } catch (err) {
      console.error(err);
    }
  }, [route.clip, route.demo]);

  return (
    <button
      type="button"
      className={styles.Button}
      aria-label={sharingClip ? "Share clip" : "Link to this moment"}
      title={
        sharingClip
          ? "Copy a link to this clip"
          : "Copy a link to this moment in the demo, camera included"
      }
      disabled={sharingClip ? !route.demo : isSeeking}
      onClick={handleCopyLink}
      data-copied={showCopied ? "true" : "false"}
      id="copyDemoLinkButton"
    >
      <RiShareForwardFill className={styles.LinkIcon} />
      <FaClipboardCheck className={styles.ClipboardIcon} />
      <span className={buttonStyles.ButtonLabel}>
        {sharingClip ? " Share clip" : " Link to moment"}
      </span>
    </button>
  );
}
