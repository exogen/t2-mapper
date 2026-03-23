import { useState, useCallback } from "react";
import { PiFlagBannerFill } from "react-icons/pi";
import { IoSkullSharp } from "react-icons/io5";
import { useDemoTimeline } from "../state/demoTimelineStore";
import type {
  TimelineEvent,
  TimelineEventType,
} from "../state/demoTimelineStore";
import { usePlaybackActions } from "./RecordingProvider";
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
  "flag-return": <PiFlagBannerFill />,
  "flag-cap": <PiFlagBannerFill />,
  "match-start": <BsPlayFill />,
  "match-end": <AiFillStop />,
};

const WEAPONS_PAST_TENSE: Record<string, string> = {
  chaingun: "chaingunned",
  plasma: "plasma rifled",
};

function renderEventDescription(event: TimelineEvent): React.ReactNode {
  if (event.type === "kill" && event.killer && event.victim) {
    return (
      <>
        <span className={styles.Killer} title={event.killer}>
          You
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
            you
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
    return <>You grabbed {flagLabel}</>;
  }
  if (event.type === "flag-return") {
    return <>You returned your flag</>;
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
  if (event.type === "match-start") {
    return "Match started";
  }
  if (event.type === "match-end") {
    return "Match ended";
  }
  return event.description;
}

type Filter =
  | "all"
  | "kill"
  | "death"
  | "flag-grab"
  | "flag-return"
  | "flag-cap";

export function DemoTimeline() {
  const events = useDemoTimeline((s) => s.events);
  const scanProgress = useDemoTimeline((s) => s.scanProgress);
  const { seek } = usePlaybackActions();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered =
    events?.filter((e) => filter === "all" || e.type === filter) ?? [];

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
          data-active={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All ({events.length})
        </button>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={filter === "kill"}
          onClick={() => setFilter("kill")}
        >
          Kills ({killCount})
        </button>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={filter === "death"}
          onClick={() => setFilter("death")}
        >
          Deaths ({deathCount})
        </button>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={filter === "flag-grab"}
          onClick={() => setFilter("flag-grab")}
        >
          Grabs ({grabCount})
        </button>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={filter === "flag-return"}
          onClick={() => setFilter("flag-return")}
        >
          Returns ({returnCount})
        </button>
        <button
          type="button"
          className={styles.FilterButton}
          data-active={filter === "flag-cap"}
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
                {renderEventDescription(event)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
