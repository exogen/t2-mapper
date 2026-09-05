import { useCallback, useRef, useState } from "react";
import { RiShareForwardFill } from "react-icons/ri";
import { FaClipboardCheck } from "react-icons/fa6";
import { captureDemoMoment, encodeDemoMoment } from "./demoMoment";
import { serializeDemoTime } from "./useQueryParams";
import buttonStyles from "./Button.module.css";
import styles from "./CopyDemoLinkButton.module.css";

/**
 * Copies a link to the second of the demo the viewer is on, through the
 * camera they are watching it with — the recorded view, a free-fly pose,
 * or a follow with its orbit. The demo itself is already in the URL
 * (`?demo=`), so the link is the page URL plus the moment.
 */
export function CopyDemoLinkButton() {
  const [showCopied, setShowCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyLink = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const moment = captureDemoMoment();
    if (!moment) return;
    const { t, hash } = encodeDemoMoment(moment);
    const base = `${window.location.pathname}${window.location.search}`;
    const fullPath = `${serializeDemoTime(base, { t })}${hash}`;
    const fullUrl = `${window.location.origin}${fullPath}`;
    window.history.replaceState(null, "", fullPath);
    try {
      await navigator.clipboard.writeText(fullUrl);
      setShowCopied(true);
      timerRef.current = setTimeout(() => setShowCopied(false), 1100);
    } catch (err) {
      console.error(err);
    }
  }, []);

  return (
    <button
      type="button"
      className={styles.Button}
      aria-label="Link to this moment"
      title="Copy a link to this second of the demo, camera included"
      onClick={handleCopyLink}
      data-copied={showCopied ? "true" : "false"}
      id="copyDemoLinkButton"
    >
      <RiShareForwardFill className={styles.LinkIcon} />
      <FaClipboardCheck className={styles.ClipboardIcon} />
      <span className={buttonStyles.ButtonLabel}> Link to moment</span>
    </button>
  );
}
