import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeMissionType } from "../src/missionType.js";
import { DEFAULT_TEAM_NAMES } from "../src/stringUtils.js";
import type { AccountPublicProfile } from "./accountTypes.js";
import type { ClipView } from "./clipTypes.js";
import {
  demoGameIndexAt,
  type DemoGame,
  type DemoMetadata,
} from "./demoMetadata.js";
import { linkPreviewUrl, type LinkPreviewTarget } from "./linkPreviewRoute.js";
import { linkPreviewSource } from "./linkPreviewRules.js";
import { LinkPreviewDocument } from "./linkPreviewDocument.js";
import type { ServerInfo } from "./types.js";

export interface LinkPreviewImage {
  /** Public HTTP(S) image, or a path relative to the configured site URL. */
  url: string;
  alt: string;
  /** Omit dimensions when they have not been measured. */
  width?: number;
  height?: number;
  type?: string;
}

type WithImage = { image?: LinkPreviewImage };

/** Public data only: no session, owner token, clip timeline, or private demo. */
export type LinkPreviewInput = WithImage &
  (
    | {
        kind: "map";
        missionName: string;
        missionType?: string;
        displayName?: string;
        description?: string;
      }
    | { kind: "demo"; demo: DemoMetadata; reference?: string }
    | {
        kind: "clip";
        clip: Pick<
          ClipView,
          | "id"
          | "title"
          | "sourceDemo"
          | "startSec"
          | "durationMs"
          | "creatorName"
          | "createdAt"
          | "state"
        >;
        demo?: DemoMetadata;
      }
    | {
        kind: "server";
        /** Preserve a name-based share selector even when lookup finds an address. */
        reference?: { address: string } | { name: string };
        server: Pick<ServerInfo, "name"> &
          Partial<
            Pick<
              ServerInfo,
              | "address"
              | "mapName"
              | "gameType"
              | "mod"
              | "playerCount"
              | "maxPlayers"
              | "botCount"
              | "tournament"
              | "passwordRequired"
            >
          >;
      }
    | {
        kind: "profile";
        profile: AccountPublicProfile;
        /** Number of public demo uploads by this player. */
        demoCount?: number;
        clipCount?: number;
      }
    | {
        kind: "page";
        page: Extract<LinkPreviewTarget, { kind: "page" }>["page"];
      }
  );

export interface LinkPreviewOptions {
  /** Trusted deployment configuration; never take the origin from a shared URL. */
  siteUrl?: string;
  defaultImage?: LinkPreviewImage;
  /** Supplied by a build/loader so rendering does not import the game manifest. */
  missionDisplayName?: (name: string) => string;
  /** Return known existing art. Crawlers cannot run the UI's image fallback. */
  missionImage?: (name: string) => LinkPreviewImage | undefined;
  /** URL of the icon used only when displaying the local preview document. */
  previewIconSrc?: (target: LinkPreviewTarget) => string;
}

export interface LinkPreviewMetadata {
  kind: LinkPreviewInput["kind"];
  siteName: string;
  title: string;
  description: string;
  url: string;
  type: "website" | "profile";
  twitterCard?: "summary" | "summary_large_image";
  image: LinkPreviewImage;
  /** Also used by the standalone authoring preview. */
  tags: string[];
  details: string[];
}

export interface GeneratedLinkPreview {
  target: LinkPreviewTarget;
  metadata: LinkPreviewMetadata;
  /** Only head elements, for injection into the app HTML. */
  headHtml: string;
  /** Complete, script-free page for local inspection; not the interactive app. */
  documentHtml: string;
}

export const DEFAULT_LINK_PREVIEW_ICON = "icon-512.png";

const PAGE_TITLES = {
  home: "MapGenius",
  maps: "Explore Tribes 2 maps",
  demos: "Tribes 2 demos",
  servers: "Live Tribes 2 servers",
  clips: "Recent Tribes 2 clips",
  replays: "Tribes 2 replays",
} satisfies Record<
  Extract<LinkPreviewTarget, { kind: "page" }>["page"],
  string
>;

function text(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(
  values: readonly (string | undefined | null | false)[],
): string[] {
  return values.flatMap((value) => (value && text(value) ? [text(value)] : []));
}

function shorten(value: string, length: number): string {
  const chars = Array.from(text(value));
  return chars.length <= length
    ? chars.join("")
    : `${chars
        .slice(0, length - 1)
        .join("")
        .trimEnd()}…`;
}

function publicUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Preview URLs must be public HTTP(S) URLs without credentials",
    );
  return url.href;
}

function normalizedImage(
  image: LinkPreviewImage,
  siteUrl: string,
): LinkPreviewImage {
  for (const dimension of [image.width, image.height]) {
    if (
      dimension !== undefined &&
      (!Number.isSafeInteger(dimension) || dimension <= 0)
    )
      throw new Error("Preview image dimensions must be positive integers");
  }
  return { ...image, url: publicUrl(image.url, siteUrl), alt: text(image.alt) };
}

