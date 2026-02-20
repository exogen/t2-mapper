import { useCallback, useRef } from "react";
import { FiFilm } from "react-icons/fi";
import { useDemo } from "./DemoProvider";
import { parseDemoFile } from "../demo/parse";

export function LoadDemoButton() {
  const { setRecording, recording } = useDemo();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    if (recording) {
      // Unload the current recording.
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
        const demo = parseDemoFile(buffer);
        setRecording(demo);
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
        className="IconButton LabelledButton"
        aria-label={recording ? "Unload demo" : "Load demo (.rec)"}
        title={recording ? "Unload demo" : "Load demo (.rec)"}
        onClick={handleClick}
        data-active={recording ? "true" : undefined}
      >
        <FiFilm />
        <span className="ButtonLabel">
          {recording ? "Unload demo" : "Demo"}
        </span>
      </button>
    </>
  );
}
