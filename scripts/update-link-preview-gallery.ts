/**
 * Refresh the exact-mission screenshot catalog used by link previews.
 *
 * node --import=tsx/esm scripts/update-link-preview-gallery.ts \
 *   --source ../t2-maps/public/missions.json --images ../t2-maps/docs/images
 *
 * Reads local files only. Keep images in t2-maps; this copies their catalog.
 */
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { format, resolveConfig } from "prettier";

const SOURCE_URL = "https://exogen.github.io/t2-maps/missions.json";

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      images: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`Usage: node --import=tsx/esm scripts/update-link-preview-gallery.ts [options]

  --source FILE   t2-maps missions.json (default: ../t2-maps/public/missions.json)
  --images DIR    Optional local directory; verify each first screenshot exists
  --out FILE      Snapshot output (default: scripts/lib/linkPreviewGallery.json)
  --help          Show this help

Only exact missions with imageCount > 0 enter the catalog. No images are copied.`);
    return;
  }

  const source = path.resolve(
    values.source ?? "../t2-maps/public/missions.json",
  );
  const raw: unknown = JSON.parse(await readFile(source, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Gallery missions.json must be a mission object map");

  const entries: Array<[string, string | null, number]> = [];
  const names = new Set<string>();
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Gallery entry ${key} must be an object`);
    const mission = value as Record<string, unknown>;
    if (
      typeof mission.missionName !== "string" ||
      !mission.missionName.trim() ||
      /[\\/\x00]/.test(mission.missionName) ||
      !Number.isSafeInteger(mission.imageCount) ||
      Number(mission.imageCount) < 0 ||
      (mission.displayName !== null && typeof mission.displayName !== "string")
    )
      throw new Error(
        `Gallery entry ${key} has invalid name, display name, or image count`,
      );
    const name = mission.missionName;
    if (names.has(name.toLowerCase()))
      throw new Error(
        `Gallery contains duplicate case-insensitive mission ${name}`,
      );
    names.add(name.toLowerCase());
    if (mission.imageCount === 0) continue;
    if (values.images) {
      const imagePath = path.resolve(values.images, `${name}.1.webp`);
      await access(imagePath).catch(() => {
        throw new Error(`Missing gallery screenshot: ${imagePath}`);
      });
    }
    entries.push([
      name,
      mission.displayName as string | null,
      Number(mission.imageCount),
    ]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (!entries.length)
    throw new Error("Gallery catalog contains no screenshots");

  const out = path.resolve(values.out ?? "scripts/lib/linkPreviewGallery.json");
  const json = await format(JSON.stringify({ source: SOURCE_URL, entries }), {
    ...(await resolveConfig(out)),
    parser: "json",
  });
  await writeFile(out, json);
  console.log(`Cataloged ${entries.length} exact gallery missions in ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