function mapTitle(name: string, missionType?: string): string {
  const gameType = text(normalizeMissionType(missionType ?? ""));
  return gameType ? `${name} (${gameType})` : name;
}

function recordedDate(value: string | number): string | undefined {
  // Unknown retail wall times are deliberately displayed as dates, never
  // relabelled with the machine's timezone or relative labels such as "today".
  const source =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? `${value.slice(0, 10)}T12:00:00Z`
      : value;
  const date = new Date(source);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : undefined;
}

function duration(ms: number | undefined, clip = false): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  if (clip) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1m";
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;
}

function matchDetails(games: readonly DemoGame[]): string[] {
  return compact(
    games.flatMap((game) => {
      const teams = Object.entries(game.teamNames ?? {})
        .filter(([id]) => Number(id) > 0)
        .sort(([a], [b]) => Number(a) - Number(b));
      const namedMatch = teams.some(
        ([id, name]) => name !== DEFAULT_TEAM_NAMES[Number(id)],
      );
      return [
        game.title,
        namedMatch ? teams.map(([, name]) => name).join(" vs ") : undefined,
      ];
    }),
  );
}

/**
 * Synchronous, side-effect-free renderer for standard Open Graph + Twitter
 * Card tags. Resolve public data and image availability before calling it.
 * No Suspense or hydration is needed, so renderToStaticMarkup is sufficient.
 */
