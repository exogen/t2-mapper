import { useState, useCallback, useEffect } from "react";
import { PiFlagBanner, PiFlagBannerFill } from "react-icons/pi";
import { IoSkullSharp } from "react-icons/io5";
import { useDemoTimeline } from "../state/demoTimelineStore";
import type {
  TimelineEvent,
  TimelineEventType,
} from "../state/demoTimelineStore";
import { useRecorderName } from "../state/gameEntityStore";
import { usePlaybackActions } from "./usePlayback";
import { BsPlayFill } from "react-icons/bs";
import { AiFillStop } from "react-icons/ai";
import { LuCrosshair } from "react-icons/lu";
import styles from "./DemoTimeline.module.css";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const EVENT_ICON: Record<TimelineEventType, React.ReactNode> = {
  kill: <LuCrosshair />,
  death: <IoSkullSharp />,
  "flag-grab": <PiFlagBannerFill />,
  "flag-drop": <PiFlagBanner />,
  "flag-return": <PiFlagBannerFill />,
  "flag-cap": <PiFlagBannerFill />,
  "match-start": <BsPlayFill />,
  "match-end": <AiFillStop />,
};

const WEAPONS_PAST_TENSE: Record<string, string> = {
  chaingun: "chaingunned",
  plasma: "plasma rifled",
};

function renderEventDescription(
  event: TimelineEvent,
  recorderName: string | null,
): React.ReactNode {
  // First-person recordings phrase the recorder's own events as "You";
  // observer recordings (relay auto-capture) name the actual players.
  const isRecorder = (name: string | undefined) =>
    !!name &&
    !!recorderName &&
    name.toLowerCase() === recorderName.toLowerCase();
  if (event.type === "kill" && event.killer && event.victim) {
    return (
      <>
        <span className={styles.Killer} title={event.killer}>
          {isRecorder(event.killer) ? "You" : event.killer}
        </span>{" "}
        <span className={styles.DamageType}>
          {event.weapon
            ? (WEAPONS_PAST_TENSE[event.weapon] ??
              `${event.weapon}${event.weapon.endsWith("e") ? "d" : "ed"}`)
            : "killed"}
        </span>{" "}
        <span className={styles.Victim}>{event.victim}</span>
      </>
    );
  }
  if (event.type === "death") {
    if (event.killer) {
      return (
        <>
          <span className={styles.Killer}>{event.killer}</span>{" "}
          <span className={styles.DamageType}>
            {event.weapon
              ? (WEAPONS_PAST_TENSE[event.weapon] ??
                `${event.weapon}${event.weapon.endsWith("e") ? "d" : "ed"}`)
              : "killed"}
          </span>{" "}
          <span className={styles.Victim} title={event.victim}>
            {isRecorder(event.victim) ? "you" : event.victim}
          </span>
        </>
      );
    }
    return <>{event.description}</>;
  }
  if (event.type === "flag-grab") {
    const flagLabel = event.flagTeamName
      ? `the ${event.flagTeamName} flag`
      : "the enemy flag";
    if (event.teamAffinity === "friendly") {
      return <>You grabbed {flagLabel}</>;
    }
    if (event.actor) {
      return (
        <>
          {isRecorder(event.actor) ? "You" : event.actor} grabbed {flagLabel}
        </>
      );
    }
    return <>{event.description}</>;
  }
  if (event.type === "flag-drop") {
    const flagLabel = event.flagTeamName
      ? `the ${event.flagTeamName} flag`
      : "the flag";
    if (event.teamAffinity === "friendly") {
      return <>You dropped {flagLabel}</>;
    }
    if (event.actor) {
      return (
        <>
          {isRecorder(event.actor) ? "You" : event.actor} dropped {flagLabel}
        </>
      );
    }
    return <>{event.description}</>;
  }
  if (event.type === "flag-return") {
    if (event.teamAffinity === "friendly") {
      return <>You returned your flag</>;
    }
    const flagLabel = event.flagTeamName
      ? `the ${event.flagTeamName} flag`
      : "the flag";
    if (event.actor) {
      return (
        <>
          {isRecorder(event.actor) ? "You" : event.actor} returned {flagLabel}
        </>
      );
    }
    if (event.flagTeamName) {
      return <>The {event.flagTeamName} flag was returned</>;
    }
    return <>{event.description}</>;
  }
  if (event.type === "flag-cap" && event.capturer) {
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
        {event.capturer} captured {flagLabel}
      </>
    );
  }
  if (event.type === "match-start" || event.type === "match-end") {
    return event.description;
  }
  return event.description;
}

