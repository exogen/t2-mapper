import type { ScriptLoader } from "./types";
import { getUrlForPath } from "../loaders";

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
      console.warn(`Script not in manifest: ${path} (${err})`);
      return null;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Script fetch failed: ${path} (${response.status})`);
        return null;
      }
      return await response.text();
    } catch (err) {
      console.error(`Script fetch error: ${path}`);
      console.error(err);
      return null;
    }
  };
}
