import { useCallback, useId, useMemo } from "react";
import { useStore } from "zustand";
import { Checkbox } from "./Checkbox";
import { Select } from "./Select";
import { PiFlagBanner, PiFlagBannerFill } from "react-icons/pi";
import { IoSkullSharp } from "react-icons/io5";
import { useDemoTimeline } from "../state/demoTimelineStore";
import type {
  TimelineEvent,
  TimelineEventType,
} from "../state/demoTimelineStore";
import { seekToTimelineEvent } from "../state/demoTimelineFollow";
import { setPreference, settingsStore } from "../state/settingsStore";
import { useRecording } from "./usePlayback";
import {
  countTimelineEventsThrough,
  useVisibleTimelineCount,
} from "./useVisibleTimelineCount";
import { BsPlayFill } from "react-icons/bs";
import { AiFillStop } from "react-icons/ai";
import { LuCrosshair, LuUserPen } from "react-icons/lu";
import { HiMiniBolt, HiMiniBoltSlash } from "react-icons/hi2";
import { ColoredName } from "./ColoredName";
import { formatPlayheadTime } from "./demoFormat";
import { ScanProgress } from "./ScanProgress";
import { useSettings } from "./SettingsProvider";
import { useMediaQuery } from "./useMediaQuery";
import { ImSad2 } from "react-icons/im";
import { timelineFlagColor } from "./demoTimelineColors";
import {
  timelineDeathAction,
  timelineKillVerb,
} from "../stream/demoTimelineCombatText";
import {
  TIMELINE_CATEGORIES,
  involvesTimelinePlayer,
  isMatchTimelineEvent,
  matchesTimelineCategory,
} from "./demoTimelineFilters";
import { timelinePlayerOptions } from "./demoTimelinePlayers";
import type { DemoTimelineFilters } from "./useDemoTimelineFilters";
import accordionStyles from "./Accordion.module.css";
import controlStyles from "./InspectorControls.module.css";
import styles from "./DemoTimeline.module.css";

const EVENT_ICON: Record<TimelineEventType, React.ReactNode> = {
  kill: <LuCrosshair />,
  death: <IoSkullSharp />,
  "flag-grab": <PiFlagBannerFill />,
  "flag-drop": <PiFlagBanner />,
  "flag-return": <PiFlagBannerFill />,
  "flag-cap": <PiFlagBannerFill />,
  "match-start": <BsPlayFill />,
  "match-countdown": <BsPlayFill />,
  "match-end": <AiFillStop />,
  rename: <LuUserPen />,
  "generator-offline": <HiMiniBoltSlash />,
  "generator-online": <HiMiniBolt />,
};

