import { useEffect, useRef, useState } from "react";
import { FaClipboardCheck } from "react-icons/fa6";
import { RiShareForwardFill } from "react-icons/ri";
import {
  replayConnectionStore,
  useReplaySelector,
} from "../state/replayConnectionStore";
import { replayInviteUrl } from "./replayLinks";
import buttonStyles from "./Button.module.css";
import copyStyles from "./CopyDemoLinkButton.module.css";
import styles from "./CopyReplaySessionLinkButton.module.css";

export function CopyReplaySessionLinkButton() {
  const sessionId = useReplaySelector((state) => state.sessionId);
  const [copiedSession, setCopiedSession] = useState<string | null>(null);
  const [fallbackSession, setFallbackSession] = useState<string | null>(null);
  const copyRef = useRef({
    attempt: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const copied = sessionId !== null && copiedSession === sessionId;

  useEffect(() => {
    const copy = copyRef.current;
    return () => {
      copy.attempt++;
      if (copy.timer !== null) clearTimeout(copy.timer);
    };
  }, [sessionId]);

  async function copyLink() {
    // Read the current room at click time, including before the next render.
    const id = replayConnectionStore.getState().sessionId;
    if (!id) return;
    const copy = copyRef.current;
    const attempt = ++copy.attempt;
    if (copy.timer !== null) clearTimeout(copy.timer);
    setCopiedSession(null);
    setFallbackSession(null);
    const invite = replayInviteUrl(window.location.href, id);
    const current = () =>
      attempt === copy.attempt &&
      replayConnectionStore.getState().sessionId === id;
    try {
      await navigator.clipboard.writeText(invite);
      if (!current()) return;
      setCopiedSession(id);
      copy.timer = setTimeout(() => setCopiedSession(null), 1100);
    } catch {
      if (current()) setFallbackSession(id);
    }
  }

  return (
    <>
      <button
        type="button"
        className={copyStyles.Button}
        disabled={!sessionId}
        title={
          sessionId
            ? "Copy a link for others to watch this replay session"
            : "Wait for the replay session to be created"
        }
        onClick={copyLink}
        data-copied={copied ? "true" : "false"}
      >
        <RiShareForwardFill
          className={copyStyles.LinkIcon}
          aria-hidden="true"
        />
        <FaClipboardCheck
          className={copyStyles.ClipboardIcon}
          aria-hidden="true"
        />
        <span className={buttonStyles.ButtonLabel}>Copy replay link</span>
        <span className={styles.CopyStatus} role="status">
          {copied ? "Link copied" : ""}
        </span>
      </button>
      {sessionId && fallbackSession === sessionId && (
        <label className={styles.Fallback}>
          Copy this link to share the replay:
          <input
            aria-label="Replay session link"
            autoFocus
            readOnly
            value={replayInviteUrl(window.location.href, sessionId)}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </>
  );
}
