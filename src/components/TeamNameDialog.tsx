import { Dialog, DialogHeading } from "@ariakit/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { casterStore, displayTeamName, useCaster } from "../state/casterStore";
import { useDataSource } from "../state/gameEntityStore";
import { useIsWatchSpectator } from "./useIsWatchSpectator";
import type { TeamScore } from "../stream/types";
import { sameEditableGame, type EditableGame } from "../state/editableGame";
import { publishTeamNames } from "../state/gamePresentationApi";
import { inputControlsStore } from "./InputControls";
import {
  DataSaveActions,
  GameDataSelector,
  TeamNameFields,
} from "./GameDataFields";
import { useEditableGame, useGamePresentationEditor } from "./useEditableGame";
import styles from "./GameDataFields.module.css";
import dialogStyles from "./TeamNameDialog.module.css";

export function EditableTeamName({
  teamId,
  teams,
}: {
  teamId: number;
  teams: readonly Pick<TeamScore, "teamId" | "name">[];
}) {
  const customNames = useCaster((s) => s.settings?.teamNames);
  const names = useCaster((s) => s.teamNames);
  const context = useCaster((s) => s.context);
  const dataSource = useDataSource();
  const watching = useIsWatchSpectator({ requireReady: true });
  const name =
    names[teamId] ||
    displayTeamName(teamId, teams.find((team) => team.teamId === teamId)?.name);
  if (
    !context ||
    !(dataSource === "demo" || (dataSource === "live" && watching))
  )
    return name;
  return (
    <TeamNameButton
      key={`${context.server}:${context.mission}:${teamId}`}
      teamId={teamId}
      name={name}
      teams={teams}
      customNames={customNames ?? {}}
      server={context.server}
      mission={context.mission}
    />
  );
}

function TeamNameButton({
  teamId,
  name,
  teams,
  customNames,
  server,
  mission,
}: {
  teamId: number;
  name: string;
  teams: readonly Pick<TeamScore, "teamId" | "name">[];
  customNames: Record<number, string>;
  server: string;
  mission: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={dialogStyles.TeamNameButton}
        title="Rename teams"
        aria-label={`Rename team ${teamId}: ${name}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {name}
      </button>
      {open && (
        <TeamNamesDialog
          focusTeamId={teamId}
          teams={teams}
          customNames={customNames}
          onClose={() => setOpen(false)}
          onSave={(names) => {
            const state = casterStore.getState();
            if (
              state.context?.server === server &&
              state.context.mission === mission
            ) {
              state.renameTeams(names);
            }
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

export function TeamNamesDialog({
  focusTeamId,
  teams,
  customNames,
  onClose,
  onSave,
}: {
  focusTeamId?: number;
  teams: readonly Pick<TeamScore, "teamId" | "name">[];
  customNames: Record<number, string>;
  onClose: () => void;
  onSave: (names: Record<number, string>) => void;
}) {
  const [initialNames] = useState(customNames);
  const [drafts, setDrafts] = useState(customNames);
  const [saveToDemo, setSaveToDemo] = useState(false);
  const [saveTarget, setSaveTarget] = useState<EditableGame | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const game = useEditableGame();
  const canShare = game !== null;
  const editor = useGamePresentationEditor(
    saveToDemo && canShare ? saveTarget : null,
  );
  const sameTarget = saveTarget && sameEditableGame(game, saveTarget);
  const savedNames = useCaster((s) => s.publishedGame?.presentation.teamNames);
  useEffect(() => {
    inputControlsStore.setState({ keys: new Set() });
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);
  useEffect(() => {
    if (!canShare) {
      setSaveToDemo(false);
      setSaveTarget(null);
    }
  }, [canShare]);

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
        <DialogHeading className={styles.Title}>Team names</DialogHeading>
        <form
          className={styles.Form}
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const changes: Record<number, string> = {};
            for (const { teamId } of teams) {
              const draft = drafts[teamId] ?? "";
              if (draft !== (initialNames[teamId] ?? ""))
                changes[teamId] = draft;
            }
            if (!saveToDemo) {
              onSave(changes);
              return;
            }
            if (!editor.details || !sameTarget) return;
            setPending(true);
            setError(null);
            try {
              await publishTeamNames(editor.details, drafts);
              void queryClient.invalidateQueries({ queryKey: ["demoIndex"] });
              onSave(changes);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not save team names. Please try again.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <TeamNameFields
            teams={teams}
            names={drafts}
            savedNames={savedNames}
            focusTeamId={focusTeamId}
            disabled={pending}
            onChange={(teamId, name) =>
              setDrafts((previous) => ({ ...previous, [teamId]: name }))
            }
          />
          {saveToDemo && (editor.games?.length ?? 0) > 1 && (
            <div className={dialogStyles.SharedOptions}>
              <GameDataSelector
                games={editor.games}
                selectedIndex={editor.selectedIndex}
                onSelect={editor.selectGame}
                disabled={pending || !sameTarget}
              />
            </div>
          )}
          {(error || (saveToDemo && editor.error)) && (
            <p className={styles.Error} role="alert">
              {error || editor.error}
            </p>
          )}
          <div className={styles.Buttons}>
            {game && (
              <label className={dialogStyles.SaveToDemo}>
                <input
                  type="checkbox"
                  checked={saveToDemo}
                  disabled={pending}
                  onChange={(event) => {
                    setSaveToDemo(event.target.checked);
                    setSaveTarget(event.target.checked ? game : null);
                    setError(null);
                  }}
                />
                Save to demo data
              </label>
            )}
            <DataSaveActions
              onCancel={onClose}
              loading={saveToDemo && editor.loading}
              saving={pending}
              disabled={
                pending || (saveToDemo && (!editor.details || !sameTarget))
              }
            />
          </div>
        </form>
      </Dialog>
    </div>,
    document.body,
  );
}
