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
import type { FlagState } from "../../relay/flagState";
import { getPlayerResolver } from "../state/playerResolver";
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

export function FlagStatus({
  flag,
  icons = "status",
  coloredNames = false,
}: {
  flag: FlagState;
  icons?: "status" | "flag" | false;
  coloredNames?: boolean;
}) {
  const players = useStreamSnapshot(getPlayerResolver);
  const { rawName, name } = flag.carrier ? players.display(flag.carrier) : {};
  let Icon;
  let label;
  switch (flag.status) {
    case "held":
      Icon = FaHand;
      label = name ? (
        coloredNames ? (
          <ColoredName raw={rawName || name} />
        ) : (
          name
        )
      ) : (
        "Held"
      );
      break;
    case "field":
      Icon = ImArrowDownRight;
      label = <DroppedFlagLabel teamId={flag.teamId} />;
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
        title={flag.status === "held" ? name : undefined}
      >
        {label}
      </span>
    </>
  );
}
