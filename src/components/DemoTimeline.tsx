import { useState, useCallback, useEffect } from "react";
import { PiFlagBanner, PiFlagBannerFill } from "react-icons/pi";
import { IoSkullSharp } from "react-icons/io5";
import { useDemoTimeline } from "../state/demoTimelineStore";
import type {
  TimelineEvent,
  TimelineEventType,
} from "../state/demoTimelineStore";
import { seekToTimelineEvent } from "../state/demoTimelineFollow";
import { useRecording } from "./usePlayback";
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
import { isRelayRecording } from "../stream/demoDate";
import {
  timelineDeathAction,
  timelineKillVerb,
} from "../stream/demoTimelineCombatText";
import {
  TIMELINE_CATEGORIES,
  defaultTimelineCategories,
  isMatchTimelineEvent,
  matchesTimelineCategory,
} from "./demoTimelineFilters";
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

export function DemoTimeline() {
  const events = useDemoTimeline((s) => s.events);
  const scanProgress = useDemoTimeline((s) => s.scanProgress);
  const error = useDemoTimeline((s) => s.error);
  const recording = useRecording();
  const { setSidebarOpen, observerTeamColors } = useSettings();
  // Match the overlay layout and navigation actions in MapInspector.
  const sidebarOverlayMode = useMediaQuery("(max-width: 899px)") ?? false;
  const [categories, setCategories] = useState(defaultTimelineCategories);
  const defaultMine = !isRelayRecording(recording?.recorderName ?? null);
  const [mine, setMine] = useState(defaultMine);

  useEffect(() => {
    setCategories(defaultTimelineCategories());
    setMine(defaultMine);
  }, [events, defaultMine]);

  const scopedEvents =
    events?.filter(
      (event) =>
        isMatchTimelineEvent(event) ||
        !mine ||
        event.isRecorder ||
        event.victimIsRecorder,
    ) ?? [];
  const filtered = scopedEvents.filter(
    (event) =>
      isMatchTimelineEvent(event) ||
      TIMELINE_CATEGORIES.some(
        (category) =>
          categories.has(category.value) &&
          matchesTimelineCategory(event, category, mine),
      ),
  );
  const allSelected = categories.size === TIMELINE_CATEGORIES.length;

  const handleClick = useCallback(
    (event: TimelineEvent) => {
      seekToTimelineEvent(recording, event);
      if (sidebarOverlayMode) setSidebarOpen(false);
      // Blur so focus returns to body — allows spacebar to toggle
      // play/pause instead of re-activating the timeline button.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    [recording, sidebarOverlayMode, setSidebarOpen],
  );

  if (error) {
    return (
      <div className={accordionStyles.Body}>
        <p className={controlStyles.ErrorMessage} role="alert">
          <ImSad2 />
          <span>{error}</span>
        </p>
      </div>
    );
  }

  // Scanning in progress.
  if (scanProgress != null && events == null) {
    return <ScanProgress progress={scanProgress} />;
  }

  if (!events) return null;

  return (
    <div className={styles.Root}>
      <label className={styles.Mine}>
        <input
          type="checkbox"
          checked={mine}
          onChange={(event) => setMine(event.target.checked)}
        />
        Only the recorder’s events
      </label>
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
          All ({scopedEvents.length})
        </button>
        {TIMELINE_CATEGORIES.map((category) => {
          const active = categories.has(category.value);
          const count = scopedEvents.filter((event) =>
            matchesTimelineCategory(event, category, mine),
          ).length;
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
      {filtered.length === 0 ? (
        <div className={styles.Empty}>No events found.</div>
      ) : (
        <div className={styles.EventList}>
          {filtered.map((event, i) => {
            const displayType =
              event.type === "kill" &&
              (!categories.has("kill") || (mine && !event.isRecorder))
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