function renderEventDescription(event: TimelineEvent): React.ReactNode {
  // Names as sent, so the official clan tag shows in its yellow; a
  // name without markup renders as plain text.
  const named = (name: string | undefined, raw: string | undefined) =>
    raw ? <ColoredName raw={raw} tagsOnly /> : (name ?? "");
  const subject = (name: string | undefined, raw: string | undefined) =>
    event.isRecorder ? "You" : named(name, raw);
  if (event.type === "kill" && event.killer && event.victim) {
    return (
      <>
        <span className={styles.Killer}>
          {subject(event.killer, event.raw?.killer)}
        </span>{" "}
        <span className={styles.DamageType}>
          {timelineKillVerb(event.weapon)}
        </span>{" "}
        <span className={styles.Victim}>
          {event.victimIsRecorder
            ? "you"
            : named(event.victim, event.raw?.victim)}
        </span>
      </>
    );
  }
  if (event.type === "death") {
    return (
      <>
        <span className={styles.Victim}>
          {subject(event.victim || "A player", event.raw?.victim)}
        </span>{" "}
        {timelineDeathAction(event, event.isRecorder)}
      </>
    );
  }
  if (event.type === "flag-grab") {
    const flagLabel = event.flagTeamName
      ? `the ${event.flagTeamName} flag`
      : "the enemy flag";
    if (event.actor || event.isRecorder) {
      return (
        <>
          {subject(event.actor, event.raw?.actor)} grabbed {flagLabel}
        </>
      );
    }
    return <>{event.description}</>;
  }
  if (event.type === "flag-drop") {
    const flagLabel = event.flagTeamName
      ? `the ${event.flagTeamName} flag`
      : "the flag";
    if (event.actor || event.isRecorder) {
      return (
        <>
          {subject(event.actor, event.raw?.actor)} dropped {flagLabel}
        </>
      );
    }
    return <>{event.description}</>;
  }
  if (event.type === "flag-return") {
    const flagLabel = event.flagTeamName
      ? `the ${event.flagTeamName} flag`
      : "the flag";
    if (event.actor || event.isRecorder) {
      return (
        <>
          {subject(event.actor, event.raw?.actor)} returned {flagLabel}
        </>
      );
    }
    if (event.flagTeamName) {
      return <>The {event.flagTeamName} flag was returned</>;
    }
    return <>{event.description}</>;
  }
  if (event.type === "flag-cap" && (event.capturer || event.isRecorder)) {
    const flagLabel =
      event.teamAffinity === "friendly"
        ? "the enemy flag"
        : event.teamAffinity === "enemy"
          ? "your flag"
          : event.flagTeamName
            ? `the ${event.flagTeamName} flag`
            : "a flag";
    return (
      <>
        {subject(event.capturer, event.raw?.capturer)} captured {flagLabel}
      </>
    );
  }
  if (event.type === "rename" && event.actor) {
    return (
      <>
        <span className={styles.Victim}>
          {subject(event.previousName || "A player", event.raw?.previousName)}
        </span>{" "}
        <span className={styles.DamageType}>
          {event.isRecorder ? "are now" : "is now"}
        </span>{" "}
        <span className={styles.Killer}>
          {named(event.actor, event.raw?.actor)}
        </span>
      </>
    );
  }
  if (event.type === "generator-offline" || event.type === "generator-online") {
    if (!event.actor && !event.isRecorder) return event.description;
    const action = event.type === "generator-online" ? "repaired" : "destroyed";
    return (
      <>
        {subject(event.actor, event.raw?.actor)} {action} the{" "}
        {event.generatorLabel ?? "generator"}
      </>
    );
  }
  if (event.type === "match-start" || event.type === "match-end") {
    return event.description;
  }
  return event.description;
}

