import { DialogHeading } from "@ariakit/react";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { MdBlock } from "react-icons/md";
import { RxInput } from "react-icons/rx";
import {
  MAX_CLIP_TITLE_LENGTH,
  type ClipPage,
  type ClipView,
} from "../../relay/clipTypes";
import { renameClip } from "../stream/clipApi";
import { ClipDialog } from "./ClipDialog";
import styles from "./ClipControls.module.css";
import fieldStyles from "./GameDataFields.module.css";
import editorStyles from "./GameDetailsEditor.module.css";

export function ClipTitleField({
  title,
  onChange,
  label = "Clip title",
  optional = false,
  disabled = false,
  error,
}: {
  title: string;
  onChange(title: string): void;
  label?: string;
  optional?: boolean;
  disabled?: boolean;
  error?: string | null;
}) {
  const errorId = useId();
  return (
    <>
      <label className={styles.TitleField}>
        {label}
        <input
          type="text"
          className={fieldStyles.Input}
          value={title}
          maxLength={MAX_CLIP_TITLE_LENGTH}
          placeholder={optional ? "Use automatic title" : undefined}
          required={!optional}
          disabled={disabled}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
      {error && (
        <p id={errorId} className={styles.TitleError} role="alert">
          <MdBlock aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </>
  );
}

function ClipTitleDialog({
  clip,
  onClose,
}: {
  clip: ClipView;
  onClose(): void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(clip.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTitle() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const renamed = await renameClip(
        clip.id,
        title,
        AbortSignal.timeout(20_000),
      );
      const clipKeys = [
        ["clip", clip.id],
        ["savedClip", clip.id],
      ];
      const listKeys = [["userClips", clip.ownerDiscordId], ["publicClips"]];
      const queryKeys = [...clipKeys, ...listKeys];
      await Promise.all(
        queryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })),
      );
      const update = (entry: ClipView) =>
        entry.id === renamed.id ? { ...entry, title: renamed.title } : entry;
      for (const queryKey of clipKeys)
        queryClient.setQueryData<ClipView>(
          queryKey,
          (entry) => entry && update(entry),
        );
      for (const queryKey of listKeys)
        queryClient.setQueriesData<ClipPage>(
          { queryKey },
          (page) => page && { ...page, clips: page.clips.map(update) },
        );
      for (const queryKey of queryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not edit the clip title.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClipDialog onClose={onClose} saving={saving}>
      <DialogHeading className={fieldStyles.Title}>Edit clip</DialogHeading>
      <form
        className={fieldStyles.Form}
        onSubmit={(event) => {
          event.preventDefault();
          void saveTitle();
        }}
      >
        <ClipTitleField
          title={title}
          onChange={setTitle}
          label="Title"
          disabled={saving}
          error={error}
        />
        <div className={fieldStyles.Buttons}>
          <button
            type="button"
            className={fieldStyles.Cancel}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={fieldStyles.Save}
            disabled={saving || !title.trim() || title.trim() === clip.title}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ClipDialog>
  );
}

export function ClipTitleEditButton({
  clip,
  className = editorStyles.EditButton,
  iconClassName,
  disabled = false,
}: {
  clip: ClipView;
  className?: string;
  iconClassName?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="Edit clip title"
        title="Edit clip title"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setEditing(true)}
      >
        <RxInput className={iconClassName} aria-hidden />
      </button>
      {editing && (
        <ClipTitleDialog
          key={clip.id}
          clip={clip}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
