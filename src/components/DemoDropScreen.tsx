import { useCallback, useEffect, useRef, useState } from "react";
import { PiCassetteTapeLight } from "react-icons/pi";
import { useDemoLoad } from "../state/demoLoadStore";
import { loadDemoFile } from "../stream/demoFileLoader";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./DemoDropScreen.module.css";

/**
 * Demo-mode landing filling the content area until a recording loads:
 * a drag & drop target with a clickable cassette to browse for a .rec.
 */
export function DemoDropScreen() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const phase = useDemoLoad((s) => s.phase);
  const progress = useDemoLoad((s) => s.progress);
  const loadError = useDemoLoad((s) => s.error);
  const isLoading = phase === "downloading" || phase === "parsing";

  // A file dropped outside the zone (toolbar, sidebar) would otherwise
  // navigate the page to it.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".rec")) {
      void loadDemoFile(file);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      void loadDemoFile(file);
    },
    [],
  );

  return (
    <div
      className={styles.DropZone}
      data-drag-over={dragOver}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Entering a child fires dragleave on the zone — only clear the
        // highlight when the pointer actually leaves it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".rec"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {isLoading ? (
        <>
          <LoadingIndicator
            isLoading
            progress={phase === "downloading" ? progress : null}
          />
          <p className={styles.LoadingHint}>
            {phase === "downloading" ? "Downloading demo…" : "Loading demo…"}
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles.BrowseButton}
            aria-label="Load demo (.rec)"
            title="Load demo (.rec)"
            onClick={() => inputRef.current?.click()}
          >
            <PiCassetteTapeLight aria-hidden />
          </button>
          {loadError != null && <p className={styles.LoadError}>{loadError}</p>}
          <p className={styles.Hint}>
            Drag &amp; drop a Tribes 2 demo (.rec file) here
          </p>
          <p className={styles.SubHint}>or click the cassette to browse</p>
        </>
      )}
    </div>
  );
}
