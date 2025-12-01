import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScriptLoader } from "./types";

export interface CreateScriptLoaderOptions {
  searchPaths: string[];
}

export function createScriptLoader(
  options: CreateScriptLoaderOptions,
): ScriptLoader {
  const { searchPaths } = options;

  return async (path: string): Promise<string | null> => {
    const normalizedPath = path.replace(/\\/g, "/");

    for (const basePath of searchPaths) {
      const fullPath = join(basePath, normalizedPath);
      try {
        return await readFile(fullPath, "utf8");
      } catch {
        // File doesn't exist in this search path, try next
      }
    }

    return null;
  };
}
