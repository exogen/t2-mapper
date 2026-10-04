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

const WEAPONS_PAST_TENSE: Record<string, string> = {
  chaingun: "chaingunned",
  plasma: "plasma rifled",
};

function renderEventDescription(event: TimelineEvent): React.ReactNode {
  // Names as sent, so the official clan tag shows in its yellow; a
  // name without markup renders as plain text.
  const named = (name: string | undefined, raw: string | undefined) =>
    raw ? <ColoredName raw={raw} tagsOnly /> : (name ?? "");
  if (event.type === "kill" && event.killer && event.victim) {
    return (
      <>
        <span className={styles.Killer} title={event.killer}>
          {event.isRecorder ? "You" : named(event.killer, event.raw?.killer)}
        </span>{" "}
        <span className={styles.DamageType}>
          {event.weapon
            ? (WEAPONS_PAST_TENSE[event.weapon] ??
              `${event.weapon}${event.weapon.endsWith("e") ? "d" : "ed"}`)
            : "killed"}
        </span>{" "}
        <span className={styles.Victim}>
          {named(event.victim, event.raw?.victim)}
        </span>
      </>
    );
  }
  if (event.type === "death") {
    if (event.killer) {
      return (
        <>
          <span className={styles.Killer}>
            {named(event.killer, event.raw?.killer)}
          </span>{" "}
          <span className={styles.DamageType}>
            {event.weapon
              ? (WEAPONS_PAST_TENSE[event.weapon] ??
                `${event.weapon}${event.weapon.endsWith("e") ? "d" : "ed"}`)
              : "killed"}
          </span>{" "}
          <span className={styles.Victim} title={event.victim}>
            {/* The scanner emits deaths only when the recorder is the victim. */}
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
    if (event.teamAffinity === "friendly") {
      return <>You grabbed {flagLabel}</>;
    }
    if (event.actor) {
      return (
        <>
          {event.isRecorder ? "You" : named(event.actor, event.raw?.actor)}{" "}
          grabbed {flagLabel}
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
          {event.isRecorder ? "You" : named(event.actor, event.raw?.actor)}{" "}
          dropped {flagLabel}
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
          {event.isRecorder ? "You" : named(event.actor, event.raw?.actor)}{" "}
          returned {flagLabel}
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
        {named(event.capturer, event.raw?.capturer)} captured {flagLabel}
      </>
    );
  }
  if (event.type === "rename" && event.actor) {
    return (
      <>
        <span className={styles.Victim} title={event.previousName}>
          {event.previousName
            ? named(event.previousName, event.raw?.previousName)
            : "A player"}
        </span>{" "}
        <span className={styles.DamageType}>is now</span>{" "}
        <span className={styles.Killer}>
          {named(event.actor, event.raw?.actor)}
        </span>
      </>
    );
  }
  if (event.type === "generator-offline" || event.type === "generator-online") {
    if (!event.actor) return event.description;
    const action = event.type === "generator-online" ? "repaired" : "destroyed";
    return (
      <>
        {named(event.actor, event.raw?.actor)} {action} the{" "}
        {event.generatorLabel ?? "generator"}
      </>
    );
  }
  if (event.type === "match-start" || event.type === "match-end") {
    return event.description;
  }
  return event.description;
}

type Filter =
  | "all"
  | "kill"
  | "death"
  | "flag-grab"
  | "flag-return"
  | "flag-cap"
  | "gens"
  | "rename";

interface EventFilter {
  value: Filter;
  label: string;
  types?: TimelineEventType[];
  playerOnly?: boolean;
  hideWhenEmpty?: boolean;
}

const EVENT_FILTERS: EventFilter[] = [
  { value: "all", label: "All" },
  { value: "kill", label: "Kills", types: ["kill"], playerOnly: true },
  { value: "death", label: "Deaths", types: ["death"], playerOnly: true },
  { value: "flag-grab", label: "Grabs", types: ["flag-grab"] },
  { value: "flag-return", label: "Returns", types: ["flag-return"] },
  { value: "flag-cap", label: "Caps", types: ["flag-cap"] },
  {
    value: "gens",
    label: "Gens",
    types: ["generator-offline", "generator-online"],
  },
  { value: "rename", label: "Names", types: ["rename"], hideWhenEmpty: true },
];

export function DemoTimeline() {
  const events = useDemoTimeline((s) => s.events);
  const scanProgress = useDemoTimeline((s) => s.scanProgress);
  const error = useDemoTimeline((s) => s.error);
  const observerPerspective = useDemoTimeline((s) => s.observerPerspective);
  const recording = useRecording();
  const { setSidebarOpen, observerTeamColors } = useSettings();
  // Match the overlay layout and navigation actions in MapInspector.
  const sidebarOverlayMode = useMediaQuery("(max-width: 899px)") ?? false;
  const [filter, setFilter] = useState<Filter>("all");

  // Filters never persist across demos — each load starts on "All".
  useEffect(() => {
    setFilter("all");
  }, [events]);

  // Observer recordings never emit kills/deaths — their chips are
  // hidden, and a selection guards against the pre-reset render.
  const effectiveFilter =
    EVENT_FILTERS.find(
      ({ value, playerOnly }) =>
        value === filter && !(observerPerspective && playerOnly),
    ) ?? EVENT_FILTERS[0];

  const filtered =
    events?.filter(
      (e) => !effectiveFilter.types || effectiveFilter.types.includes(e.type),
    ) ?? [];

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

  const eventCounts = new Map<TimelineEventType, number>();
  for (const event of events) {
    eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);
  }

  return (
    <div className={styles.Root}>
      <div className={styles.Filters}>
        {EVENT_FILTERS.map(
          ({ value, label, types, playerOnly, hideWhenEmpty }) => {
            const count = types
              ? types.reduce(
                  (sum, type) => sum + (eventCounts.get(type) ?? 0),
                  0,
                )
              : events.length;
            if (
              (observerPerspective && playerOnly) ||
              (hideWhenEmpty && !count)
            )
              return null;
            return (
              <button
                key={value}
                type="button"
                className={styles.FilterButton}
                data-active={effectiveFilter.value === value}
                onClick={() => setFilter(value)}
              >
                {label} ({count})
              </button>
            );
          },
        )}
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
              title={event.description}
              onClick={() => handleClick(event)}
            >
              <span className={styles.EventTime}>
                {formatPlayheadTime(event.timeSec)}
              </span>
              <span
                className={styles.EventIcon}
                data-type={event.type}
                style={{
                  color: timelineFlagColor(
                    event,
                    observerPerspective,
                    observerTeamColors,
                  ),
                }}
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
