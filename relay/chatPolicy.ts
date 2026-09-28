/** Outgoing browser chat is enabled by default, matching existing relays. */
export function loadChatEnabled(raw: string | undefined): boolean {
  switch (raw?.trim().toLowerCase()) {
    case undefined:
    case "":
    case "1":
    case "true":
      return true;
    case "0":
    case "false":
      return false;
    default:
      throw new Error("RELAY_CHAT_ENABLED must be true, false, 1, or 0");
  }
}
