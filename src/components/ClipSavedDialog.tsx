import { Dialog, DialogHeading, VisuallyHidden } from "@ariakit/react";
import { LuCheck, LuLink, LuLoaderCircle, LuX } from "react-icons/lu";
import { GrPlayFill } from "react-icons/gr";
import type { ClipView } from "../../relay/clipTypes";
import { clipShareUrl } from "../stream/clipApi";
import buttonStyles from "./Button.module.css";
import styles from "./ClipControls.module.css";

export function ClipSavedDialog({
  clip,
  saving,
  error,
  statusError,
  copied,
  onCopy,
  onClose,
  onRetry,
  retryDisabled = false,
}: {
  clip: ClipView | null;
  saving: boolean;
  error: string | null;
  statusError: unknown;
  copied: boolean;
  onCopy(): void;
  onClose(): void;
  onRetry?: () => void;
  retryDisabled?: boolean;
}) {
  const preparing = saving || (!statusError && clip?.state === "processing");
  const ready = clip?.state === "ready" && !statusError;
  const message = saving
    ? "Saving clip…"
    : statusError instanceof Error
      ? statusError.message
      : ready
        ? "Your clip is ready to share."
        : clip?.state === "processing"
          ? "Preparing the clip’s starting checkpoint…"
          : (clip?.error ?? "The clip could not be prepared.");

  return (
    <Dialog
      open
      hideOnInteractOutside={false}
      hideOnEscape={!saving}
      className={styles.SavedPanel}
      onClose={onClose}
      aria-label="Saved clip"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <DialogHeading className={styles.Title} title={clip?.title}>
        {clip ? (
          clip.title
        ) : error ? (
          "Save clip"
        ) : (
          <>
            <VisuallyHidden>Saving clip</VisuallyHidden>
            <span className={styles.TitleSkeleton} aria-hidden>
              <span className={styles.SkeletonLine} />
              <span className={styles.SkeletonLine} />
            </span>
          </>
        )}
      </DialogHeading>
      <p role="status" className={styles.PreparationStatus}>
        <span className={styles.StatusIcon} aria-hidden>
          {preparing ? (
            <LuLoaderCircle className={styles.Spinner} />
          ) : ready ? (
            <LuCheck />
          ) : null}
        </span>
        <span>
          {error && !clip
            ? "Your recording is still available. Try saving again."
            : message}
        </span>
      </p>
      <div className={styles.ShareRow}>
        <div className={styles.ShareField}>
          <input
            className={styles.ShareLink}
            aria-label="Clip share link"
            readOnly
            disabled={!clip}
            value={clip ? clipShareUrl(clip) : ""}
            onFocus={(event) => event.currentTarget.select()}
          />
          {!clip && <span className={styles.LinkSkeleton} aria-hidden />}
        </div>
        <button
          className={styles.CopyButton}
          type="button"
          disabled={!clip}
          onClick={onCopy}
          aria-label={copied ? "Link copied" : "Copy clip link"}
          title={copied ? "Link copied" : "Copy clip link"}
        >
          {copied ? <LuCheck aria-hidden /> : <LuLink aria-hidden />}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.Error}>
          {error}
        </p>
      )}
      <div className={styles.SavedActions}>
        {onRetry && !saving && (
          <button
            className={styles.UtilityButton}
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
          >
            Retry
          </button>
        )}
        <button
          className={styles.PlayButton}
          type="button"
          disabled={!ready}
          onClick={() => clip && window.location.assign(clipShareUrl(clip))}
        >
          <GrPlayFill aria-hidden />
          <span className={buttonStyles.ButtonLabel}>Play clip</span>
        </button>
      </div>
      <button
        type="button"
        className={styles.CloseButton}
        aria-label="Close saved clip"
        title="Close"
        disabled={saving}
        onClick={onClose}
      >
        <LuX aria-hidden />
      </button>
    </Dialog>
  );
}
