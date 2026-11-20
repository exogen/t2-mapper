import type { ReactNode } from "react";
import { GoDotFill } from "react-icons/go";
import { TbStrokeCurved } from "react-icons/tb";
import styles from "./TimelineMarkerButton.module.css";

interface TimelineMarkerButtonProps {
  kind: "match-start" | "flag-cap" | "clip-jump";
  position: number;
  title: string;
  "aria-label": string;
  "aria-pressed"?: boolean;
  color?: string;
  disabled?: boolean;
  onActivate(): void;
}

export function TimelineMarkerLayer({ children }: { children: ReactNode }) {
  return <div className={styles.Layer}>{children}</div>;
}

export function TimelineMarkerButton({
  kind,
  position,
  title,
  "aria-label": label,
  "aria-pressed": pressed,
  color,
  disabled,
  onActivate,
}: TimelineMarkerButtonProps) {
  return (
    <button
      type="button"
      className={kind === "flag-cap" ? styles.FlagTick : styles.Tick}
      data-type={kind}
      title={title}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Home and End would otherwise move an enclosing slider.
        if (event.key === "Home" || event.key === "End") event.preventDefault();
      }}
      onClick={(event) => {
        onActivate();
        // Keep keyboard focus for tab navigation. After a pointer click,
        // Space should control playback again.
        if (event.detail > 0) event.currentTarget.blur();
      }}
      style={{ left: `${Math.max(0, Math.min(100, position * 100))}%`, color }}
    >
      {kind === "flag-cap" ? (
        <GoDotFill className={styles.FlagIcon} aria-hidden="true" />
      ) : pressed ? (
        <TbStrokeCurved className={styles.TickIcon} aria-hidden="true" />
      ) : (
        <svg
          className={styles.TickIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 4.3v15.4" />
        </svg>
      )}
    </button>
  );
}