type Filter =
  "all" | "kill" | "death" | "flag-grab" | "flag-return" | "flag-cap";

export function DemoTimeline() {
  const events = useDemoTimeline((s) => s.events);
  const scanProgress = useDemoTimeline((s) => s.scanProgress);
  const observerPerspective = useDemoTimeline((s) => s.observerPerspective);
  const recorderName = useRecorderName();
  const { seek } = usePlaybackActions();
  const [filter, setFilter] = useState<Filter>("all");

  // Filters never persist across demos — each load starts on "All".
  useEffect(() => {
    setFilter("all");
  }, [events]);

  // Observer recordings never emit kills/deaths — their chips are
  // hidden, and a selection guards against the pre-reset render.
  const effectiveFilter =
    observerPerspective && (filter === "kill" || filter === "death")
      ? "all"
      : filter;

  const filtered =
    events?.filter(
      (e) => effectiveFilter === "all" || e.type === effectiveFilter,
    ) ?? [];

  const handleClick = useCallback(
    (timeSec: number) => {
      seek(Math.max(0, timeSec - 3));
      // Blur so focus returns to body — allows spacebar to toggle
      // play/pause instead of re-activating the timeline button.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    [seek],
  );

  // Scanning in progress.
  if (scanProgress != null && events == null) {
    return (
      <div className={styles.Root}>
        <div className={styles.ProgressWrap}>
          <span className={styles.ProgressLabel}>
            Scanning… {Math.round(scanProgress * 100)}%
          </span>
          <div className={styles.ProgressBar}>
            <div
              className={styles.ProgressFill}
              style={{ width: `${scanProgress * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!events) return null;

  const killCount = events.filter((e) => e.type === "kill").length;
  const deathCount = events.filter((e) => e.type === "death").length;
  const grabCount = events.filter((e) => e.type === "flag-grab").length;
  const returnCount = events.filter((e) => e.type === "flag-return").length;
  const capCount = events.filter((e) => e.type === "flag-cap").length;

  return (
    <div className={styles.Root}>
      <div className={styles.Filters}>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={effectiveFilter === "all"}
          onClick={() => setFilter("all")}
        >
          All ({events.length})
        </button>
        {!observerPerspective && (
          <>
            <button
              type="button"
              className={styles.FilterButton}
              data-active={effectiveFilter === "kill"}
              onClick={() => setFilter("kill")}
            >
              Kills ({killCount})
            </button>
            <button
              type="button"
              className={styles.FilterButton}
              data-active={effectiveFilter === "death"}
              onClick={() => setFilter("death")}
            >
              Deaths ({deathCount})
            </button>
          </>
        )}
        <button
          type="button"
          className={styles.FilterButton}
          data-active={effectiveFilter === "flag-grab"}
          onClick={() => setFilter("flag-grab")}
        >
          Grabs ({grabCount})
        </button>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={effectiveFilter === "flag-return"}
          onClick={() => setFilter("flag-return")}
        >
          Returns ({returnCount})
        </button>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={effectiveFilter === "flag-cap"}
          onClick={() => setFilter("flag-cap")}
        >
          Caps ({capCount})
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className={styles.Empty}>No events found.</div>
      ) : (
        <div className={styles.EventList}>
          {filtered.map((event, i) => (
            <button
              key={`${event.timeSec}-${event.type}-${i}`}
              type="button"
              className={styles.EventRow}
              onClick={() => handleClick(event.timeSec)}
            >
              <span className={styles.EventTime}>
                {formatTime(event.timeSec)}
              </span>
              <span
                className={styles.EventIcon}
                data-type={event.type}
                data-affinity={event.teamAffinity}
              >
                {EVENT_ICON[event.type]}
              </span>
              <span className={styles.EventDescription}>
                {renderEventDescription(event, recorderName)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
