import { useCallback, useRef, useState } from "react";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { useInputAction } from "./InputControls";
import styles from "./ChatInput.module.css";

export function ChatInput() {
  const [chatText, setChatText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Y (bound while the chat HUD is visible in live mode) focuses the
  // input. Deferred a tick so the bound key's own character doesn't
  // land in the newly focused input.
  useInputAction("focusChat", () => {
    setTimeout(() => inputRef.current?.focus(), 0);
  });

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
        placeholder="Say something…"
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