export function generateLinkPreview(
  input: LinkPreviewInput,
  options: LinkPreviewOptions = {},
): GeneratedLinkPreview {
  const siteUrl = linkPreviewUrl(
    { kind: "page", page: "home" },
    options.siteUrl,
  );
  const mapName = (name: string) =>
    text(options.missionDisplayName?.(name) || name);
  let target: LinkPreviewTarget;
  let title: string;
  let details: string[];
  let tags: string[];
  let mission: string | undefined;
  let description: string | undefined;
  let image = input.image;
  let avatarImage = false;

  switch (input.kind) {
    case "map": {
      target = {
        kind: "map",
        missionName: input.missionName,
        missionType: input.missionType,
      };
      mission = input.missionName;
      title = mapTitle(
        text(input.displayName) || mapName(mission),
        input.missionType,
      );
      tags = ["Explore map"];
      details = ["Explore Tribes 2 maps and more on MapGenius."];
      description = input.description || details[0];
      break;
    }
    case "demo": {
      const { demo } = input;
      target = { kind: "demo", demo: input.reference || demo.filename };
      mission = demo.games[0]?.mission;
      title =
        demo.games
          .map((game) => mapTitle(mapName(game.mission), game.gameType))
          .join(" → ") || "Tribes 2 demo";
      const recorder = text(demo.recorder);
      const date = recordedDate(demo.recordedAt);
      const attribution = recorder ? `${recorder}’s demo` : "Tribes 2 demo";
      description = date ? `${attribution} from ${date}.` : `${attribution}.`;
      tags = compact([
        "Demo",
        ...new Set(
          demo.games.map((game) => normalizeMissionType(game.gameType)),
        ),
        demo.games.some((game) => game.tournament) && "Tournament",
        demo.hasCommentary && "Commentary",
      ]);
      details = compact([
        ...matchDetails(demo.games),
        date,
        duration(demo.durationMs),
        `${demo.playerCount ?? demo.players.length} players`,
        recorder && `Recorded by ${recorder}`,
        demo.server,
      ]);
      break;
    }
    case "clip": {
      const { clip, demo } = input;
      target = { kind: "clip", clipId: clip.id, demo: clip.sourceDemo };
      const game =
        demo?.games[
          Math.max(0, demoGameIndexAt(demo.games, clip.startSec * 1000))
        ];
      mission = game?.mission;
      title = text(clip.title) || "Tribes 2 clip";
      const creator = text(clip.creatorName);
      const date = recordedDate(clip.createdAt);
      const attribution = creator ? `Clipped by ${creator}` : "Clipped";
      description = date
        ? `${attribution} on ${date}.`
        : creator
          ? `${attribution}.`
          : "Tribes 2 clip.";
      tags = compact([
        "Clip",
        game?.gameType && normalizeMissionType(game.gameType),
      ]);
      details = compact([
        mission && mapName(mission),
        ...matchDetails(game ? [game] : []),
        duration(clip.durationMs, true),
        creator && attribution,
        date,
        demo?.server,
        clip.state === "processing" && "Preparing clip",
        clip.state === "failed" && "Clip unavailable",
      ]);
      break;
    }
    case "server": {
      const { server } = input;
      if (!text(server.address) && !text(server.name))
        throw new Error("A server preview needs an address or name");
      target = {
        kind: "server",
        ...(input.reference ??
          (server.address
            ? { address: server.address }
            : { name: server.name })),
      };
      if (!text(target.address) && !text(target.name))
        throw new Error("A server preview reference needs an address or name");
      mission = server.mapName;
      title = text(server.name) || text(server.address) || "Tribes 2 server";
      const name = mission ? mapName(mission) : "";
      const gameType = server.gameType && normalizeMissionType(server.gameType);
      const players =
        server.playerCount !== undefined &&
        `${server.playerCount}${server.maxPlayers !== undefined ? `/${server.maxPlayers}` : ""} players`;
      const status = compact([
        name ? mapTitle(name, server.gameType) : gameType,
        players,
      ]).join(" – ");
      description = status ? `Watch live: ${status}` : "Watch live";
      tags = compact([
        "Live server",
        gameType,
        server.tournament && "Tournament",
        server.passwordRequired && "Password required",
      ]);
      details = compact([
        name,
        server.mod,
        players,
        server.botCount ? `${server.botCount} bots` : undefined,
        "Spectate this Tribes 2 server in MapGenius.",
      ]);
      break;
    }
    case "profile": {
      const { profile } = input;
      target = { kind: "profile", userId: profile.discordId };
      const name = text(profile.name) || text(profile.discordUsername);
      title = name || "Tribes 2 player";
      const clips =
        input.clipCount !== undefined &&
        `${input.clipCount} ${input.clipCount === 1 ? "clip" : "clips"}`;
      const uploads =
        input.demoCount !== undefined &&
        `${input.demoCount} ${input.demoCount === 1 ? "upload" : "uploads"}`;
      const profileDescription = name
        ? `${name}’s profile on MapGenius`
        : "Tribes 2 player profile on MapGenius";
      const activity = compact([clips, uploads]).join(", ");
      description = activity
        ? `${profileDescription} – ${activity}`
        : profileDescription;
      tags = ["Player profile"];
      details = compact([
        (profile.t2AccountNames.length &&
          `Plays as ${profile.t2AccountNames.join(", ")}`) ||
          undefined,
        clips,
        uploads,
        profile.t2Profile?.bestMap &&
          `Best map: ${mapName(profile.t2Profile.bestMap.mission)} (${profile.t2Profile.bestMap.score} points)`,
        "Tribes 2 demos and clips on MapGenius.",
      ]);
      if (text(profile.image)) {
        image = { url: text(profile.image), alt: `${title}'s avatar` };
        avatarImage = true;
      }
      break;
    }
    case "page": {
      target = { kind: "page", page: input.page };
      title = PAGE_TITLES[input.page];
      description =
        "Explore maps, watch demos, and spectate live on MapGenius.";
      tags = ["MapGenius"];
      details = [description];
      break;
    }
  }

  image ??= mission ? options.missionImage?.(mission) : undefined;
  image = normalizedImage(
    image ??
      options.defaultImage ?? {
        url: DEFAULT_LINK_PREVIEW_ICON,
        alt: "MapGenius",
        width: 512,
        height: 512,
        type: "image/png",
      },
    siteUrl,
  );
  const compactImage =
    avatarImage ||
    (image.width && image.height
      ? image.width / image.height < 1.5
      : input.kind === "profile" && !input.image);
  const metadata: LinkPreviewMetadata = {
    kind: input.kind,
    siteName: "MapGenius",
    title: shorten(title, 70),
    description: shorten(
      description || compact([...tags, ...details]).join(" · "),
      300,
    ),
    url: linkPreviewUrl(target, siteUrl),
    type: input.kind === "profile" ? "profile" : "website",
    // Discord defaults to a thumbnail. An explicit summary can hide it in Slack.
    twitterCard: compactImage ? undefined : "summary_large_image",
    image,
    tags,
    details,
  };
  const previewIconSrc = options.previewIconSrc?.(target);
  return {
    target,
    metadata,
    headHtml: renderToStaticMarkup(h(LinkPreviewHead, { metadata })),
    documentHtml:
      "<!doctype html>" +
      renderToStaticMarkup(
        h(LinkPreviewDocument, {
          metadata,
          head: h(LinkPreviewHead, { metadata }),
          localIcon: previewIconSrc
            ? {
                url: publicUrl(DEFAULT_LINK_PREVIEW_ICON, siteUrl),
                src: previewIconSrc,
              }
            : undefined,
        }),
      ),
  };
}

/** All strings are React text/attributes; user-authored text is never raw HTML. */
function LinkPreviewHead({ metadata: m }: { metadata: LinkPreviewMetadata }) {
  const { title, tags } = linkPreviewSource(m);
  return h(
    Fragment,
    null,
    h("title", null, title),
    h("link", { rel: "canonical", href: m.url }),
    ...tags.map(([key, content]) =>
      h("meta", {
        key,
        [key.startsWith("og:") ? "property" : "name"]: key,
        content,
      }),
    ),
  );
}
