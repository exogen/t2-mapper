import { DialogHeading, VisuallyHidden } from "@ariakit/react";
import { LuCheck, LuLink, LuLoaderCircle, LuX } from "react-icons/lu";
import { GrPlayFill } from "react-icons/gr";
import type { ClipView } from "../../relay/clipTypes";
import { clipShareUrl } from "../stream/clipApi";
import { ClipDialog } from "./ClipDialog";
import { ClipTitleEditButton, ClipTitleField } from "./ClipTitleEditor";
import fieldStyles from "./GameDataFields.module.css";
import styles from "./ClipControls.module.css";

export function ClipSavedDialog({
  clip,
  draft,
  canEdit = false,
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
  draft?: {
    title: string;
    onChange(title: string): void;
    onSave(): void;
    disabled: boolean;
  };
  canEdit?: boolean;
  saving: boolean;
  error: string | null;
  statusError: unknown;
  copied: boolean;
  onCopy(): void;
  onClose(): void;
  onRetry?: () => void;
  retryDisabled?: boolean;
}) {
  if (draft && !saving && !clip) {
    return (
      <ClipDialog onClose={onClose}>
        <DialogHeading className={fieldStyles.Title}>Save clip</DialogHeading>
        <form
          className={fieldStyles.Form}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.disabled) draft.onSave();
          }}
        >
          <ClipTitleField
            title={draft.title}
            onChange={draft.onChange}
            optional
            error={error}
          />
          <div className={fieldStyles.Buttons}>
            <button
              type="button"
              className={fieldStyles.Cancel}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={fieldStyles.Save}
              disabled={draft.disabled}
            >
              Save clip
            </button>
          </div>
        </form>
      </ClipDialog>
    );
  }

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
    <ClipDialog onClose={onClose} saving={saving} label="Saved clip">
      <DialogHeading className={styles.SavedTitle} title={clip?.title}>
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
        <p role="alert" className={fieldStyles.Error}>
          {error}
        </p>
      )}
      <div className={fieldStyles.Buttons}>
        {canEdit && clip && <ClipTitleEditButton clip={clip} />}
        {onRetry && !saving && (
          <button
            className={fieldStyles.Cancel}
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
          <span>Play clip</span>
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
    </ClipDialog>
  );
}
