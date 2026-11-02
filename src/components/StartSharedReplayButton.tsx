import { LuUsers } from "react-icons/lu";
import { demoLoadStore, useDemoLoad } from "../state/demoLoadStore";
import {
  engineStore,
  isCurrentPlayback,
  useEngineSelector,
} from "../state/engineStore";
import { MAX_REPLAY_UPLOAD_BYTES } from "../../relay/replayTypes";
import { streamClock } from "../state/streamPlaybackStore";
import { STREAM_TICK_SEC } from "../stream/streamHelpers";
import { useAppNavigation } from "./useAppNavigation";
import { useRecording } from "./usePlayback";
import styles from "./Button.module.css";

export function StartSharedReplayButton() {
  const recording = useRecording();
  const reference = useDemoLoad((state) => state.sourceReference);
  const fileName = useDemoLoad((state) => state.sourceFileName);
  const buffer = useEngineSelector((state) => state.playback.demoBuffer);
  const complete = useEngineSelector(
    (state) => state.playback.downloadComplete,
  );
  const navigation = useAppNavigation();
  if (recording?.source !== "demo") return null;
  const canUpload =
    complete &&
    buffer != null &&
    buffer.byteLength > 0 &&
    buffer.byteLength <= MAX_REPLAY_UPLOAD_BYTES;
  return (
    <button
      type="button"
      className={styles.Button}
      disabled={!reference && !canUpload}
      title={
        reference
          ? "Watch this demo together from the current position"
          : buffer && buffer.byteLength > MAX_REPLAY_UPLOAD_BYTES
            ? "This demo exceeds the 150 MB replay upload limit"
            : canUpload
              ? "Upload temporarily for this session; this demo won't be published"
              : "Wait for this demo to finish loading before sharing"
      }
      onClick={() => {
        if (
          !isCurrentPlayback(recording) ||
          demoLoadStore.getState().sourceReference !== reference
        )
          return;
        const tick = Math.max(
          0,
          Math.round(streamClock.time / STREAM_TICK_SEC),
        );
        if (reference) navigation.createReplay(reference, tick);
        else if (
          canUpload &&
          buffer &&
          engineStore.getState().playback.demoBuffer === buffer &&
          engineStore.getState().playback.downloadComplete &&
          demoLoadStore.getState().sourceFileName === fileName
        )
          navigation.createLocalReplay(
            buffer,
            fileName ?? "Uploaded demo.rec",
            tick,
          );
      }}
    >
      <LuUsers aria-hidden="true" />
      <span className={styles.ButtonLabel}>Start shared replay</span>
    </button>
  );
}
