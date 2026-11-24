import { createHash, randomUUID } from "node:crypto";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import type Database from "better-sqlite3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { isDiscordId, type AccountUser } from "./accountTypes.js";
import {
  closeRejectedRequest,
  handleAccountCors,
  json,
} from "./accountHttp.js";
import {
  readClipCreateRequest,
  readClipTake,
  trimClipTake,
  clipDurationMs,
  MAX_CLIP_BODY_BYTES,
  CLIPS_PAGE_SIZE,
  MAX_PUBLIC_CLIPS,
  type ClipPage,
  type ClipTake,
  type ClipView,
} from "./clipTypes.js";
import { DEMO_CHECKPOINT_VERSION } from "../src/stream/demoCheckpoints.js";
import type { DemoUploadConfig } from "./demoUpload.js";
import {
  clipCheckpointVersion,
  putClipCheckpoint,
  type prepareClipCheckpoint,
} from "./clipCheckpoint.js";
import { isMissingObject } from "./privateDemoStore.js";
import { demoLog as log } from "./logger.js";
import { demoGameIndexAt, readDemoGames } from "./demoMetadata.js";
import { normalizeMissionType } from "../src/missionType.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETRY_MS = 30_000;
const MAX_CLIPS = 100;
const MAX_PENDING = 3;
const SOURCE_UNAVAILABLE = "The clip source has changed or been removed";
const TITLE_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

interface ClipRow {
  id: string;
  ownerDiscordId: string;
  creatorName?: string | null;
  requestId: string;
  payloadHash: string;
  sourceDemo: string;
  sourceETag: string;
  sourceSha256: string;
  title: string;
  createdAt: number;
  startSec: number;
  endSec: number;
  durationMs: number | null;
  state: "receiving" | "processing" | "ready" | "failed" | "deleting";
  attempts: number;
  retryAt: number;
  checkpointVersion: number | null;
  error: string | null;
}

/** A published camera timeline can play while its optional checkpoint is repaired. */
const PLAYABLE_CLIP = `(state='ready' OR (state IN ('processing','failed')
  AND checkpointVersion IS NOT NULL AND error IS NOT '${SOURCE_UNAVAILABLE}'))`;

function canPlayClip(row: ClipRow): boolean {
  return (
    row.state === "ready" ||
    ((row.state === "processing" || row.state === "failed") &&
      row.checkpointVersion !== null &&
      row.error !== SOURCE_UNAVAILABLE)
  );
}

export interface ClipsOptions {
  database: Database.Database;
  config: DemoUploadConfig;
  assetRoot: string;
  trustedOrigins: readonly string[];
  getAccount(headers: IncomingHttpHeaders): Promise<AccountUser | null>;
  prepare: typeof prepareClipCheckpoint;
  client?: S3Client;
  now?: () => number;
}

class ClipError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Owned clip metadata and a durable queue; raw recordings remain in their existing namespace. */
export class Clips {
  private readonly options: ClipsOptions;
  private readonly db: Database.Database;
  private readonly client: S3Client;
  private readonly now: () => number;
  private closed = false;
  private timer?: ReturnType<typeof setInterval>;
  private pumping: Promise<void> | null = null;
  private active: AbortController | null = null;
  private activeId: string | null = null;
  private readonly receiving = new Map<string, Promise<void>>();
  private readonly requests = new Set<Promise<boolean>>();

  constructor(options: ClipsOptions) {
    this.options = options;
    this.db = options.database;
    this.now = options.now ?? Date.now;
    this.client =
      options.client ??
      new S3Client({
        region: "auto",
        endpoint: options.config.endpoint,
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        credentials: {
          accessKeyId: options.config.accessKeyId,
          secretAccessKey: options.config.secretAccessKey,
        },
      });
  }

  start(): void {
    if (this.timer || this.closed) return;
    this.db
      .prepare(
        "UPDATE clip SET retryAt = 0 WHERE state IN ('receiving','processing','deleting') OR (state='ready' AND durationMs IS NULL AND attempts<3)",
      )
      .run();
    this.kick();
    this.timer = setInterval(() => this.kick(), RETRY_MS);
    this.timer.unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.active?.abort(new Error("Clip processing stopped"));
    await Promise.allSettled([
      ...this.requests,
      ...this.receiving.values(),
      this.pumping,
    ]);
  }

