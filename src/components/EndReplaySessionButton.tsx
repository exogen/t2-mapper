import {
  replayConnectionStore,
  useReplaySelector,
} from "../state/replayConnectionStore";
import buttonStyles from "./Button.module.css";
import styles from "./EndReplaySessionButton.module.css";

export function EndReplaySessionButton() {
  const state = useReplaySelector((s) => s.state);
  const ready = useReplaySelector((s) => s.ready);
  const connecting = useReplaySelector((s) => s.connecting);
  if (!state?.isOwner || state.closed) return null;
  const busy =
    connecting ||
    !ready ||
    state.status === "preparing" ||
    state.status === "seeking";
  return (
    <button
      type="button"
      className={styles.Button}
      title="End the shared replay for everyone"
      disabled={busy}
      onClick={() => {
        const current = replayConnectionStore.getState();
        if (current.state?.sessionId === state.sessionId)
          current.control("end");
      }}
    >
      <span className={buttonStyles.ButtonLabel}>End replay session</span>
    </button>
  );
}
