import { lazy, memo, Suspense, useEffect, useRef } from "react";
import { useEngineSelector } from "../state/engineStore";
import { ChatMessage, ChatSegment } from "../stream/types";
import styles from "./ChatWindow.module.css";

const ChatInput = lazy(() =>
  import("./ChatInput").then((mod) => ({ default: mod.ChatInput })),
);

const EMPTY_MESSAGES: ChatMessage[] = [];

/** Map a colorCode to a CSS module class name (c0–c9 GuiChatHudProfile). */
const CHAT_COLOR_CLASSES: Record<number, string> = {
  0: styles.ChatColor0,
  1: styles.ChatColor1,
  2: styles.ChatColor2,
  3: styles.ChatColor3,
  4: styles.ChatColor4,
  5: styles.ChatColor5,
  6: styles.ChatColor6,
  7: styles.ChatColor7,
  8: styles.ChatColor8,
  9: styles.ChatColor9,
};

function segmentColorClass(colorCode: number): string {
  return CHAT_COLOR_CLASSES[colorCode] ?? CHAT_COLOR_CLASSES[0];
}

function chatColorClass(msg: ChatMessage): string {
  if (msg.colorCode != null && CHAT_COLOR_CLASSES[msg.colorCode]) {
    return CHAT_COLOR_CLASSES[msg.colorCode];
  }
  // Fallback: default to \c0 (teal). Messages with detected codes (like \c2
  // for flag events) will match above; \c0 kill messages may lose their null
  // byte color code, so the correct default for server messages is c0.
  return CHAT_COLOR_CLASSES[0];
}

export const ChatWindow = memo(function ChatWindow() {
  const isLive = useEngineSelector(
    (state) => state.playback.recording?.source === "live",
  );
  const messages = useEngineSelector(
    (state) => state.playback.streamSnapshot?.chatMessages ?? EMPTY_MESSAGES,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lastMessageId]);

  return (
    <div className={styles.ChatContainer}>
      <div ref={scrollRef} className={styles.ChatWindow}>
        {messages.map((msg: ChatMessage) => (
          <div key={msg.id} className={styles.ChatMessage} hidden={!msg.text}>
            {msg.segments ? (
              msg.segments.map((seg: ChatSegment, j: number) => (
                <span key={j} className={segmentColorClass(seg.colorCode)}>
                  {seg.text}
                </span>
              ))
            ) : (
              <span className={chatColorClass(msg)}>
                {msg.sender ? `${msg.sender}: ` : ""}
                {msg.text}
              </span>
            )}
          </div>
        ))}
      </div>
      {isLive && (
        <Suspense>
          <ChatInput />
        </Suspense>
      )}
    </div>
  );
});
