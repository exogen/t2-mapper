import { useCallback, useRef } from "react";
import { MdOndemandVideo } from "react-icons/md";
import { usePlaybackActions, useRecording } from "./RecordingProvider";
import { createDemoStreamingRecording } from "../stream/demoStreaming";
import styles from "./LoadDemoButton.module.css";

export function LoadDemoButton() {
  const recording = useRecording();
  const isDemoLoaded = recording?.source === "demo";
  const { setRecording } = usePlaybackActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const parseTokenRef = useRef(0);

  const handleClick = useCallback(() => {
    if (isDemoLoaded) {
      // Unload the current recording.
      parseTokenRef.current += 1;
      setRecording(null);
      return;
    }
    inputRef.current?.click();
  }, [isDemoLoaded, setRecording]);

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
        const recording = await createDemoStreamingRecording(buffer);
        if (parseTokenRef.current !== parseToken) {
          return;
        }
        // Metadata-first: mission/game-mode sync happens immediately.
        setRecording(recording);
      } catch (err) {
        console.error("Failed to load demo:", err);
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
        className={styles.Root}
        aria-label={isDemoLoaded ? "Unload demo" : "Load demo (.rec)"}
        title={isDemoLoaded ? "Unload demo" : "Load demo (.rec)"}
        onClick={handleClick}
        data-active={isDemoLoaded ? "true" : undefined}
        disabled={recording != null && !isDemoLoaded}
      >
        <MdOndemandVideo className={styles.DemoIcon} />
        <span className={styles.ButtonLabel}>
          {isDemoLoaded ? "Unload demo" : "Demo"}
        </span>
      </button>
    </>
  );
}