export function DemoTimeline({ filters }: { filters: DemoTimelineFilters }) {
  const events = useDemoTimeline((s) => s.events);
  const players = useDemoTimeline((s) => s.players);
  const recorderNames = useDemoTimeline((s) => s.recorderNames);
  const playerRawNames = useDemoTimeline((s) => s.playerRawNames);
  const scanProgress = useDemoTimeline((s) => s.scanProgress);
  const error = useDemoTimeline((s) => s.error);
  const recording = useRecording();
  const { observerTeamColors } = useSettings();
  const noSpoilers = useStore(settingsStore, (s) => s.timelineNoSpoilers);
  // Match the overlay layout and navigation actions in MapInspector.
  const sidebarOverlayMode = useMediaQuery("(max-width: 899px)") ?? false;
  const { categories, setCategories, player, setPlayer } = filters;
  const playerFilterId = useId();
  const noSpoilersId = `${playerFilterId}-no-spoilers`;
  const recorderName = recording?.recorderName ?? null;
  const playerOptions = useMemo(
    () =>
      timelinePlayerOptions(
        players,
        events ?? [],
        recorderName,
        recorderNames,
        playerRawNames,
      ),
    [players, events, recorderName, recorderNames, playerRawNames],
  );

  const scopedEvents = useMemo(
    () =>
      events?.filter((event) =>
        involvesTimelinePlayer(event, player, playerRawNames),
      ) ?? [],
    [events, player, playerRawNames],
  );
  const eventsByCategory = useMemo(
    () =>
      TIMELINE_CATEGORIES.map((category) =>
        scopedEvents.filter((event) =>
          matchesTimelineCategory(event, category, player, playerRawNames),
        ),
      ),
    [scopedEvents, player, playerRawNames],
  );
  const filtered = useMemo(
    () =>
      scopedEvents.filter(
        (event) =>
          isMatchTimelineEvent(event) ||
          TIMELINE_CATEGORIES.some(
            (category) =>
              categories.has(category.value) &&
              matchesTimelineCategory(event, category, player, playerRawNames),
          ),
      ),
    [scopedEvents, categories, player, playerRawNames],
  );
  const visibleCount = useVisibleTimelineCount(scopedEvents, noSpoilers);
  // The filtered list and category counts share the last visible timestamp.
  const visibleThrough = scopedEvents[visibleCount - 1]?.timeSec ?? -Infinity;
  const allEventsVisible = visibleCount === scopedEvents.length;
  const visibleEvents = allEventsVisible
    ? filtered
    : filtered.slice(0, countTimelineEventsThrough(filtered, visibleThrough));
  const allSelected = categories.size === TIMELINE_CATEGORIES.length;

  const handleClick = useCallback(
    (event: TimelineEvent) => {
      seekToTimelineEvent(recording, event);
      if (sidebarOverlayMode) settingsStore.setState({ sidebarOpen: false });
      // Blur so focus returns to body — allows spacebar to toggle
      // play/pause instead of re-activating the timeline button.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    [recording, sidebarOverlayMode],
  );

  const timelineControls = (
    <div className={`${accordionStyles.Body} ${styles.Controls}`}>
      <div
        className={`${controlStyles.CheckboxField} ${styles.NoSpoilersField}`}
      >
        <Checkbox
          id={noSpoilersId}
          aria-describedby={`${noSpoilersId}-description`}
          checked={noSpoilers}
          onChange={(event) =>
            setPreference("timelineNoSpoilers", event.currentTarget.checked)
          }
        />
        <label className={controlStyles.Label} htmlFor={noSpoilersId}>
          No spoilers
        </label>
        <p
          id={`${noSpoilersId}-description`}
          className={controlStyles.Description}
        >
          Don’t reveal timeline events (or markers in the seek bar) until the
          playhead reaches them.
        </p>
      </div>
      {events && (
        <div className={styles.PlayerFilter}>
          <label id={`${playerFilterId}-label`} htmlFor={playerFilterId}>
            Show events involving
          </label>
          <Select
            id={playerFilterId}
            aria-labelledby={`${playerFilterId}-label`}
            value={player}
            onChange={setPlayer}
            options={playerOptions}
          />
        </div>
      )}
    </div>
  );

  if (error || !events) {
    return (
      <div className={styles.Root}>
        {timelineControls}
        {error ? (
          <div className={accordionStyles.Body}>
            <p className={controlStyles.ErrorMessage} role="alert">
              <ImSad2 />
              <span>{error}</span>
            </p>
          </div>
        ) : scanProgress != null ? (
          <ScanProgress progress={scanProgress} />
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.Root}>
      {timelineControls}
      <div className={styles.Filters}>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={allSelected}
          aria-pressed={allSelected}
          onClick={() =>
            setCategories(
              new Set(
                allSelected
                  ? []
                  : TIMELINE_CATEGORIES.map(({ value }) => value),
              ),
            )
          }
        >
          All ({visibleCount})
        </button>
        {TIMELINE_CATEGORIES.map((category, index) => {
          const active = categories.has(category.value);
          const categoryEvents = eventsByCategory[index];
          const count = allEventsVisible
            ? categoryEvents.length
            : countTimelineEventsThrough(categoryEvents, visibleThrough);
          return (
            <button
              key={category.value}
              type="button"
              className={styles.FilterButton}
              data-active={active}
              aria-pressed={active}
              onClick={() =>
                setCategories((previous) => {
                  const next = new Set(previous);
                  if (next.has(category.value)) next.delete(category.value);
                  else next.add(category.value);
                  return next;
                })
              }
            >
              {category.label} ({count})
            </button>
          );
        })}
      </div>
      {visibleEvents.length === 0 ? (
        <div className={styles.Empty}>No events found.</div>
      ) : (
        <div className={styles.EventList}>
          {visibleEvents.map((event, i) => {
            const displayType =
              event.type === "kill" &&
              (!categories.has("kill") ||
                !matchesTimelineCategory(
                  event,
                  TIMELINE_CATEGORIES[0],
                  player,
                  playerRawNames,
                ))
                ? "death"
                : event.type;
            return (
              <button
                key={`${event.timeSec}-${event.type}-${i}`}
                type="button"
                className={styles.EventRow}
                title={event.originalMessage}
                onClick={() => handleClick(event)}
              >
                <span className={styles.EventTime}>
                  {formatPlayheadTime(event.timeSec)}
                </span>
                <span
                  className={styles.EventIcon}
                  data-type={displayType}
                  style={{
                    color: timelineFlagColor(event, observerTeamColors),
                  }}
                >
                  {EVENT_ICON[displayType]}
                </span>
                <span className={styles.EventDescription}>
                  {renderEventDescription(event)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
