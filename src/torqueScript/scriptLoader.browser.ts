import type { ScriptLoader } from "./types";
import { createLogger } from "../logger";
import { getUrlForPath } from "../loaders";

const log = createLogger("scriptLoader");

/**
 * Creates a script loader for browser environments that fetches scripts
 * using the manifest-based URL resolution.
 */
export function createScriptLoader(): ScriptLoader {
  return async (path: string): Promise<string | null> => {
    let url: string;
    try {
      url = getUrlForPath(path);
    } catch (err) {
      log.warn("Script not in manifest: %s (%s)", path, err);
      return null;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        log.error("Script fetch failed: %s (%d)", path, response.status);
        return null;
      }
      return await response.text();
    } catch (err) {
      log.error("Script fetch error: %s %o", path, err);
      return null;
    }
  };
}
