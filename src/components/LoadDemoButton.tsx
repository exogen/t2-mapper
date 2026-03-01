import { useCallback, useRef } from "react";
import { MdOndemandVideo } from "react-icons/md";
import { useDemoActions, useDemoRecording } from "./DemoProvider";
import { createDemoStreamingRecording } from "../demo/streaming";
import styles from "./LoadDemoButton.module.css";

export function LoadDemoButton() {
  const recording = useDemoRecording();
  const { setRecording } = useDemoActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const parseTokenRef = useRef(0);

  const handleClick = useCallback(() => {
    if (recording) {
      // Unload the current recording.
      parseTokenRef.current += 1;
      setRecording(null);
      return;
    }
    inputRef.current?.click();
  }, [recording, setRecording]);

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
        aria-label={recording ? "Unload demo" : "Load demo (.rec)"}
        title={recording ? "Unload demo" : "Load demo (.rec)"}
        onClick={handleClick}
        data-active={recording ? "true" : undefined}
      >
        <MdOndemandVideo className={styles.DemoIcon} />
        <span className={styles.ButtonLabel}>
          {recording ? "Unload demo" : "Demo"}
        </span>
      </button>
    </>
  );
}
