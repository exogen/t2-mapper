import { VisuallyHidden } from "@ariakit/react";
import { useId } from "react";
import { LuUsers } from "react-icons/lu";
import { shallow } from "zustand/shallow";
import type { DemoGame } from "../../relay/demoMetadata";
import { MAX_TEAM_NAME_LENGTH } from "../../relay/gamePresentation";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import type { TeamScore } from "../stream/types";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { formatPlayheadTime, missionDisplayName } from "./demoFormat";
import { LoadingIndicator } from "./LoadingIndicator";
import { Select } from "./Select";
import styles from "./GameDataFields.module.css";

export type NamedTeam = Pick<TeamScore, "teamId" | "name">;

function TeamPlayerCount({ teamId }: { teamId: number }) {
  const names = useStreamSnapshot(
    (snapshot) =>
      snapshot?.playerRoster
        .filter((p) => p.teamId === teamId)
        .map((p) => p.name) ?? [],
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

/** The same sparse draft model serves personal overrides and saved labels. */
export function TeamNameFields({
  teams,
  names,
  savedNames,
  focusTeamId,
  autoFocus = true,
  showPlayerCounts = true,
  disabled = false,
  onChange,
}: {
  teams: readonly NamedTeam[];
  names: Record<number, string>;
  savedNames?: Record<number, string>;
  focusTeamId?: number;
  autoFocus?: boolean;
  showPlayerCounts?: boolean;
  disabled?: boolean;
  onChange: (teamId: number, name: string) => void;
}) {
  const idPrefix = useId();
  return (
    <div className={styles.Teams}>
      {[...teams]
        .sort((a, b) => a.teamId - b.teamId)
        .map(({ teamId, name }, index) => {
          const defaultName =
            savedNames?.[teamId] ||
            name ||
            DEFAULT_TEAM_NAMES[teamId] ||
            `Team ${teamId}`;
          const inputId = `${idPrefix}-team-${teamId}`;
          const defaultNameId = `${inputId}-default`;
          return (
            <div key={teamId} className={styles.Team}>
              <div className={styles.TeamHeader}>
                <div className={styles.TeamLabel}>
                  <label className={styles.Label} htmlFor={inputId}>
                    Team {teamId}
                  </label>
                  {showPlayerCounts && <TeamPlayerCount teamId={teamId} />}
                </div>
                <div className={styles.DefaultControls}>
                  <span
                    id={defaultNameId}
                    className={styles.DefaultName}
                    title={defaultName}
                  >
                    {savedNames?.[teamId] ? "Saved" : "Server"}: {defaultName}
                  </span>
                  <button
                    type="button"
                    className={styles.Reset}
                    aria-label={`Reset team ${teamId} to ${savedNames?.[teamId] ? "saved" : "server"} name`}
                    disabled={disabled || !names[teamId]}
                    onClick={() => {
                      onChange(teamId, "");
                      (
                        document.getElementById(inputId) as HTMLInputElement
                      )?.focus();
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <input
                autoFocus={
                  autoFocus &&
                  (focusTeamId == null ? index === 0 : teamId === focusTeamId)
                }
                id={inputId}
                aria-describedby={defaultNameId}
                className={styles.Input}
                value={names[teamId] ?? ""}
                disabled={disabled}
                placeholder={defaultName}
                maxLength={MAX_TEAM_NAME_LENGTH}
                onChange={(event) => onChange(teamId, event.target.value)}
              />
            </div>
          );
        })}
    </div>
  );
}

/** A recording can contain several games; edits must name the intended one. */
export function GameDataSelector({
  games,
  selectedIndex,
  onSelect,
  disabled,
}: {
  games: readonly DemoGame[] | null;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  if (!games || games.length < 2) return null;
  return (
    <div className={styles.Field}>
      <label id={`${id}-label`} htmlFor={id}>
        Game
      </label>
      <Select
        id={id}
        aria-labelledby={`${id}-label`}
        className={styles.GameSelect}
        value={selectedIndex == null ? "" : String(selectedIndex)}
        disabled={disabled}
        onChange={(value) => onSelect(Number(value))}
        options={[
          { value: "", label: "Choose a game…", disabled: true },
          ...games.map((entry, index) => ({
            value: String(index),
            label: `${missionDisplayName(entry.mission)} · ${formatPlayheadTime(entry.startMs / 1000)}`,
          })),
        ]}
      />
    </div>
  );
}

/** Keep activity to the left of both buttons without changing their spacing. */
export function DataSaveActions({
  onCancel,
  loading = false,
  saving = false,
  disabled = false,
}: {
  onCancel: () => void;
  loading?: boolean;
  saving?: boolean;
  disabled?: boolean;
}) {
  const busy = loading || saving;
  return (
    <div className={styles.SaveActions}>
      <div className={styles.SaveSpinner} role="status">
        {busy && (
          <>
            <VisuallyHidden>
              {saving ? "Saving data" : "Loading demo data"}
            </VisuallyHidden>
            <div aria-hidden="true">
              <LoadingIndicator isLoading inline />
            </div>
          </>
        )}
      </div>
      <button type="button" className={styles.Cancel} onClick={onCancel}>
        Cancel
      </button>
      <button
        type="submit"
        className={styles.Save}
        disabled={disabled || busy}
        aria-busy={busy}
      >
        Save
      </button>
    </div>
  );
}
