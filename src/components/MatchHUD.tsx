import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { LuUsers } from "react-icons/lu";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { useMissionType } from "../state/gameEntityStore";
import { displayTeamName, useCaster } from "../state/casterStore";
import type { TeamScore } from "../stream/types";
import { FlagStatus } from "./FlagStatus";
import { useFollowCamera } from "./useFollowCamera";
import { EditableTeamName } from "./TeamNameDialog";
import { type MatchHudStyle, useSettings } from "./SettingsProvider";
import { formatHudClock, useMatchClockMs } from "./useMatchClock";
import { matchHudLayout as layout, matchHudStyle } from "./matchHudLayout";
import {
  IFF_ENEMY,
  IFF_FRIENDLY,
  IFF_NEUTRAL,
  IFF_PALETTE,
  resolveIffDisplay,
  rgbString,
  type TeamColorScheme,
} from "./iffTheme";
import styles from "./MatchHUD.module.css";

// Leave room around SVG strokes. Layout dimensions otherwise map 1:1 to pixels.
const FRAME_PADDING = 1.25;
const PANEL_TOP = 1.875;
const PANEL_BOTTOM = PANEL_TOP + layout.panelHeight;
const PANEL_CORNER = PANEL_BOTTOM - layout.bottomCornerHeight;
const PANEL_OUTER = layout.accentWidth + layout.accentGap;
const FRAME_HEIGHT = PANEL_BOTTOM + 3.75;
const CLOCK_TOP = PANEL_TOP + layout.clockTopOffset;
const CLOCK_BOTTOM = CLOCK_TOP + layout.clockHeight;

interface MatchHUDActions {
  onOpenScoreScreen: () => void;
  onFollowFlag?: (slot: number) => void;
}

function TeamFrame({
  side,
  color,
  frameWidth,
  panelInner,
}: {
  side: "left" | "right";
  color: string;
  frameWidth: number;
  panelInner: number;
}) {
  return (
    <g
      aria-hidden
      style={{ color }}
      transform={
        side === "right" ? `translate(${frameWidth} 0) scale(-1 1)` : undefined
      }
    >
      <path
        className={styles.Panel}
        d={`M${PANEL_OUTER} ${PANEL_TOP}H${panelInner}
          L${panelInner + layout.slant * (PANEL_CORNER - PANEL_TOP)} ${PANEL_CORNER}
          L${panelInner + layout.slant * (2 * PANEL_CORNER - PANEL_TOP - PANEL_BOTTOM)} ${PANEL_BOTTOM}
          H${PANEL_OUTER + layout.slant * layout.panelHeight}Z`}
      />
      <path
        className={styles.Rail}
        d={`M${PANEL_OUTER} ${PANEL_TOP + 0.625}H${panelInner}`}
      />
      <path
        className={styles.Accent}
        d={`M0 ${PANEL_TOP}H${layout.accentWidth}L${layout.accentWidth + layout.slant * (PANEL_CORNER - PANEL_TOP)} ${PANEL_CORNER}H${layout.slant * (PANEL_CORNER - PANEL_TOP)}Z`}
      />
    </g>
  );
}

function BroadcastClock() {
  const clockMs = useMatchClockMs();
  return (
    <div className={styles.Clock} aria-label="Match clock">
      {clockMs == null ? "—" : formatHudClock(clockMs)}
    </div>
  );
}

function teamColor(
  team: TeamScore,
  playerSensorGroup: number | undefined,
  scheme: TeamColorScheme,
) {
  const color =
    playerSensorGroup == null || team.teamId <= 0
      ? IFF_NEUTRAL
      : playerSensorGroup === 0
        ? resolveIffDisplay(team, true, scheme)
        : team.teamId === playerSensorGroup
          ? IFF_FRIENDLY
          : IFF_ENEMY;
  return rgbString(color.color);
}

/**
 * Mission types scored 100 per flag capture. TacoServer's LCTF and Spawn
 * CtF send CTFGame as their class, for the client's objective HUD, so they
 * arrive as CTF; LCTF and SCtF cover a server that sends the real class.
 */
const CAPTURE_SCORED_MISSION_TYPES = new Set([
  "CTF",
  "PracticeCTF",
  "LCTF",
  "SCtF",
]);

function displayedScore(score: number, competitionScores: boolean) {
  return competitionScores ? Math.floor(score / 100) : score;
}

function textWidth(element: HTMLElement, scale: number) {
  const range = document.createRange();
  range.selectNodeContents(element.querySelector("button") ?? element);
  return range.getBoundingClientRect().width / scale;
}

