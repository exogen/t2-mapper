/**
 * Render local, standalone examples and inspectable metadata artifacts.
 *
 * npm run previews:render -- --out /tmp/mapgenius-previews
 * npm run previews:render -- --serve
 * npm run previews:render -- --input /tmp/my-preview.json --out /tmp/my-preview
 *
 * This writes local files only. Nothing is uploaded or deployed.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import express from "express";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";
import {
  DEFAULT_LINK_PREVIEW_ICON,
  generateLinkPreview,
  type LinkPreviewInput,
} from "../relay/linkPreview";
import { LinkPreviewDocument } from "../relay/linkPreviewDocument";
import { linkPreviewUrl } from "../relay/linkPreviewRoute";
import {
  linkPreviewArtifacts,
  linkPreviewObjectKey,
} from "../relay/linkPreviewStorage";
import {
  linkPreviewMissionDisplayName,
  linkPreviewMissionImage,
} from "./lib/linkPreviewAssets";
import { linkPreviewFixtures } from "./lib/linkPreviewFixtures";

const PAGES = new Set(["home", "maps", "demos", "servers", "clips", "replays"]);
const PREVIEW_PORT = 8938;
const LOCAL_ICON_PATH = `preview-assets/${DEFAULT_LINK_PREVIEW_ICON}`;

async function servePreviews(output: string) {
  const app = express();
  app.use(express.static(output));
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PREVIEW_PORT, "127.0.0.1", resolve);
  });
  console.log(`Metadata editor: http://127.0.0.1:${PREVIEW_PORT}/edit.html`);
  console.log(`Example gallery: http://127.0.0.1:${PREVIEW_PORT}/`);
}

async function writeEditor(
  output: string,
  preview: ReturnType<typeof generateLinkPreview>,
  iconUrl: string,
) {
  const result = await build({
    configFile: false,
    logLevel: "warn",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      lib: {
        entry: path.resolve(import.meta.dirname, "../src/linkPreviewEditor.ts"),
        name: "MapGeniusPreviewEditor",
        formats: ["iife"],
      },
    },
  });
  const bundles = Array.isArray(result) ? result : [result];
  const script = bundles
    .flatMap((bundle) => ("output" in bundle ? bundle.output : []))
    .find((file) => file.type === "chunk" && file.isEntry);
  if (script?.type !== "chunk")
    throw new Error("Missing preview editor bundle");
  // Only the build output goes in the script. Pasted HTML is read as inert text.
  const code = script.code.replace(/<\/script/gi, "<\\/script");
  const editor = h(
    "form",
    { className: "editor", id: "preview-editor" },
    h(
      "label",
      null,
      "Page URL for relative images",
      h("input", {
        name: "url",
        type: "url",
        required: true,
        defaultValue: preview.metadata.url,
      }),
    ),
    h(
      "label",
      null,
      "Metadata HTML",
      h("textarea", {
        name: "html",
        required: true,
        spellCheck: false,
        defaultValue: preview.headHtml.replace(/></g, ">\n<"),
      }),
    ),
    h("button", { type: "submit" }, "Update previews"),
    h(
      "p",
      { className: "empty", id: "preview-status", role: "status" },
      "Paste a head snippet or full HTML. Your browser loads any images referenced in the preview.",
    ),
    h("script", {
      dangerouslySetInnerHTML: {
        __html: `document.addEventListener("DOMContentLoaded", () => {\n${code}\n});`,
      },
    }),
  );
  const document = h(LinkPreviewDocument, {
    metadata: preview.metadata,
    head: h("title", null, "Edit link metadata"),
    editor,
    localIcon: { url: iconUrl, src: LOCAL_ICON_PATH },
  });
  await writeFile(
    path.join(output, "edit.html"),
    "<!doctype html>" + renderToStaticMarkup(document),
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${field} must be a nonempty string`);
}

function optionalNumber(value: unknown, field: string): void {
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value))
  )
    throw new Error(`${field} must be a finite number`);
}

function validateDemo(value: unknown, field: string): void {
  if (!object(value))
    throw new Error(`${field} must be a demo metadata object`);
  requireString(value.filename, `${field}.filename`);
  requireString(value.recordedAt, `${field}.recordedAt`);
  if (!Array.isArray(value.games))
    throw new Error(`${field}.games must be an array`);
  for (const [index, game] of value.games.entries()) {
    if (!object(game))
      throw new Error(`${field}.games[${index}] must be an object`);
    requireString(game.mission, `${field}.games[${index}].mission`);
    requireString(game.gameType, `${field}.games[${index}].gameType`);
    if (typeof game.startMs !== "number" || !Number.isFinite(game.startMs))
      throw new Error(
        `${field}.games[${index}].startMs must be a finite number`,
      );
    if (typeof game.tournament !== "boolean")
      throw new Error(`${field}.games[${index}].tournament must be a boolean`);
    if (game.title !== undefined)
      requireString(game.title, `${field}.games[${index}].title`);
    if (
      game.teamNames !== undefined &&
      (!object(game.teamNames) ||
        Object.values(game.teamNames).some((name) => typeof name !== "string"))
    )
      throw new Error(
        `${field}.games[${index}].teamNames must contain string names`,
      );
  }
  if (
    !Array.isArray(value.players) ||
    value.players.some((name) => typeof name !== "string")
  )
    throw new Error(`${field}.players must be an array of names`);
  for (const name of ["server", "address", "mod", "recorder"])
    if (typeof value[name] !== "string")
      throw new Error(`${field}.${name} must be a string`);
  for (const name of ["bytes", "durationMs"])
    if (typeof value[name] !== "number" || !Number.isFinite(value[name]))
      throw new Error(`${field}.${name} must be a finite number`);
  optionalNumber(value.playerCount, `${field}.playerCount`);
}

/** Validate fixture data before it reaches the renderer; this is not an API. */
function validateInput(value: unknown): asserts value is LinkPreviewInput {
  if (!object(value)) throw new Error("Each preview must be an object");
  if (value.image !== undefined) {
    if (!object(value.image)) throw new Error("image must be an object");
    requireString(value.image.url, "image.url");
    requireString(value.image.alt, "image.alt");
    optionalNumber(value.image.width, "image.width");
    optionalNumber(value.image.height, "image.height");
  }
  switch (value.kind) {
    case "map":
      requireString(value.missionName, "missionName");
      if (value.missionType !== undefined)
        requireString(value.missionType, "missionType");
      if (value.displayName !== undefined)
        requireString(value.displayName, "displayName");
      if (value.description !== undefined)
        requireString(value.description, "description");
      break;
    case "demo":
      validateDemo(value.demo, "demo");
      if (value.reference !== undefined)
        requireString(value.reference, "reference");
      break;
    case "clip": {
      if (!object(value.clip)) throw new Error("clip must be an object");
      for (const field of ["id", "title", "sourceDemo"])
        requireString(value.clip[field], `clip.${field}`);
      for (const field of ["startSec", "createdAt"])
        if (
          typeof value.clip[field] !== "number" ||
          !Number.isFinite(value.clip[field])
        )
          throw new Error(`clip.${field} must be a finite number`);
      if (!["processing", "ready", "failed"].includes(String(value.clip.state)))
        throw new Error("clip.state must be processing, ready, or failed");
      optionalNumber(value.clip.durationMs, "clip.durationMs");
      if (value.clip.creatorName !== undefined)
        requireString(value.clip.creatorName, "clip.creatorName");
      if (value.demo !== undefined) validateDemo(value.demo, "demo");
      break;
    }
    case "server":
      if (!object(value.server)) throw new Error("server must be an object");
      requireString(value.server.name, "server.name");
      if (value.reference !== undefined) {
        if (!object(value.reference))
          throw new Error("reference must select a server address or name");
        if (value.reference.address !== undefined)
          requireString(value.reference.address, "reference.address");
        else requireString(value.reference.name, "reference.name");
      }
      for (const field of ["address", "mapName", "gameType", "mod"])
        if (
          value.server[field] !== undefined &&
          typeof value.server[field] !== "string"
        )
          throw new Error(`server.${field} must be a string`);
      for (const field of ["playerCount", "maxPlayers", "botCount"])
        optionalNumber(value.server[field], `server.${field}`);
      break;
    case "profile":
      if (!object(value.profile)) throw new Error("profile must be an object");
      for (const field of ["name", "discordId", "discordUsername"])
        requireString(value.profile[field], `profile.${field}`);
      if (
        value.profile.image !== null &&
        typeof value.profile.image !== "string"
      )
        throw new Error("profile.image must be a URL string or null");
      if (
        !Array.isArray(value.profile.t2AccountNames) ||
        value.profile.t2AccountNames.some((name) => typeof name !== "string")
      )
        throw new Error("profile.t2AccountNames must be an array of names");
      if (value.profile.t2Profile !== null && !object(value.profile.t2Profile))
        throw new Error("profile.t2Profile must be an object or null");
      optionalNumber(value.demoCount, "demoCount");
      optionalNumber(value.clipCount, "clipCount");
      break;
    case "page":
      if (!PAGES.has(String(value.page)))
        throw new Error("Unknown preview page");
      break;
    default:
      throw new Error("kind must be map, demo, clip, server, profile, or page");
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      input: { type: "string" },
      "site-url": { type: "string" },
      serve: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`Usage: npm run previews:render -- [options]

  --out DIR       Output directory (default: system temp/mapgenius-previews)
  --input FILE    One LinkPreviewInput object or an array of them as JSON
  --site-url URL  Trusted application base URL, including any base path
  --serve         Open the generated files via HTTP on 127.0.0.1:${PREVIEW_PORT}
  --help          Show this help

With no input file, renders fixed example cards for every entity and index page.
Open the generated index.html to inspect them. Files are never uploaded.`);
    return;
  }

  let inputs: readonly LinkPreviewInput[] = linkPreviewFixtures;
  if (values.input) {
    const raw: unknown = JSON.parse(await readFile(values.input, "utf8"));
    const entries = Array.isArray(raw) ? raw : [raw];
    if (entries.length === 0)
      throw new Error("Input array must contain at least one preview");
    entries.forEach((entry, index) => {
      try {
        validateInput(entry);
      } catch (error) {
        throw new Error(`Preview ${index + 1}: ${(error as Error).message}`);
      }
    });
    inputs = entries;
  }

  const output = path.resolve(
    values.out ?? path.join(os.tmpdir(), "mapgenius-previews"),
  );
  const siteUrl = values["site-url"];
  const iconUrl = new URL(
    DEFAULT_LINK_PREVIEW_ICON,
    linkPreviewUrl({ kind: "page", page: "home" }, siteUrl),
  ).href;
  const iconFile = path.join(output, LOCAL_ICON_PATH);
  await mkdir(path.dirname(iconFile), { recursive: true });
  await copyFile(
    path.resolve(import.meta.dirname, "../public", DEFAULT_LINK_PREVIEW_ICON),
    iconFile,
  );
  const previews = inputs.map((input) =>
    generateLinkPreview(input, {
      siteUrl,
      missionDisplayName: linkPreviewMissionDisplayName,
      missionImage: linkPreviewMissionImage,
      previewIconSrc: (target) =>
        path.posix.relative(
          path.posix.dirname(linkPreviewObjectKey(target, "preview.html")),
          LOCAL_ICON_PATH,
        ),
    }),
  );

  const manifest: Array<{
    kind: string;
    title: string;
    url: string;
    files: Array<{ key: string; contentType: string; cacheControl: string }>;
  }> = [];
  const gallery: Array<{
    title: string;
    kind: string;
    href: string;
    head: string;
  }> = [];
  for (const preview of previews) {
    const artifacts = linkPreviewArtifacts(preview);
    for (const artifact of artifacts) {
      const filename = path.join(output, artifact.key);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, artifact.body);
    }
    const { metadata } = preview;
    manifest.push({
      kind: preview.target.kind,
      title: metadata.title,
      url: metadata.url,
      files: artifacts.map(({ key, contentType, cacheControl }) => ({
        key,
        contentType,
        cacheControl,
      })),
    });
    gallery.push({
      title: metadata.title,
      kind: preview.target.kind,
      href: artifacts.find((artifact) =>
        artifact.key.endsWith("/preview.html"),
      )!.key,
      head: artifacts.find((artifact) => artifact.key.endsWith("/head.html"))!
        .key,
    });
  }

  const html =
    "<!doctype html>" +
    renderToStaticMarkup(
      h(
        "html",
        { lang: "en" },
        h(
          "head",
          null,
          h("meta", { charSet: "utf-8" }),
          h("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1",
          }),
          h("title", null, "MapGenius link preview examples"),
          h(
            "style",
            null,
            `:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText;--border:#d4d7dc;--muted:#5c5e66;--link:#006ce7}@media(prefers-color-scheme:dark){:root{--border:#42454a;--muted:#b5bac1;--link:#00a8fc}}body{margin:0;padding:24px}main{max-width:1360px;margin:auto}h1{font-size:24px;margin:0 0 8px}p{color:var(--muted)}a{color:var(--link)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,580px),1fr));gap:24px;margin-top:24px}article{min-width:0;border:1px solid var(--border);border-radius:6px;overflow:hidden}header{padding:16px}header a{display:block;font-size:15px;font-weight:650}small{font-size:12px;color:var(--muted)}iframe{display:block;width:100%;height:640px;border:0}.meta{padding:12px 16px;border-top:1px solid var(--border);font-size:12px}`,
          ),
        ),
        h(
          "body",
          null,
          h(
            "main",
            null,
            h("h1", null, "MapGenius link previews"),
            h("a", { href: "edit.html" }, "Paste metadata HTML"),
            h(
              "p",
              null,
              "Switch between Discord, Slack, and Messages in each preview. Theme controls affect this simulation only; inspect head.html for the published metadata.",
            ),
            h(
              "div",
              { className: "grid" },
              gallery.map((item) =>
                h(
                  "article",
                  { key: item.href },
                  h(
                    "header",
                    null,
                    h("small", null, item.kind),
                    h("a", { href: item.href }, item.title),
                  ),
                  h("iframe", {
                    src: item.href,
                    title: item.title,
                    loading: "lazy",
                  }),
                  h(
                    "div",
                    { className: "meta" },
                    h("a", { href: item.head }, "Metadata snippet"),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  await writeFile(path.join(output, "index.html"), html);
  await writeEditor(output, previews[0], iconUrl);
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Rendered ${previews.length} previews to ${path.join(output, "index.html")}`,
  );
  if (values.serve) await servePreviews(output);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
