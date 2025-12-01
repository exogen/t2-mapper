import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

export async function walkDirectory(
  dir: string,
  {
    onFile,
    onDir = () => true,
  }: {
    onFile?: (fileInfo: { entry: Dirent<string> }) => void | Promise<void>;
    onDir?: (dirInfo: { entry: Dirent<string> }) => boolean | Promise<boolean>;
  },
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const shouldRecurse = onDir ? await onDir({ entry }) : true;
      if (shouldRecurse) {
        const subDir = path.join(entry.parentPath, entry.name);
        await walkDirectory(subDir, { onFile, onDir });
      }
    } else if (entry.isFile()) {
      if (onFile) {
        await onFile({ entry });
      }
    }
  }
}
