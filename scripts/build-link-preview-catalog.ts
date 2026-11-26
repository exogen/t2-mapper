import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  generateLinkPreview,
  type LinkPreviewInput,
} from "../relay/linkPreview.js";
import { linkPreviewCatalogPath } from "../relay/linkPreviewKey.js";
import { getMissionInfo, getMissionList } from "../src/manifest.js";
import { concurrent } from "./lib/assetSync.js";
import {
  linkPreviewMissionDisplayName,
  linkPreviewMissionImage,
} from "./lib/linkPreviewAssets.js";

const pages = ["home", "maps", "demos", "servers", "clips", "replays"] as const;
type CatalogInput = Extract<LinkPreviewInput, { kind: "map" | "page" }>;

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`Usage: npm run previews:build-catalog -- [options]

  --out DIR    Deployment output directory (default: docs)
  --help       Show this help`);
    return;
  }

  const inputs: CatalogInput[] = pages.map((page) => ({
    kind: "page",
    page,
  }));
  for (const missionName of getMissionList()) {
    inputs.push({ kind: "map", missionName });
    for (const missionType of new Set(
      getMissionInfo(missionName).missionTypes,
    )) {
      inputs.push({ kind: "map", missionName, missionType });
    }
  }
  const output = values.out ?? "docs";
  const siteUrl = process.env.LINK_PREVIEW_SITE_URL?.trim() || undefined;
  await concurrent(inputs, 8, async (input) => {
    const { headHtml } = generateLinkPreview(input, {
      siteUrl,
      missionDisplayName: linkPreviewMissionDisplayName,
      missionImage: linkPreviewMissionImage,
    });
    const filename = path.join(output, await linkPreviewCatalogPath(input));
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, headHtml);
  });
  console.log(`Wrote ${inputs.length} map and index snippets to ${output}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
