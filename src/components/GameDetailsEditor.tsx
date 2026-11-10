import { Dialog, DialogHeading } from "@ariakit/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaPenToSquare } from "react-icons/fa6";
import { useQueryClient } from "@tanstack/react-query";
import {
  MAX_GAME_TITLE_LENGTH,
  readGamePresentation,
} from "../../relay/gamePresentation";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { publishGamePresentation } from "../state/gamePresentationApi";
import { sameEditableGame, type EditableGame } from "../state/editableGame";
import { useAppAccount } from "../state/appAccountStore";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { inputControlsStore } from "./InputControls";
import {
  DataSaveActions,
  GameDataSelector,
  TeamNameFields,
  type NamedTeam,
} from "./GameDataFields";
import { useEditableGame, useGamePresentationEditor } from "./useEditableGame";
import styles from "./GameDataFields.module.css";
import editorStyles from "./GameDetailsEditor.module.css";

export function GameDetailsButton() {
  const game = useEditableGame();
  const teams = useStreamSnapshot((s) => s?.teamScores);
  const [editing, setEditing] = useState<EditableGame | null>(null);
  return (
    <>
      {game && (
        <button
          type="button"
          className={editorStyles.EditButton}
          title="Edit shared game details"
          aria-label="Edit shared game details"
          aria-haspopup="dialog"
          onClick={() => setEditing(game)}
        >
          <FaPenToSquare aria-hidden />
        </button>
      )}
      {editing && (
        <GameDetailsDialog
          game={editing}
          teams={teams ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

export function GameDetailsDialog({
  game,
  teams,
  standalone = false,
  onClose,
}: {
  game: EditableGame;
  teams: readonly NamedTeam[];
  /** Edit a published recording without requiring it to be loaded. */
  standalone?: boolean;
  onClose: () => void;
}) {
  const current = useEditableGame();
  const admin = useAppAccount(
    (state) => state.status === "ready" && state.user?.role === "admin",
  );
  const queryClient = useQueryClient();
  const [initial] = useState(game);
  const editor = useGamePresentationEditor(initial);
  const details = editor.details;
  const [title, setTitle] = useState(game.presentation.title ?? "");
  const [names, setNames] = useState({
    ...game.presentation.teamNames,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available =
    admin &&
    (standalone ? initial.demo != null : sameEditableGame(current, initial));
  const editableTeams = standalone
    ? [
        ...new Set([
          1,
          2,
          ...Object.keys(
            details?.presentation.teamNames ??
              initial.presentation.teamNames ??
              {},
          )
            .map(Number)
            .filter((id) => id > 0),
        ]),
      ].map((teamId) => ({
        teamId,
        name: DEFAULT_TEAM_NAMES[teamId] ?? `Team ${teamId}`,
      }))
    : teams;
  useEffect(() => {
    inputControlsStore.setState({ keys: new Set() });
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);
  useEffect(() => {
    if (!initial.demo || !details) return;
    setTitle(details.presentation.title ?? "");
    setNames({ ...details.presentation.teamNames });
    setError(null);
  }, [initial, details]);
  return createPortal(
    <div className={styles.Overlay}>
      <Dialog
        open
        autoFocusOnShow={false}
        onClose={onClose}
        portal={false}
        backdrop={false}
        className={styles.Dialog}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      >
        <DialogHeading className={styles.Title}>
          {initial.demo ? "Update demo data" : "Update stream data"}
        </DialogHeading>
        <form
          className={styles.Form}
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || !available || !details) return;
            const presentation = readGamePresentation({
              title,
              teamNames: names,
            });
            if (!presentation) {
              setError(
                "Use single-line names up to 64 characters and a title up to 128 characters.",
              );
              return;
            }
            setPending(true);
            setError(null);
            try {
              await publishGamePresentation(details, presentation);
              void queryClient.invalidateQueries({ queryKey: ["demoIndex"] });
              onClose();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not save game details. Please try again.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className={editorStyles.ScrollArea}>
            <GameDataSelector
              games={editor.games}
              selectedIndex={editor.selectedIndex}
              onSelect={editor.selectGame}
              disabled={pending || !available}
            />
            <fieldset
              className={editorStyles.Fields}
              disabled={pending || !available || !details}
            >
              <label className={styles.Field}>
                Game title
                <input
                  autoFocus
                  className={styles.Input}
                  value={title}
                  placeholder="Optional title"
                  maxLength={MAX_GAME_TITLE_LENGTH}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <TeamNameFields
                teams={editableTeams}
                names={names}
                autoFocus={false}
                showPlayerCounts={!standalone}
                onChange={(id, name) =>
                  setNames((old) => ({ ...old, [id]: name }))
                }
              />
            </fieldset>
          </div>
          {!available && (
            <p className={styles.Error} role="alert">
              Editing is unavailable for this game. Your unsaved changes are
              preserved.
            </p>
          )}
          {(error || editor.error) && (
            <p className={styles.Error} role="alert">
              {error || editor.error}
            </p>
          )}
          <div className={styles.Buttons}>
            <DataSaveActions
              onCancel={onClose}
              loading={editor.loading}
              saving={pending}
              disabled={pending || !available || !details}
            />
          </div>
        </form>
      </Dialog>
    </div>,
    document.body,
  );
}
