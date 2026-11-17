import { useCallback, useEffect, useRef, useState } from "react";
import { RiShareForwardFill } from "react-icons/ri";
import { FaClipboardCheck } from "react-icons/fa6";
import { captureDemoMoment, encodeDemoMoment } from "./demoMoment";
import { serializeDemoTime, useNavigationQueryState } from "./useQueryParams";
import { clipShareUrl } from "../stream/clipApi";
import buttonStyles from "./Button.module.css";
import styles from "./CopyDemoLinkButton.module.css";

/**
 * Copies a link to the second of the demo the viewer is on, through the
 * camera they are watching it with — the recorded view, a free-fly pose,
 * or a follow with its orbit. The demo itself is already in the URL
 * (`?demo=`), so the link is the page URL plus the moment.
 */
export function CopyDemoLinkButton() {
  const [route] = useNavigationQueryState();
  const sharingClip = !!route.clip;
  const [showCopied, setShowCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopyLink = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    let fullUrl: string;
    if (route.clip && route.demo)
      fullUrl = clipShareUrl({ id: route.clip, sourceDemo: route.demo });
    else {
      const moment = captureDemoMoment();
      if (!moment) return;
      const { t, hash } = encodeDemoMoment(moment);
      const base = `${window.location.pathname}${window.location.search}`;
      const fullPath = `${serializeDemoTime(base, { t })}${hash}`;
      fullUrl = `${window.location.origin}${fullPath}`;
      window.history.replaceState(null, "", fullPath);
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
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
          : "Copy a link to this second of the demo, camera included"
      }
      disabled={sharingClip && !route.demo}
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
