import { useCallback, useSyncExternalStore } from "react";
import { FaHand } from "react-icons/fa6";
import { ImArrowDownRight, ImHome } from "react-icons/im";
import { PiFlagBannerFill } from "react-icons/pi";
import {
  streamSnapshotStore,
  useStreamSnapshot,
} from "../state/streamSnapshotStore";
import { streamClock } from "../state/streamPlaybackStore";
import { flagReturnSecondsRemaining } from "../stream/flagReturnTimer";
import type { TeamScore } from "../stream/types";
import { ColoredName } from "./ColoredName";
import styles from "./FlagStatus.module.css";

function subscribeFlagCountdown(onChange: () => void) {
  const unsubscribe = streamSnapshotStore.subscribe(onChange);
  // Playback time keeps advancing even when no new packets arrive.
  const timer = setInterval(onChange, 250);
  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}

function DroppedFlagLabel({ teamId }: { teamId: number }) {
  const getRemaining = useCallback(
    () =>
      flagReturnSecondsRemaining(
        streamSnapshotStore.getState().snapshot,
        teamId,
        streamClock.time,
      ),
    [teamId],
  );
  const remaining = useSyncExternalStore(
    subscribeFlagCountdown,
    getRemaining,
    getRemaining,
  );
  return remaining == null ? (
    "Dropped"
  ) : (
    <>
      Dropped <span className={styles.Separator}>–</span> {remaining}s
    </>
  );
}

function ColoredCarrierName({
  name,
  rawName,
}: {
  name: string;
  rawName?: string;
}) {
  const raw = useStreamSnapshot((snapshot) => {
    if (rawName) return rawName;
    const matches = snapshot?.playerRoster.filter(
      (player) => player.name === name,
    );
    return matches?.length === 1 ? matches[0].rawName || name : name;
  });
  return <ColoredName raw={raw} />;
}

export function FlagStatus({
  team,
  icons = "status",
  coloredNames = false,
}: {
  team: Pick<
    TeamScore,
    "teamId" | "flagStatus" | "flagCarrier" | "flagCarrierRawName"
  >;
  icons?: "status" | "flag" | false;
  coloredNames?: boolean;
}) {
  let Icon;
  let label;
  switch (team.flagStatus) {
    case "held":
      Icon = FaHand;
      label =
        team.flagCarrier && coloredNames ? (
          <ColoredCarrierName
            name={team.flagCarrier}
            rawName={team.flagCarrierRawName}
          />
        ) : (
          (team.flagCarrier ?? "Held")
        );
      break;
    case "field":
      Icon = ImArrowDownRight;
      label = <DroppedFlagLabel teamId={team.teamId} />;
      break;
    case "home":
      Icon = ImHome;
      label = "Home";
      break;
    default:
      return null;
  }
  if (icons === "flag") Icon = PiFlagBannerFill;
  return (
    <>
      {icons && <Icon aria-hidden />}
      <span
        className={styles.Label}
        title={team.flagStatus === "held" ? team.flagCarrier : undefined}
      >
        {label}
      </span>
    </>
  );
}
