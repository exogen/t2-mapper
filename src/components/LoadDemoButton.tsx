import { useCallback, useRef } from "react";
import { MdOndemandVideo } from "react-icons/md";
import { createLogger } from "../logger";
import { cameraTourStore } from "../state/cameraTourStore";
import { demoTimelineStore } from "../state/demoTimelineStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { usePlaybackActions, useRecording } from "./usePlayback";
import styles from "./Button.module.css";

const log = createLogger("LoadDemoButton");

export function LoadDemoButton({
  isActive = false,
  choosingMap = false,
  onCancelChoosingMap,
}: {
  isActive?: boolean;
  choosingMap?: boolean;
  onCancelChoosingMap?: () => void;
}) {
  const recording = useRecording();
  const isDemoLoaded = recording?.source === "demo";
  const { setRecording } = usePlaybackActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const parseTokenRef = useRef(0);
  const scanAbortRef = useRef<AbortController | null>(null);

  const handleClick = useCallback(() => {
    cameraTourStore.getState().cancel();
    if (choosingMap && isDemoLoaded) {
      onCancelChoosingMap?.();
      return;
    }
    if (isDemoLoaded) {
      // Unload the recording/parser but leave entities frozen in the store.
      parseTokenRef.current += 1;
      scanAbortRef.current?.abort();
      scanAbortRef.current = null;
      setRecording(null);
      demoTimelineStore.getState().reset();
      return;
    }
    inputRef.current?.click();
  }, [isDemoLoaded, choosingMap, onCancelChoosingMap, setRecording]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset the input so the same file can be re-selected.
      e.target.value = "";
      try {
        const buffer = await file.arrayBuffer();
        const parseToken = parseTokenRef.current + 1;
        parseTokenRef.current = parseToken;
        const { createDemoStreamingRecording } =
          await import("../stream/demoStreaming");
        const recording = await createDemoStreamingRecording(buffer);
        if (parseTokenRef.current !== parseToken) {
          return;
        }
        // Disconnect from any live server before loading the demo.
        const liveState = liveConnectionStore.getState();
        liveState.disconnectServer();
        // Metadata-first: mission/game-mode sync happens immediately.
        setRecording(recording);
        // Kick off background timeline scan.
        scanAbortRef.current?.abort();
        const abortController = new AbortController();
        scanAbortRef.current = abortController;
        const store = demoTimelineStore.getState();
        store.reset();
        store.setScanProgress(0);
        import("../stream/demoTimelineScanner")
          .then(({ scanDemoTimeline }) =>
            scanDemoTimeline(
              buffer,
              recording.recorderName,
              (p) => {
                if (parseTokenRef.current !== parseToken) return;
                demoTimelineStore.getState().setScanProgress(p);
              },
              abortController.signal,
            ),
          )
          .then((events) => {
            if (parseTokenRef.current !== parseToken) return;
            const s = demoTimelineStore.getState();
            s.setEvents(events);
            s.setScanProgress(null);
          })
          .catch((err: unknown) => {
            if (parseTokenRef.current !== parseToken) return;
            if (err instanceof Error && err.name === "AbortError") return;
            log.error("Timeline scan failed: %o", err);
            demoTimelineStore.getState().setScanProgress(null);
          });
      } catch (err) {
        log.error("Failed to load demo: %o", err);
      }
    },
    [setRecording],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".rec"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button
        type="button"
        className={styles.Button}
        aria-label={isDemoLoaded ? "Unload demo" : "Load demo (.rec)"}
        title={isDemoLoaded ? "Unload demo" : "Load demo (.rec)"}
        onClick={handleClick}
        data-active={isActive}
      >
        <MdOndemandVideo className={styles.DemoIcon} />
        <span className={styles.ButtonLabel}>Demo</span>
        <span className={styles.ButtonHint}>
          {choosingMap && isDemoLoaded
            ? "Return to demo"
            : isDemoLoaded
              ? "Click to unload"
              : "Load a .rec file"}
        </span>
      </button>
    </>
  );
}