  async idle(): Promise<void> {
    while (this.pumping) await this.pumping;
  }

  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const task = this.handleRequest(req, res);
    this.requests.add(task);
    void task.finally(() => this.requests.delete(task)).catch(() => {});
    return task;
  }

  sourceDeleted(sourceDemo: string): void {
    this.db
      .prepare(
        `UPDATE clip SET state='failed', error=? WHERE sourceDemo=?
         AND state IN ('receiving','processing','ready')`,
      )
      .run(SOURCE_UNAVAILABLE, sourceDemo);
  }

  private row(id: string): ClipRow | undefined {
    return this.db.prepare("SELECT * FROM clip WHERE id = ?").get(id) as
      ClipRow | undefined;
  }
  private visibleRow(id: string): ClipRow {
    const row = this.row(id);
    if (!row || row.state === "deleting")
      throw new ClipError(404, "Clip not found");
    return row;
  }
  private key(id: string, suffix: string) {
    return `${this.options.config.prefix}clips/${id}/${suffix}`;
  }
  private view(row: ClipRow, timeline?: ClipTake): ClipView {
    const playable = canPlayClip(row);
    return {
      id: row.id,
      title: row.title,
      sourceDemo: row.sourceDemo,
      startSec: row.startSec,
      ...(row.durationMs !== null && { durationMs: row.durationMs }),
      ownerDiscordId: row.ownerDiscordId,
      ...(row.creatorName && { creatorName: row.creatorName }),
      createdAt: row.createdAt,
      state: playable
        ? "ready"
        : row.state === "failed"
          ? "failed"
          : "processing",
      ...(!playable && row.error && { error: row.error }),
      ...(timeline && { timeline, sourceSha256: row.sourceSha256 }),
      checkpointUrl: `/api/clips/${row.id}/checkpoint`,
    };
  }
  private signal(parent?: AbortSignal) {
    const timeout = AbortSignal.timeout(30_000);
    return parent ? AbortSignal.any([parent, timeout]) : timeout;
  }
  private listPage(
    owner: string | null,
    pageNumber: number,
    manage: boolean,
    pageSize: number,
  ): ClipPage {
    const visible = manage ? "state!='deleting'" : PLAYABLE_CLIP;
    return this.db.transaction(() => {
      const counts =
        owner === null
          ? {
              total: this.db
                .prepare(`SELECT count(*) FROM clip WHERE ${PLAYABLE_CLIP}`)
                .pluck()
                .get() as number,
              pending: 0,
            }
          : (this.db
              .prepare(
                `SELECT coalesce(sum(${visible}),0) AS total,
            coalesce(sum((state IN ('receiving','processing') AND checkpointVersion IS NULL) OR
              (state='ready' AND durationMs IS NULL AND attempts<3)),0) AS pending
           FROM clip WHERE ownerDiscordId=?`,
              )
              .get(owner) as { total: number; pending: number });
      const page = Math.min(
        pageNumber,
        Math.max(1, Math.ceil(counts.total / pageSize)),
      );
      const where =
        owner === null ? visible : `ownerDiscordId=? AND ${visible}`;
      const creatorJoin =
        owner === null
          ? `LEFT JOIN (
                SELECT a.accountId, CASE WHEN count(*)=1 THEN min(u.name) END AS creatorName
                FROM account a JOIN user u ON a.userId=u.id
                WHERE a.providerId='discord'
                GROUP BY a.accountId
              ) creators ON creators.accountId=clip.ownerDiscordId`
          : "";
      const rows = this.db
        .prepare(
          `SELECT clip.*${creatorJoin && ", creators.creatorName"}
           FROM clip ${creatorJoin} WHERE ${where}
           ORDER BY clip.createdAt DESC,clip.id DESC LIMIT ? OFFSET ?`,
        )
        .all(
          ...(owner === null ? [] : [owner]),
          pageSize,
          (page - 1) * pageSize,
        ) as ClipRow[];
      return {
        clips: rows.map((row) => this.view(row)),
        ...counts,
        page,
        pageSize,
      };
    })();
  }
  private async head(key: string, signal?: AbortSignal) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.options.config.bucket, Key: key }),
      { abortSignal: this.signal(signal) },
    );
  }
  private async readAsset(key: string, signal?: AbortSignal) {
    const deadline = this.signal(signal);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.config.bucket, Key: key }),
      { abortSignal: deadline },
    );
    if (!response.Body) throw new Error("Clip asset has no body");
    const result = await response.Body.transformToString();
    deadline.throwIfAborted();
    return { text: result, etag: response.ETag, metadata: response.Metadata };
  }
  private async text(key: string, signal?: AbortSignal): Promise<string> {
    return (await this.readAsset(key, signal)).text;
  }
  private rebuildCheckpoint(id: string): void {
    this.db
      .prepare(
        "UPDATE clip SET state='processing', retryAt=0, attempts=0 WHERE id=? AND state='ready'",
      )
      .run(id);
    this.visibleRow(id);
    this.kick();
  }
  private async sourceCurrent(
    row: ClipRow,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const source = await this.head(
        `${this.options.config.prefix}${row.sourceDemo}`,
        signal,
      );
      if (!source.ETag || source.ETag !== row.sourceETag)
        throw new ClipError(410, SOURCE_UNAVAILABLE);
    } catch (error) {
      if (
        isMissingObject(error) ||
        (error instanceof ClipError && error.status === 410)
      ) {
        this.db
          .prepare(
            "UPDATE clip SET state='failed', error=? WHERE id=? AND state!='deleting'",
          )
          .run(SOURCE_UNAVAILABLE, row.id);
        throw new ClipError(410, SOURCE_UNAVAILABLE);
      }
      throw error;
    }
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://relay.invalid");
    if (
      url.pathname !== "/api/clips" &&
      !url.pathname.startsWith("/api/clips/")
    )
      return false;
    if (["POST", "DELETE"].includes(req.method ?? "") && !req.headers.origin) {
      closeRejectedRequest(req, res);
      json(res, 403, { error: "Origin is not allowed" });
      return true;
    }
    if (
      handleAccountCors(
        req,
        res,
        this.options.trustedOrigins,
        "GET, POST, DELETE, OPTIONS",
      )
    )
      return true;
    try {
      if (this.closed)
        throw new ClipError(503, "Clips are temporarily unavailable");
      const match = /^\/api\/clips\/([^/]+)(\/checkpoint)?$/.exec(url.pathname);
      if (req.method === "GET" && url.pathname === "/api/clips") {
        const owner = url.searchParams.get("owner");
        const requestedPage = url.searchParams.get("page") ?? "1";
        const requestedLimit = url.searchParams.get("limit");
        const manage = url.searchParams.get("manage") === "1";
        if ((owner !== null || manage) && !isDiscordId(owner))
          throw new ClipError(400, "A valid clip creator is required");
        if (!/^[1-9]\d*$/.test(requestedPage))
          throw new ClipError(400, "Invalid clip page");
        const pageNumber = Number(requestedPage);
        if (!Number.isSafeInteger(pageNumber) || pageNumber > 1_000_000)
          throw new ClipError(400, "Invalid clip page");
        const pageSize =
          requestedLimit === null ? CLIPS_PAGE_SIZE : Number(requestedLimit);
        if (
          requestedLimit !== null &&
          (owner !== null ||
            !/^[1-9]\d*$/.test(requestedLimit) ||
            pageSize > MAX_PUBLIC_CLIPS)
        )
          throw new ClipError(400, "Invalid public clip limit");
        if (manage) {
          const user = await this.options.getAccount(req.headers);
          if (user?.discordId !== owner)
            throw new ClipError(403, "Sign in to manage your own clips");
        }
        json(res, 200, this.listPage(owner, pageNumber, manage, pageSize));
      } else if (req.method === "GET" && match) {
        if (!UUID.test(match[1])) throw new ClipError(404, "Clip not found");
        let row = this.visibleRow(match[1]);
        await this.sourceCurrent(row);
        row = this.visibleRow(row.id);
        if (match[2]) {
          if (!canPlayClip(row))
            throw new ClipError(409, "The clip checkpoint is being prepared");
          if (row.state === "processing") {
            res.writeHead(204, { "Cache-Control": "no-store" }).end();
            return true;
          }
          try {
            const checkpoint = await this.readAsset(
              this.key(row.id, "checkpoint.json"),
            );
            await this.sourceCurrent(row);
            row = this.visibleRow(row.id);
            if (!canPlayClip(row))
              throw new ClipError(409, "The clip checkpoint is unavailable");
            if (row.state === "processing") {
              res.writeHead(204, { "Cache-Control": "no-store" }).end();
              return true;
            }
            const version = clipCheckpointVersion(
              checkpoint.metadata,
              row.sourceETag,
              row.startSec,
              row.sourceSha256,
            );
            if (version === undefined) {
              this.rebuildCheckpoint(row.id);
              res.writeHead(204, { "Cache-Control": "no-store" }).end();
              return true;
            }
            if (row.checkpointVersion !== version)
              this.db
                .prepare("UPDATE clip SET checkpointVersion=? WHERE id=?")
                .run(version, row.id);
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Expose-Headers": "ETag",
              ...(checkpoint.etag && { ETag: checkpoint.etag }),
            });
            res.end(checkpoint.text);
          } catch (error) {
            if (!isMissingObject(error)) throw error;
            this.rebuildCheckpoint(row.id);
            res.writeHead(204, { "Cache-Control": "no-store" }).end();
          }
        } else {
          let take: ClipTake | undefined;
          if (canPlayClip(row) && url.searchParams.get("summary") !== "1") {
            try {
              take = readClipTake(
                JSON.parse(await this.text(this.key(row.id, "timeline.json"))),
              );
              if (take.sourceDemo !== row.sourceDemo)
                throw new Error("Clip source mismatch");
              this.db
                .prepare(
                  "UPDATE clip SET durationMs=?, attempts=0, retryAt=0 WHERE id=? AND state='ready' AND durationMs IS NULL",
                )
                .run(clipDurationMs(take), row.id);
            } catch (error) {
              this.visibleRow(row.id);
              throw error;
            }
          }
          row = this.visibleRow(row.id);
          json(res, 200, this.view(row, canPlayClip(row) ? take : undefined));
        }
      } else if (req.method === "POST" && match?.[2]) {
        if (!UUID.test(match[1])) throw new ClipError(404, "Clip not found");
        const row = this.visibleRow(match[1]);
        // A viewer can report only the exact cached object it received. A
        // rebuilt object gets at most one attempt per format, even across restarts.
        if (
          row.state === "ready" &&
          url.searchParams.get("version") === String(DEMO_CHECKPOINT_VERSION) &&
          row.checkpointVersion === DEMO_CHECKPOINT_VERSION
        ) {
          const asset = await this.head(
            this.key(row.id, "checkpoint.json"),
          ).catch((error) => {
            if (!isMissingObject(error)) throw error;
            return null;
          });
          if (
            !asset ||
            (asset.ETag &&
              asset.ETag === url.searchParams.get("rejected") &&
              asset.Metadata?.["repaired-version"] !==
                String(DEMO_CHECKPOINT_VERSION))
          )
            this.rebuildCheckpoint(row.id);
        }
        res.writeHead(204);
        res.end();
      } else if (req.method === "POST" && url.pathname === "/api/clips") {
        const user = await this.options.getAccount(req.headers);
        if (!user) throw new ClipError(401, "Sign in to record clips");
        if (
          url.searchParams.has("owner") &&
          url.searchParams.get("owner") !== user.discordId
        )
          throw new ClipError(
            401,
            "Your signed-in account changed. Please try again.",
          );
        const body = await this.readBody(req);
        let request: ReturnType<typeof readClipCreateRequest>;
        try {
          request = readClipCreateRequest(body);
        } catch {
          throw new ClipError(400, "Invalid clip recording or trim range");
        }
        const take = trimClipTake(
          request.take,
          request.trimStartMs,
          request.trimEndMs,
        );
        const payload = JSON.stringify(take);
        const hash = createHash("sha256")
          .update(JSON.stringify({ sourceSha256: request.sourceSha256, take }))
          .digest("hex");
        let row = this.db
          .prepare("SELECT * FROM clip WHERE ownerDiscordId=? AND requestId=?")
          .get(user.discordId, request.requestId) as ClipRow | undefined;
        if (row && row.payloadHash !== hash)
          throw new ClipError(
            409,
            "This clip request was already used for another recording",
          );
        if (row?.state === "deleting")
          throw new ClipError(409, "This clip is being deleted");
        if (!row) {
          const source = await this.head(
            `${this.options.config.prefix}${take.sourceDemo}`,
          ).catch((error) => {
            if (isMissingObject(error))
              throw new ClipError(404, "Hosted demo not found");
            throw error;
          });
          if (!source.ETag)
            throw new ClipError(503, "Could not identify the source recording");
          const title = await this.titleFor(
            take.sourceDemo,
            take.samples[0].demoTimeSec,
          );
          row = this.db
            .transaction(() => {
              const prior = this.db
                .prepare(
                  "SELECT * FROM clip WHERE ownerDiscordId=? AND requestId=?",
                )
                .get(user.discordId, request.requestId) as ClipRow | undefined;
              if (prior) {
                if (prior.payloadHash !== hash)
                  throw new ClipError(
                    409,
                    "This clip request was already used",
                  );
                return prior;
              }
              const counts = this.db
                .prepare(
                  "SELECT count(*) AS total, sum(state IN ('receiving','processing')) AS pending FROM clip WHERE ownerDiscordId=?",
                )
                .get(user.discordId) as {
                total: number;
                pending: number | null;
              };
              if (
                counts.total >= MAX_CLIPS ||
                (counts.pending ?? 0) >= MAX_PENDING
              )
                throw new ClipError(
                  429,
                  "Clip storage or processing limit reached",
                );
              const id = randomUUID();
              const start = take.samples[0].demoTimeSec;
              const end = take.samples.at(-1)!.demoTimeSec;
              this.db
                .prepare(
                  "INSERT INTO clip (id,ownerDiscordId,requestId,payloadHash,sourceDemo,sourceETag,sourceSha256,title,createdAt,startSec,endSec,durationMs,state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'receiving')",
                )
                .run(
                  id,
                  user.discordId,
                  request.requestId,
                  hash,
                  take.sourceDemo,
                  source.ETag,
                  request.sourceSha256,
                  title,
                  this.now(),
                  start,
                  end,
                  clipDurationMs(take),
                );
              return this.row(id)!;
            })
            .immediate();
        }
        if (row.state === "receiving" || row.state === "failed") {
          const id = row.id;
          let upload = this.receiving.get(id);
          if (!upload) {
            this.db
              .transaction(() => {
                const current = this.row(id);
                if (
                  !current ||
                  !["receiving", "failed"].includes(current.state)
                )
                  throw new ClipError(
                    409,
                    "This clip changed. Please try again.",
                  );
                if (current.state === "failed") {
                  const pending = this.db
                    .prepare(
                      "SELECT count(*) FROM clip WHERE ownerDiscordId=? AND state IN ('receiving','processing')",
                    )
                    .pluck()
                    .get(user.discordId) as number;
                  if (pending >= MAX_PENDING)
                    throw new ClipError(429, "Clip processing limit reached");
                }
                this.db
                  .prepare(
                    "UPDATE clip SET state='receiving', error=NULL, attempts=0 WHERE id=?",
                  )
                  .run(id);
              })
              .immediate();
            upload = this.client
              .send(
                new PutObjectCommand({
                  Bucket: this.options.config.bucket,
                  Key: this.key(id, "timeline.json"),
                  Metadata: {
                    "demo-etag": row.sourceETag,
                    "demo-sha256": row.sourceSha256,
                  },
                  Body: payload,
                  ContentType: "application/json",
                  CacheControl: "no-store",
                }),
                { abortSignal: this.signal() },
              )
              .then(() => {
                this.db
                  .prepare(
                    "UPDATE clip SET state='processing', retryAt=0 WHERE id=? AND state='receiving'",
                  )
                  .run(id);
              })
              .finally(() => {
                this.receiving.delete(id);
                this.kick();
              });
            this.receiving.set(id, upload);
          }
          await upload;
        }
        this.kick();
        json(res, 202, this.view(this.visibleRow(row.id)));
      } else if (req.method === "DELETE" && match && !match[2]) {
        const user = await this.options.getAccount(req.headers);
        const row = UUID.test(match[1]) ? this.row(match[1]) : undefined;
        if (!user) throw new ClipError(401, "Sign in to manage clips");
        if (!row || row.ownerDiscordId !== user.discordId)
          throw new ClipError(404, "Clip not found");
        this.db
          .prepare("UPDATE clip SET state='deleting', retryAt=0 WHERE id=?")
          .run(row.id);
        if (this.activeId === row.id)
          this.active?.abort(new Error("Clip deleted"));
        this.kick();
        json(res, 202, { deleted: true });
      } else {
        res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
        throw new ClipError(405, "Method not allowed");
      }
    } catch (error) {
      closeRejectedRequest(req, res);
      json(res, error instanceof ClipError ? error.status : 503, {
        error:
          error instanceof ClipError
            ? error.message
            : "Clips are temporarily unavailable. Please try again.",
      });
      if (!(error instanceof ClipError))
        log.error({ err: error }, "Clip request failed");
    }
    return true;
  }

  private async titleFor(
    sourceDemo: string,
    startSec: number,
  ): Promise<string> {
    try {
      const metadata = JSON.parse(
        await this.text(
          `${this.options.config.prefix}${sourceDemo}.json`,
          AbortSignal.timeout(5_000),
        ),
      );
      if (metadata?.filename !== sourceDemo) return "Tribes 2 clip";
      const games = readDemoGames(metadata);
      const game = games[Math.max(0, demoGameIndexAt(games, startSec * 1000))];
      const mission = game?.mission.trim();
      const gameType = normalizeMissionType(game?.gameType ?? "").trim();
      const title = mission
        ? `Clip of ${mission}${gameType ? ` ${gameType}` : ""}`
        : "Tribes 2 clip";
      const date =
        typeof metadata.recordedAt === "string"
          ? Date.parse(metadata.recordedAt)
          : NaN;
      return Number.isFinite(date)
        ? `${title} from ${TITLE_DATE.format(date)}`
        : title;
    } catch (error) {
      if (!isMissingObject(error))
        log.warn(
          { err: error, sourceDemo },
          "Could not read clip title metadata",
        );
      return "Tribes 2 clip";
    }
  }
  private async readBody(req: IncomingMessage): Promise<unknown> {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new ClipError(415, "Send a JSON clip recording");
    if (Number(req.headers["content-length"]) > MAX_CLIP_BODY_BYTES)
      throw new ClipError(413, "Clip recording is too large");
    const chunks: Buffer[] = [];
    let size = 0;
    req.setTimeout(30_000, () => req.destroy());
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_CLIP_BODY_BYTES)
          throw new ClipError(413, "Clip recording is too large");
        chunks.push(Buffer.from(chunk));
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ClipError(400, "Invalid clip JSON");
      }
    } finally {
      req.setTimeout(0);
    }
  }
  private kick(): void {
    if (this.closed || this.pumping) return;
    this.pumping = this.pump().finally(() => {
      this.pumping = null;
      if (!this.closed && this.nextJob()) this.kick();
    });
  }
  private nextJob(): ClipRow | undefined {
    const receiving = [...this.receiving.keys()];
    const exclude = receiving.length
      ? `AND id NOT IN (${receiving.map(() => "?").join(",")})`
      : "";
    return this.db
      .prepare(
        `SELECT * FROM clip WHERE (state IN ('receiving','processing','deleting') OR
           (state='ready' AND durationMs IS NULL AND attempts<3))
         AND retryAt<=? ${exclude}
         ORDER BY state='ready',createdAt,id LIMIT 1`,
      )
      .get(this.now(), ...receiving) as ClipRow | undefined;
  }
  private async pump(): Promise<void> {
    while (!this.closed) {
      const row = this.nextJob();
      if (!row) return;
      const controller = new AbortController();
      this.active = controller;
      this.activeId = row.id;
      try {
        if (row.state === "deleting") {
          await Promise.all(
            ["timeline.json", "checkpoint.json"].map((suffix) =>
              this.client.send(
                new DeleteObjectCommand({
                  Bucket: this.options.config.bucket,
                  Key: this.key(row.id, suffix),
                }),
                {
                  abortSignal: this.signal(controller.signal),
                },
              ),
            ),
          );
          this.db
            .prepare("DELETE FROM clip WHERE id=? AND state='deleting'")
            .run(row.id);
          continue;
        }
        if (row.state !== "ready")
          this.db
            .prepare(
              "UPDATE clip SET state='processing' WHERE id=? AND state IN ('receiving','processing')",
            )
            .run(row.id);
        const take = readClipTake(
          JSON.parse(
            await this.text(
              this.key(row.id, "timeline.json"),
              controller.signal,
            ),
          ),
        );
        if (take.sourceDemo !== row.sourceDemo)
          throw new Error("Clip source mismatch");
        if (row.state === "ready") {
          controller.signal.throwIfAborted();
          this.db
            .prepare(
              "UPDATE clip SET durationMs=?, attempts=0, retryAt=0 WHERE id=? AND state='ready' AND durationMs IS NULL",
            )
            .run(clipDurationMs(take), row.id);
          continue;
        }
        const result = await this.options.prepare({
          config: this.options.config,
          sourceDemo: row.sourceDemo,
          sourceETag: row.sourceETag,
          startSec: row.startSec,
          endSec: row.endSec,
          assetRoot: this.options.assetRoot,
          signal: controller.signal,
          client: this.client,
        });
        if (result.sourceSha256 !== row.sourceSha256)
          throw new Error(
            "The clip was recorded from a different source version",
          );
        controller.signal.throwIfAborted();
        await putClipCheckpoint(
          this.client,
          this.options.config,
          this.key(row.id, "checkpoint.json"),
          result,
          row.sourceETag,
          row.startSec,
          {
            signal: this.signal(controller.signal),
            repaired: row.checkpointVersion === DEMO_CHECKPOINT_VERSION,
          },
        );
        controller.signal.throwIfAborted();
        await this.sourceCurrent(row, controller.signal);
        controller.signal.throwIfAborted();
        this.db
          .prepare(
            "UPDATE clip SET state='ready', error=NULL, checkpointVersion=?, durationMs=?, attempts=0 WHERE id=? AND state='processing'",
          )
          .run(DEMO_CHECKPOINT_VERSION, clipDurationMs(take), row.id);
      } catch (error) {
        if (!controller.signal.aborted) {
          const attempts = row.attempts + 1;
          if (row.state === "ready") {
            this.db
              .prepare(
                "UPDATE clip SET attempts=?, retryAt=? WHERE id=? AND state='ready' AND durationMs IS NULL",
              )
              .run(attempts, this.now() + RETRY_MS, row.id);
            log.warn(
              { err: error, clipId: row.id, attempts },
              "Could not recover clip duration",
            );
            continue;
          }
          const failed = attempts >= 3 && row.state !== "deleting";
          this.db
            .prepare(
              "UPDATE clip SET state=?, attempts=?, retryAt=?, error=? WHERE id=? AND state IN ('receiving','processing','deleting')",
            )
            .run(
              failed
                ? "failed"
                : row.state === "deleting"
                  ? "deleting"
                  : "processing",
              attempts,
              this.now() + RETRY_MS,
              failed
                ? "Could not prepare this clip. Its source may have changed or been removed."
                : null,
              row.id,
            );
          log.warn(
            { err: error, clipId: row.id },
            "Clip preparation failed; pending work will retry",
          );
        }
      } finally {
        this.active = null;
        this.activeId = null;
      }
    }
  }
}
