import { useRef, useState, type ReactNode } from "react";
import { PiCassetteTapeFill, PiCassetteTapeLight } from "react-icons/pi";
import styles from "./DemoDropZone.module.css";

/** One file picker/drop surface, with explicit local-playback or public-upload intent. */
export function DemoDropZone({
  intent,
  onFiles,
  disabled = false,
  hidePicker = false,
  feedback,
  children,
  className,
}: {
  intent: "load" | "upload";
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  hidePicker?: boolean;
  feedback?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const uploading = intent === "upload";
  const label = uploading ? "Upload demo (.rec)" : "Load demo (.rec)";
  return (
    <div
      className={[styles.DropZone, className].filter(Boolean).join(" ")}
      data-drag-over={dragOver && !disabled}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (!disabled && files.length) onFiles(files);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={uploading ? ".rec" : ".rec,.checkpoints.json"}
        multiple={!uploading}
        hidden
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!disabled && files.length) onFiles(files);
        }}
      />
      {children}
      {!hidePicker && (
        <div className={styles.DropUi}>
          <div className={styles.Picker}>
            <div className={styles.Intro}>
              <h2 className={styles.Hint}>
                {uploading ? "Upload a demo" : "Play a demo"}
              </h2>
              <p className={styles.SubHint}>
                {uploading
                  ? "It will be made public and appear in the demo browser."
                  : "Local to your device. It will not be shared."}
              </p>
            </div>
            <div className={styles.FileSlot}>
              {dragOver && !disabled ? (
                <PiCassetteTapeFill className={styles.FileIcon} aria-hidden />
              ) : (
                <PiCassetteTapeLight className={styles.FileIcon} aria-hidden />
              )}
              <span className={styles.SlotLabel}>Drop a .rec file here</span>
              <button
                type="button"
                className={styles.BrowseButton}
                aria-label={label}
                title={label}
                disabled={disabled}
                onClick={() => input.current?.click()}
              >
                Browse…
              </button>
            </div>
          </div>
          {feedback}
        </div>
      )}
    </div>
  );
}
