import { RiMovieAiLine } from "react-icons/ri";
import { useStore } from "zustand";
import { useLiveSelector } from "../state/liveConnectionStore";
import {
  exitLiveDirector,
  liveDirectorStore,
  startLiveDirector,
} from "../state/liveDirectorStore";
import { Accordion } from "./Accordion";
import buttonStyles from "./Button.module.css";
import inspectorStyles from "./InspectorControls.module.css";
import styles from "./LiveCastControl.module.css";

export function LiveCastControl() {
  const watchStatus = useLiveSelector((state) =>
    state.role === "watcher" ? state.watchStatus : null,
  );
  const available = useLiveSelector((state) => state.liveCastAvailable);
  const status = useStore(liveDirectorStore, (state) => state.status);
  const active = status === "playing" || status === "loading";
  if (!watchStatus || watchStatus === "ended") return null;
  if (!active && (!available || watchStatus !== "live")) return null;

  return (
    <Accordion value="cast" label="Cast">
      <p className={inspectorStyles.Description}>
        CastGenius is available for this stream. Sit back and watch while the
        camera is directed for you.
      </p>
      <button
        type="button"
        className={styles.Button}
        data-active={active}
        onClick={active ? exitLiveDirector : startLiveDirector}
      >
        <RiMovieAiLine aria-hidden />
        <span className={buttonStyles.ButtonLabel}>
          {active ? "Exit CastGenius" : "Start CastGenius"}
        </span>
      </button>
    </Accordion>
  );
}
