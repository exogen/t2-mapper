import { useCallback, useState } from "react";
import { liveConnectionStore } from "../state/liveConnectionStore";
import styles from "./ChatInput.module.css";

export function ChatInput() {
  const [chatText, setChatText] = useState("");

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
        className={styles.Input}
        type="text"
        placeholder="Say something…"
        value={chatText}
        onChange={(e) => setChatText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        maxLength={255}
      />
    </form>
  );
}
