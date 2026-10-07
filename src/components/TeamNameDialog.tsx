import { Dialog, DialogHeading } from "@ariakit/react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { LuUsers } from "react-icons/lu";
import { shallow } from "zustand/shallow";
import { casterStore, displayTeamName, useCaster } from "../state/casterStore";
import { useDataSource } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import type { TeamScore } from "../stream/types";
import { inputControlsStore } from "./InputControls";
import styles from "./TeamNameDialog.module.css";

export function EditableTeamName({
  teamId,
  teams,
}: {
  teamId: number;
  teams: readonly Pick<TeamScore, "teamId" | "name">[];
}) {
  const customNames = useCaster((s) => s.settings?.teamNames);
  const context = useCaster((s) => s.context);
  const dataSource = useDataSource();
  const watching = useLiveSelector((s) => s.role === "watcher" && s.liveReady);
  const name =
    customNames?.[teamId] ||
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
        className={styles.TeamNameButton}
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

function TeamPlayerCount({ teamId }: { teamId: number }) {
  const names = useStreamSnapshot(
    (snapshot) =>
      snapshot?.playerRoster
        .filter((player) => player.teamId === teamId)
        .map((player) => player.name) ?? [],
    shallow,
  );
  return (
    <span
      className={styles.PlayerCount}
      title={names.join(", ")}
      aria-label={`${names.length} ${names.length === 1 ? "player" : "players"}`}
    >
      <LuUsers className={styles.PlayersIcon} aria-hidden />
      {names.length}
    </span>
  );
}

function TeamNamesDialog({
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
  const idPrefix = useId();
  useEffect(() => {
    inputControlsStore.setState({ keys: new Set() });
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

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
          onSubmit={(event) => {
            event.preventDefault();
            const changes: Record<number, string> = {};
            for (const { teamId } of teams) {
              const draft = drafts[teamId] ?? "";
              if (draft !== (initialNames[teamId] ?? ""))
                changes[teamId] = draft;
            }
            onSave(changes);
          }}
        >
          <div className={styles.Teams}>
            {[...teams]
              .sort((a, b) => a.teamId - b.teamId)
              .map(({ teamId, name }, index) => {
                const serverName =
                  name || DEFAULT_TEAM_NAMES[teamId] || `Team ${teamId}`;
                const inputId = `${idPrefix}-team-${teamId}`;
                const defaultNameId = `${inputId}-default`;
                return (
                  <div key={teamId} className={styles.Team}>
                    <div className={styles.TeamHeader}>
                      <div className={styles.TeamLabel}>
                        <label className={styles.Label} htmlFor={inputId}>
                          Team {teamId}
                        </label>
                        <TeamPlayerCount teamId={teamId} />
                      </div>
                      <div className={styles.DefaultControls}>
                        <span id={defaultNameId} className={styles.DefaultName}>
                          Default: {serverName}
                        </span>
                        <button
                          type="button"
                          className={styles.Reset}
                          aria-label={`Reset team ${teamId} to server name`}
                          disabled={!drafts[teamId]}
                          onClick={() => {
                            setDrafts((previous) => ({
                              ...previous,
                              [teamId]: "",
                            }));
                            (
                              document.getElementById(
                                inputId,
                              ) as HTMLInputElement
                            )?.focus();
                          }}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <input
                      autoFocus={
                        focusTeamId == null
                          ? index === 0
                          : teamId === focusTeamId
                      }
                      id={inputId}
                      aria-describedby={defaultNameId}
                      className={styles.Input}
                      value={drafts[teamId] ?? ""}
                      placeholder={serverName}
                      maxLength={64}
                      onChange={(event) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [teamId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
          </div>
          <div className={styles.Buttons}>
            <span className={styles.Hint}>Resets at end of the mission.</span>
            <button type="button" className={styles.Cancel} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.Save}>
              Save
            </button>
          </div>
        </form>
      </Dialog>
    </div>,
    document.body,
  );
}
