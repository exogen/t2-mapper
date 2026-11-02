import { isReplayCreatorId } from "../../relay/replayTypes";
import { randomId } from "../randomId";

const COOKIE_NAME = "mapgenius.replay.client";
const COOKIE_ERROR = "Cookies must be enabled to create a replay session";

function readCookie(): string | undefined {
  try {
    for (const part of document.cookie.split(";")) {
      const separator = part.indexOf("=");
      if (separator >= 0 && part.slice(0, separator).trim() === COOKIE_NAME)
        return part.slice(separator + 1).trim();
    }
  } catch {
    throw new Error(COOKIE_ERROR);
  }
}

/** Read fresh so every tab uses the same browser-session creation identity. */
export function getReplayCreatorId(): string {
  const existing = readCookie();
  if (existing !== undefined) {
    if (!isReplayCreatorId(existing))
      throw new Error(
        "The replay session cookie is invalid; clear it before creating a replay",
      );
    return existing;
  }
  const id = randomId();
  try {
    document.cookie = `${COOKIE_NAME}=${id}; Path=/; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    throw new Error(COOKIE_ERROR);
  }
  if (readCookie() !== id) throw new Error(COOKIE_ERROR);
  return id;
}
