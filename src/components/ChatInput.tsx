import { useCallback, useEffect, useRef, useState } from "react";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { formatDelay } from "../stringUtils";
import styles from "./ChatInput.module.css";

export function ChatInput() {
  const [chatText, setChatText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Tournament-delayed streams: warn that sent chat reaches the server
  // live while the watched stream lags behind.
  const streamDelayMs = useLiveSelector((s) => s.streamDelayMs);

  // Y focuses the chat input; preventDefault keeps the "y" itself out
  // of it. Typing in another text field (or here) is left alone.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyY" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA")
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = chatText.trim();
      if (!text) return;
      liveConnectionStore.getState().sendCommand("messageSent", text);
      setChatText("");
    },
    [chatText],
  );

  return (
    <form className={styles.InputForm} onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className={styles.Input}
        type="text"
        placeholder={
          streamDelayMs > 0
            ? `Say something… (delayed ${formatDelay(streamDelayMs)})`
            : "Say something…"
        }
        value={chatText}
        onChange={(e) => setChatText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            // Hand key input back to the game — the input bindings
            // listen on window and resume once nothing focused is
            // swallowing events.
            e.currentTarget.blur();
          }
        }}
        onKeyUp={(e) => e.stopPropagation()}
        maxLength={255}
      />
    </form>
  );
}