function BroadcastTeam({
  team,
  teams,
  side,
  color,
  frameWidth,
  panelInner,
  competitionScores,
  onOpenScoreScreen,
  onFollowFlag,
}: {
  team: TeamScore;
  teams: readonly TeamScore[];
  side: "left" | "right";
  color: string;
  frameWidth: number;
  panelInner: number;
  competitionScores: boolean;
} & MatchHUDActions) {
  const name = useCaster(() => displayTeamName(team.teamId, team.name));
  const nameWidthProgress = Math.min(
    1,
    Math.max(
      0,
      (Array.from(name).length - layout.nameWidthStartLength) /
        (layout.nameWidthEndLength - layout.nameWidthStartLength),
    ),
  );
  const nameWidth =
    layout.nameWidthStart +
    (layout.nameWidthEnd - layout.nameWidthStart) * nameWidthProgress;
  const score = displayedScore(team.score, competitionScores);
  const midSlant = (layout.slant * layout.panelHeight) / 2;
  const contentOuter = PANEL_OUTER + midSlant + layout.outerTextPadding;
  const contentInner = panelInner + midSlant - layout.scoreInnerPadding;
  const contentWidth = contentInner - contentOuter;
  const contentX = side === "left" ? contentOuter : frameWidth - contentInner;
  return (
    <g
      className={styles.BroadcastTeam}
      style={{ "--team-color": color } as CSSProperties}
      data-side={side}
    >
      <TeamFrame
        side={side}
        color={color}
        frameWidth={frameWidth}
        panelInner={panelInner}
      />
      <foreignObject
        x={contentX}
        y={PANEL_TOP + layout.contentTopPadding}
        width={contentWidth}
        height={
          layout.panelHeight -
          layout.contentTopPadding -
          layout.contentBottomPadding
        }
      >
        <div className={styles.TeamContent}>
          <div className={styles.TeamDetails}>
            <div
              className={styles.BroadcastName}
              style={{ fontStretch: `${nameWidth}%` }}
            >
              <EditableTeamName teamId={team.teamId} teams={teams} />
            </div>
            <div className={styles.FinePrint}>
              <button
                type="button"
                className={`${styles.Action} ${styles.PlayerCount}`}
                title={`${team.playerCount} ${team.playerCount === 1 ? "player" : "players"} — show score screen (F2)`}
                aria-haspopup="dialog"
                onClick={onOpenScoreScreen}
              >
                <LuUsers aria-hidden />
                {team.playerCount.toLocaleString()}
              </button>
              {team.flag != null && (
                <button
                  type="button"
                  className={`${styles.Action} ${styles.FlagStatus}`}
                  data-status={team.flag?.status}
                  title={onFollowFlag ? "Follow flag" : undefined}
                  disabled={!onFollowFlag}
                  onClick={() => onFollowFlag?.(team.teamId)}
                >
                  <FlagStatus flag={team.flag} icons="flag" coloredNames />
                </button>
              )}
            </div>
          </div>
          <div
            className={`${styles.BroadcastScore} ${competitionScores ? styles.CompetitionScore : styles.ClassicScore}`}
          >
            {score.toLocaleString()}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function useBroadcastSize(contentKey: string) {
  const containerRef = useRef<HTMLElement>(null);
  const [contentSize, setContentSize] = useState<{
    panelWidth: number;
    scoreWidth: number;
  }>({
    panelWidth: (layout.maxWidth - layout.clockWidth - FRAME_PADDING * 2) / 2,
    scoreWidth: 0,
  });
  useLayoutEffect(() => {
    const container = containerRef.current!;
    function measure() {
      if (
        !container.isConnected ||
        container.getBoundingClientRect().width === 0
      )
        return;
      const teamElements = [
        ...container.querySelectorAll<SVGGElement>("g[data-side]"),
      ];
      if (teamElements.length === 0) return;
      let detailsWidth = 0;
      let scoreWidth = 0;
      for (const team of teamElements) {
        const svg = team.ownerSVGElement!;
        const scale =
          svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const name = team.querySelector<HTMLElement>(
          `.${styles.BroadcastName}`,
        )!;
        const score = team.querySelector<HTMLElement>(
          `.${styles.BroadcastScore}`,
        )!;
        const count = team.querySelector<HTMLElement>(
          `.${styles.PlayerCount}`,
        )!;
        const flag = team.querySelector<HTMLElement>(`.${styles.FlagStatus}`);
        const finePrint = team.querySelector<HTMLElement>(
          `.${styles.FinePrint}`,
        )!;
        let finePrintWidth = count.getBoundingClientRect().width / scale;
        if (flag) {
          finePrintWidth +=
            parseFloat(getComputedStyle(finePrint).columnGap) +
            flag.querySelector("svg")!.getBoundingClientRect().width / scale +
            parseFloat(getComputedStyle(flag).columnGap) +
            layout.carrierMinWidthEm *
              parseFloat(getComputedStyle(finePrint).fontSize);
        }
        // Measure glyphs rather than the name's full-width, clipped button.
        detailsWidth = Math.max(
          detailsWidth,
          textWidth(name, scale),
          finePrintWidth,
        );
        scoreWidth = Math.max(scoreWidth, textWidth(score, scale));
      }
      scoreWidth = Math.ceil(scoreWidth);
      const panelWidth =
        detailsWidth +
        scoreWidth +
        layout.nameScoreGap +
        PANEL_OUTER +
        layout.outerTextPadding +
        layout.scoreInnerPadding +
        layout.panelClockGap;
      setContentSize((previous) =>
        previous.panelWidth === panelWidth && previous.scoreWidth === scoreWidth
          ? previous
          : { panelWidth, scoreWidth },
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of container.querySelectorAll(
      `.${styles.BroadcastName}, .${styles.BroadcastScore}, .${styles.PlayerCount}`,
    ))
      observer.observe(element);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [contentKey]);
  return { containerRef, ...contentSize };
}

function BroadcastMatchHUD({
  teams,
  playerSensorGroup,
  colorScheme,
  competitionScores,
  onOpenScoreScreen,
  onFollowFlag,
}: {
  teams: readonly TeamScore[];
  playerSensorGroup: number | undefined;
  colorScheme: TeamColorScheme;
  competitionScores: boolean;
} & MatchHUDActions) {
  const customNames = useCaster((state) => state.settings?.teamNames);
  // Carrier changes fit the reserved space; only these values affect sizing.
  const contentKey = JSON.stringify([
    competitionScores,
    teams.map((team) => [
      team.teamId,
      customNames?.[team.teamId] || team.name,
      displayedScore(team.score, competitionScores),
      team.playerCount,
      team.flag != null,
    ]),
  ]);
  const { containerRef, panelWidth, scoreWidth } = useBroadcastSize(contentKey);
  // The row's width must reflect its current teams, even before remeasuring.
  const viewWidth = Math.ceil(
    Math.min(2, teams.length) * panelWidth +
      layout.clockWidth +
      FRAME_PADDING * 2,
  );
  const maxWidth = Math.min(
    viewWidth,
    teams.length === 1 ? layout.singleTeamMaxWidth : layout.maxWidth,
  );
  const clockLeft =
    teams.length < 2
      ? viewWidth - FRAME_PADDING * 2 - layout.clockWidth
      : (viewWidth - FRAME_PADDING * 2 - layout.clockWidth) / 2;
  const clockRight = clockLeft + layout.clockWidth;
  const frameWidth = clockLeft + clockRight;
  const panelInner = clockLeft - layout.panelClockGap;
  const viewTop =
    teams.length === 0 ? CLOCK_TOP - FRAME_PADDING : -FRAME_PADDING;
  const viewHeight =
    (teams.length === 0 ? layout.clockHeight : FRAME_HEIGHT) +
    FRAME_PADDING * 2;
  const rowCount = Math.max(1, Math.ceil(teams.length / 2));
  return (
    <section
      ref={containerRef}
      className={styles.Broadcast}
      style={
        {
          ...matchHudStyle,
          maxWidth,
          "--hud-score-width": scoreWidth ? `${scoreWidth}px` : "auto",
        } as CSSProperties
      }
      aria-label="Match HUD"
    >
      {Array.from({ length: rowCount }, (_, row) => {
        const left = teams[row * 2];
        const right = teams[row * 2 + 1];
        return (
          <svg
            key={row}
            className={styles.BroadcastFrame}
            role="group"
            width={viewWidth}
            height={viewHeight}
            viewBox={`${-FRAME_PADDING} ${viewTop} ${viewWidth} ${viewHeight}`}
          >
            {left && (
              <BroadcastTeam
                team={left}
                teams={teams}
                side="left"
                competitionScores={competitionScores}
                color={teamColor(left, playerSensorGroup, colorScheme)}
                frameWidth={frameWidth}
                panelInner={panelInner}
                onOpenScoreScreen={onOpenScoreScreen}
                onFollowFlag={onFollowFlag}
              />
            )}
            {right && (
              <BroadcastTeam
                team={right}
                teams={teams}
                side="right"
                competitionScores={competitionScores}
                color={teamColor(right, playerSensorGroup, colorScheme)}
                frameWidth={frameWidth}
                panelInner={panelInner}
                onOpenScoreScreen={onOpenScoreScreen}
                onFollowFlag={onFollowFlag}
              />
            )}
            {row === 0 && (
              <>
                <path
                  className={styles.ClockPanel}
                  d={`M${clockLeft} ${CLOCK_TOP}H${clockRight}
                    L${clockRight - layout.slant * layout.clockHeight} ${CLOCK_BOTTOM}
                    H${clockLeft + layout.slant * layout.clockHeight}Z`}
                  aria-hidden
                />
                <foreignObject
                  x={clockLeft + layout.clockTextPadding}
                  y={CLOCK_TOP}
                  width={layout.clockWidth - layout.clockTextPadding * 2}
                  height={layout.clockHeight}
                >
                  <BroadcastClock />
                </foreignObject>
              </>
            )}
          </svg>
        );
      })}
    </section>
  );
}

export function MatchHUD({
  variant,
  onOpenScoreScreen,
}: {
  variant: MatchHudStyle;
  onOpenScoreScreen: () => void;
}) {
  const { enabled, followFlag } = useFollowCamera();
  const teamScores = useStreamSnapshot((snap) => snap?.teamScores);
  const playerSensorGroup = useStreamSnapshot(
    (snap) => snap?.playerSensorGroup,
  );
  const { observerTeamColors, scoreStyle } = useSettings();
  const missionType = useMissionType();
  const competitionScores =
    scoreStyle === "competition" &&
    missionType != null &&
    CAPTURE_SCORED_MISSION_TYPES.has(missionType);
  if (variant === "classic" && !teamScores?.length) return null;
  // Sort: friendly team first (if known), then by teamId.
  const sorted = [...(teamScores ?? [])].sort((a, b) => {
    if (playerSensorGroup) {
      if (a.teamId === playerSensorGroup) return -1;
      if (b.teamId === playerSensorGroup) return 1;
    }
    return a.teamId - b.teamId;
  });
  if (variant === "broadcast") {
    return (
      <BroadcastMatchHUD
        teams={sorted}
        playerSensorGroup={playerSensorGroup}
        colorScheme={observerTeamColors}
        competitionScores={competitionScores}
        onOpenScoreScreen={onOpenScoreScreen}
        onFollowFlag={enabled ? followFlag : undefined}
      />
    );
  }
  return (
    <ClassicMatchHUD
      teams={sorted}
      playerSensorGroup={playerSensorGroup}
      competitionScores={competitionScores}
      onOpenScoreScreen={onOpenScoreScreen}
      onFollowFlag={enabled ? followFlag : undefined}
    />
  );
}

function ClassicMatchHUD({
  teams,
  playerSensorGroup,
  competitionScores,
  onOpenScoreScreen,
  onFollowFlag,
}: {
  teams: readonly TeamScore[];
  playerSensorGroup: number | undefined;
  competitionScores: boolean;
} & MatchHUDActions) {
  const observerCount = useStreamSnapshot(
    (snap) =>
      snap?.playerRoster?.reduce(
        (count, player) => count + Number(player.teamId <= 0),
        0,
      ) ?? 0,
  );
  // Keep the column aligned when only some teams have known flag state.
  const hasFlags = teams.some((team) => team.flag != null);
  return (
    <table
      className={styles.TeamScores}
      aria-label="Match HUD"
      style={
        {
          "--team-name-friendly": rgbString(IFF_PALETTE.classicFriendlyName),
          "--team-name-default": rgbString(IFF_PALETTE.classicTeamName),
        } as CSSProperties
      }
    >
      {observerCount > 0 && (
        <caption className={styles.ObserverCount}>
          <button
            type="button"
            className={styles.Action}
            title="Show score screen (F2)"
            aria-haspopup="dialog"
            onClick={onOpenScoreScreen}
          >
            {observerCount} {observerCount === 1 ? "observer" : "observers"}
          </button>
        </caption>
      )}
      <tbody>
        {teams.map((team) => {
          const isFriendly =
            playerSensorGroup != null &&
            playerSensorGroup > 0 &&
            team.teamId === playerSensorGroup;
          return (
            <tr key={team.teamId} className={styles.TeamRow}>
              <td
                className={
                  isFriendly ? styles.TeamNameFriendly : styles.TeamNameEnemy
                }
              >
                <EditableTeamName teamId={team.teamId} teams={teams} />
              </td>
              <td className={styles.TeamCount}>
                <button
                  type="button"
                  className={styles.Action}
                  title="Show score screen (F2)"
                  aria-haspopup="dialog"
                  onClick={onOpenScoreScreen}
                >
                  ({team.playerCount.toLocaleString()})
                </button>
              </td>
              <td
                className={`${styles.TeamScore} ${competitionScores ? styles.CompetitionScore : styles.ClassicScore}`}
              >
                {displayedScore(team.score, competitionScores).toLocaleString()}
              </td>
              {hasFlags && (
                <td className={styles.TeamFlag} data-status={team.flag?.status}>
                  {team.flag && (
                    <button
                      type="button"
                      className={styles.Action}
                      title={onFollowFlag ? "Follow flag" : undefined}
                      disabled={!onFollowFlag}
                      onClick={() => onFollowFlag?.(team.teamId)}
                    >
                      <FlagStatus flag={team.flag} />
                    </button>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
