import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  linkPreviewMissionDisplayName,
  linkPreviewMissionImage,
} from "../scripts/lib/linkPreviewAssets.js";
import { isDiscordId, type AccountPublicProfile } from "./accountTypes.js";
import type { ClipView } from "./clipTypes.js";
import { isPublishedDemoKey } from "./demoKeys.js";
import type { DemoMetadata } from "./demoMetadata.js";
import { generateLinkPreview } from "./linkPreview.js";
import {
  linkPreviewUrl,
  resolveLinkPreviewTarget,
  type LinkPreviewTarget,
} from "./linkPreviewRoute.js";
import { relayLog } from "./logger.js";
import { normalizeAddress } from "./shared.js";
import type { ServerInfo } from "./types.js";

export const SERVER_LINK_PREVIEW_TTL_MS = 2 * 60_000;
const PROFILE_TTL_MS = 5 * 60_000;
const MAX_CACHED_PROFILES = 1_024;
const RECORDING_PREVIEW_TTL_MS = 30_000;
const RECORDING_PREVIEW_TIMEOUT_MS = 3_000;
const MAX_CACHED_RECORDINGS = 1_024;
const MAX_PENDING_RECORDINGS = 32;
const PATH = "/api/link-preview";

interface ProfilePreviewData {
  profile: AccountPublicProfile;
  demoCount?: number;
  clipCount?: number;
}

interface LinkPreviewHttpOptions {
  siteUrl?: string;
  secret: string;
  listServers: () => Promise<readonly ServerInfo[]>;
  readProfile: (id: string) => ProfilePreviewData | null;
  readDemo(
    key: string,
    signal: AbortSignal,
    options?: { sourceVerified: boolean },
  ): Promise<DemoMetadata | undefined>;
  readClip(id: string, signal: AbortSignal): Promise<ClipView | undefined>;
}

type RecordingTarget = Extract<LinkPreviewTarget, { kind: "demo" | "clip" }>;

/** Resolve public snippets from a fixed site URL and authenticated Pages traffic. */
export function createLinkPreviewHttpHandler(options: LinkPreviewHttpOptions) {
  const siteUrl = new URL(
    linkPreviewUrl({ kind: "page", page: "home" }, options.siteUrl),
  );
  const authorization = Buffer.from(`Bearer ${options.secret}`);
  const profileCache = new Map<string, { head: string; expiresAt: number }>();
  const recordingCache = new Map<string, { head: string; expiresAt: number }>();
  const pendingRecordings = new Map<string, Promise<string | undefined>>();
  const rendering = {
    siteUrl: siteUrl.href,
    missionDisplayName: linkPreviewMissionDisplayName,
    missionImage: linkPreviewMissionImage,
  };

  async function loadRecording(
    target: RecordingTarget,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    if (target.kind === "demo") {
      const demo = await options.readDemo(target.demo, signal);
      if (!demo) return undefined;
      return generateLinkPreview(
        { kind: "demo", demo, reference: target.demo },
        rendering,
      ).headHtml;
    }
    const clip = await options.readClip(target.clipId, signal);
    if (!clip || clip.state !== "ready") return undefined;
    signal.throwIfAborted();
    const demo = await options.readDemo(clip.sourceDemo, signal, {
      sourceVerified: true,
    });
    return generateLinkPreview({ kind: "clip", clip, demo }, rendering)
      .headHtml;
  }

  async function renderRecording(target: RecordingTarget) {
    if (target.kind === "demo" && !isPublishedDemoKey(target.demo))
      return undefined;
    const key =
      target.kind === "demo" ? `demo:${target.demo}` : `clip:${target.clipId}`;
    const cached = recordingCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.head;
    recordingCache.delete(key);
    const previous = pendingRecordings.get(key);
    if (previous) return previous;
    if (pendingRecordings.size >= MAX_PENDING_RECORDINGS)
      throw new Error("Recording link preview capacity reached");

    // Let shared requests finish independently of an individual client while
    // bounding the time spent on a cold recording lookup.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("Recording link preview timed out");
        controller.abort(error);
        reject(error);
      }, RECORDING_PREVIEW_TIMEOUT_MS).unref();
    });
    const pending = Promise.race([
      loadRecording(target, controller.signal),
      deadline,
    ])
      .then((head) => {
        if (head === undefined) return undefined;
        if (recordingCache.size >= MAX_CACHED_RECORDINGS) {
          const oldest = recordingCache.keys().next().value;
          if (oldest !== undefined) recordingCache.delete(oldest);
        }
        recordingCache.set(key, {
          head,
          expiresAt: Date.now() + RECORDING_PREVIEW_TTL_MS,
        });
        return head;
      })
      .finally(() => {
        clearTimeout(timer);
        pendingRecordings.delete(key);
      });
    pendingRecordings.set(key, pending);
    return pending;
  }

  async function render(
    target: LinkPreviewTarget,
  ): Promise<string | undefined> {
    switch (target.kind) {
      case "demo":
      case "clip":
        return renderRecording(target);
      case "server": {
        const reference = target.address
          ? { address: target.address }
          : { name: target.name ?? "" };
        const servers = await options.listServers();
        const server = servers.find((candidate) =>
          "address" in reference
            ? normalizeAddress(candidate.address) === reference.address
            : candidate.name === reference.name,
        );
        if (!server) return undefined;
        return generateLinkPreview(
          { kind: "server", server, reference },
          rendering,
        ).headHtml;
      }
      case "profile": {
        const { userId } = target;
        if (!isDiscordId(userId)) return undefined;
        const now = Date.now();
        const current = profileCache.get(userId);
        if (current && current.expiresAt > now) return current.head;
        profileCache.delete(userId);
        const profile = options.readProfile(userId);
        if (!profile) return undefined;
        const { headHtml } = generateLinkPreview(
          { kind: "profile", ...profile },
          rendering,
        );
        if (profileCache.size >= MAX_CACHED_PROFILES) {
          const oldest = profileCache.keys().next().value;
          if (oldest !== undefined) profileCache.delete(oldest);
        }
        profileCache.set(userId, {
          head: headHtml,
          expiresAt: now + PROFILE_TTL_MS,
        });
        return headHtml;
      }
      case "map":
      case "page":
        return undefined;
    }
  }

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const request = URL.parse(req.url ?? "/", "http://localhost");
    if (request?.pathname !== PATH) return false;

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const provided = Buffer.from(req.headers.authorization ?? "");
    if (
      !options.secret ||
      provided.length !== authorization.length ||
      !timingSafeEqual(provided, authorization)
    ) {
      res.writeHead(404).end();
      return true;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end();
      return true;
    }

    const page = URL.parse(request.searchParams.get("url") ?? "");
    const target =
      page?.origin === siteUrl.origin && !page.username && !page.password
        ? resolveLinkPreviewTarget(page, siteUrl.pathname)
        : null;
    if (!target) {
      res.writeHead(404).end();
      return true;
    }

    try {
      const head = await render(target);
      if (res.destroyed) return true;
      if (head === undefined) res.writeHead(404).end();
      else
        res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(head);
    } catch (error) {
      relayLog.warn(
        { err: error, kind: target.kind },
        "Link preview unavailable",
      );
      if (!res.destroyed) res.writeHead(503).end();
    }
    return true;
  };
}
