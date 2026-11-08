/**
 * Uploads finalized demo files to Cloudflare R2 (S3 API) along with
 * their metadata sidecars, and appends each record to the bucket's
 * `index.json` (the browse listing — one fetch, full metadata). Sweeps
 * the demo dir for leftovers: cold `.rec.partial` spools are crashed
 * recordings and are salvaged into demos (demoSalvage.ts); `.rec`
 * files are complete and get (re-)enqueued for upload; spools salvage
 * couldn't read (`.partial.failed`) are parked in the bucket under
 * `failed/` rather than left on the volume.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { DEMO_CHECKPOINT_SUFFIX } from "../src/stream/demoCheckpoints";
import { demoLog as log } from "./logger.js";
import { type DemoMetadata, withGamePresentation } from "./demoMetadata.js";
import {
  GamePresentationError,
  isPublishedDemoFilename,
  readGamePresentation,
  readGamePresentationUpdate,
  readPublishedGame,
  type DemoGameTarget,
  type GamePresentation,
  type PublishedGame,
} from "./gamePresentation.js";
import {
  publishedDemoRecord,
  sameDemoGame,
  targetDemoGame,
} from "./publishedDemoPresentation.js";

import { atomicWrite } from "./atomicWrite.js";
import { updateDemoIndex } from "./demoIndexStorage.js";
import { UPLOAD_PART_BYTES, fileEtags, unquoteEtag } from "./objectEtag.js";
import {
  FAILED_SUFFIX,
  PARTIAL_SUFFIX,
  salvagePartialDemo,
} from "./demoSalvage.js";

/** Bucket sub-prefix for spools salvage gave up on. */
const FAILED_PREFIX = "failed/";

/** A .partial nobody owns and with no writes for this long belongs to a
 *  crashed recording. Live spools are excluded by `isLive` first; this
 *  mtime guard only covers spools of another process (a predecessor
 *  draining during a dev --watch restart), which DemoFileWriter
 *  sync-flushes every few seconds. */
const STALE_PARTIAL_MS = 5 * 60_000;
/** Synced metadata is only a local cache; R2 remains editable without an age limit. */
export const PUBLISHED_DEMO_SIDECAR_CACHE_MS = 24 * 60 * 60_000;

interface PublishedDemoEdit {
  version: 1;
  expectedETag: string | null;
  target: DemoGameTarget;
  game: PublishedGame;
  record: DemoMetadata;
}

export interface DemoUploaderOptions {
  /** Whether a `.partial` belongs to a recorder still in progress. */
  isLive?: (filePath: string) => boolean;
  /** Keep gate for salvaged crash spools (the recorder's minLengthMs). */
  salvageMinLengthMs?: number;
  /** Prepare and upload a seek sidecar before the demo is advertised. */
  publishCheckpoints?: (filePath: string, key: string) => Promise<unknown>;
}

export interface DemoUploadConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

/** Null when any required DEMO_R2_* var is missing (uploads disabled —
 *  demos stay on the volume). */
export function loadUploadConfig(
  env: NodeJS.ProcessEnv = process.env,
): DemoUploadConfig | null {
  const endpoint = env.DEMO_R2_ENDPOINT;
  const bucket = env.DEMO_R2_BUCKET;
  const accessKeyId = env.DEMO_R2_ACCESS_KEY_ID;
  const secretAccessKey = env.DEMO_R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: env.DEMO_R2_PREFIX ?? "demos/",
  };
}

export interface DemoUploadStats {
  enabled: boolean;
  /** Files waiting in the in-memory queue (excludes the one in flight). */
  queued: number;
  /** Basename currently uploading, or null. */
  uploading: string | null;
  /** Lifetime counters since relay start. */
  uploaded: number;
  failed: number;
  lastUploaded: { key: string; at: string } | null;
  lastError: { file: string; message: string; at: string } | null;
}

export class DemoUploader {
  private config: DemoUploadConfig | null;
  private client: S3Client | null;
  private dir: string;
  private queue: string[] = [];
  private queued = new Set<string>();
  private pumping = false;
  private current: string | null = null;
  private uploadedCount = 0;
  private failedCount = 0;
  private lastUploaded: { key: string; at: string } | null = null;
  private lastError: { file: string; message: string; at: string } | null =
    null;
  private isLive: (filePath: string) => boolean;
  private salvageMinLengthMs: number;
  private publishCheckpoints?: DemoUploaderOptions["publishCheckpoints"];
  private operationQueues: Record<"local" | "remote", Promise<unknown>> = {
    local: Promise.resolve(),
    remote: Promise.resolve(),
  };
  private presentationFiles = new Set<string>();
  private publishedPresentations = new Map<string, string>();
  private metadataOperations = new Map<string, Promise<unknown>>();
  private pendingEdits = new Set<string>();

  constructor(
    config: DemoUploadConfig | null,
    dir: string,
    options: DemoUploaderOptions = {},
  ) {
    this.config = config;
    this.dir = dir;
    this.isLive = options.isLive ?? (() => false);
    this.salvageMinLengthMs = options.salvageMinLengthMs ?? 0;
    this.publishCheckpoints = options.publishCheckpoints;
    this.client = config
      ? new S3Client({
          region: "auto",
          endpoint: config.endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  getStats(): DemoUploadStats {
    return {
      enabled: this.enabled,
      queued: this.queue.length,
      uploading: this.current,
      uploaded: this.uploadedCount,
      failed: this.failedCount,
      lastUploaded: this.lastUploaded,
      lastError: this.lastError,
    };
  }

  enqueue(filePath: string): void {
    if (!this.client) return;
    if (this.queued.has(filePath)) return;
    this.queued.add(filePath);
    this.queue.push(filePath);
    log.info(
      { file: path.basename(filePath), queued: this.queue.length },
      "Demo queued for upload",
    );
    void this.pump();
  }

  /** One upload at a time (1 GB shared-CPU VM). Failures keep the local
   *  file; the retry sweep re-enqueues it. */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const filePath = this.queue.shift()!;
        const basename = path.basename(filePath);
        this.current = basename;
        try {
          const key = await this.serialize("remote", async () => {
            const key = await this.uploadOne(filePath);
            await fsp.unlink(filePath);
            // Edited metadata stays as the durable source for later saves/retries.
            const metadata = await this.readSidecar(`${filePath}.json`);
            if (!metadata?.games?.some((game) => game.gameId))
              await fsp.unlink(`${filePath}.json`).catch(() => {});
            await fsp
              .unlink(`${filePath}${DEMO_CHECKPOINT_SUFFIX}`)
              .catch(() => {});
            await fsp
              .unlink(`${filePath}${DEMO_CHECKPOINT_SUFFIX}.tmp`)
              .catch(() => {});
            return key;
          });
          this.uploadedCount++;
          this.lastUploaded = { key, at: new Date().toISOString() };
          log.info({ file: basename, key }, "Demo uploaded");
        } catch (err) {
          this.failedCount++;
          this.lastError = {
            file: basename,
            // AWS SDK error names (NoSuchBucket, SignatureDoesNotMatch,
            // InvalidAccessKeyId…) are the most diagnostic part.
            message:
              err instanceof Error
                ? `${err.name}: ${err.message}`
                : String(err),
            at: new Date().toISOString(),
          };
          log.error(
            { err, file: basename },
            "Demo upload failed — kept locally for retry",
          );
        } finally {
          this.current = null;
          this.queued.delete(filePath);
        }
      }
      await this.retryGamePresentations();
    } finally {
      this.pumping = false;
      // A save can keep the tail flush busy while another demo is enqueued.
      if (this.queue.length > 0) void this.pump();
    }
  }

  /** Local commits stay responsive while the separate remote queue uploads demos. */
  private serialize<T>(
    queue: "local" | "remote",
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = this.operationQueues[queue].then(operation);
    this.operationQueues[queue] = result.catch(() => {});
    return result;
  }

  /** Metadata for different demos need not wait for another demo's large upload. */
  private serializeMetadata<T>(
    filePath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = path.resolve(filePath);
    const previous = this.metadataOperations.get(key) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(operation);
    this.metadataOperations.set(key, result);
    const clear = () => {
      if (this.metadataOperations.get(key) === result)
        this.metadataOperations.delete(key);
    };
    void result.then(clear, clear);
    return result;
  }

  /** Read canonical published metadata, independently of live sessions or local caches. */
  async readPublishedDemo(filename: string): Promise<DemoMetadata> {
    if (!this.client)
      throw new GamePresentationError(
        503,
        "Published demo storage is unavailable",
      );
    if (!isPublishedDemoFilename(filename))
      throw new GamePresentationError(404, "Published demo not found");
    const remote = await this.readRemoteSidecar(filename);
    return publishedDemoRecord(
      remote?.record ?? (await this.readIndexedDemo(filename)),
      filename,
    );
  }

  /** Historical edits keep their original comparison through retries and crashes. */
  async savePublishedGamePresentation(
    target: DemoGameTarget,
    expectedRevision: number,
    presentation: GamePresentation,
  ): Promise<PublishedGame> {
    if (!this.client)
      throw new GamePresentationError(
        503,
        "Published demo storage is unavailable",
      );
    if (!isPublishedDemoFilename(target.filename))
      throw new GamePresentationError(404, "Published demo not found");
    const filePath = path.join(this.dir, target.filename);
    try {
      return await this.serializeMetadata(filePath, async () => {
        // Never replace an unresolved conditional intent with a new request.
        await this.recoverPublishedEdit(filePath);
        const remote = await this.readRemoteSidecar(target.filename);
        const record = publishedDemoRecord(
          remote?.record ?? (await this.readIndexedDemo(target.filename)),
          target.filename,
          true,
        );
        const previous = targetDemoGame(record, target);
        if (
          (previous.presentationRevision ?? 0) !== expectedRevision ||
          !Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 0 ||
          expectedRevision === Number.MAX_SAFE_INTEGER
        )
          throw new GamePresentationError(
            409,
            "Game details changed. Close and reopen the editor.",
          );
        const local = await this.readSidecar(`${filePath}.json`);
        const pending = (Array.isArray(local?.games) ? local.games : []).find(
          (game) =>
            (previous.gameId && game.gameId === previous.gameId) ||
            (!game.gameId && sameDemoGame(game, previous)),
        );
        if (pending && (pending.presentationRevision ?? 0) > expectedRevision)
          throw new GamePresentationError(
            409,
            "Saved game details are still being published. Please try again shortly.",
          );
        const game: PublishedGame = {
          id: previous.gameId ?? randomUUID(),
          revision: expectedRevision + 1,
          presentation,
        };
        const edit: PublishedDemoEdit = {
          version: 1,
          expectedETag: remote?.etag ?? null,
          target,
          game,
          record: {
            ...record,
            games: record.games.map((entry, index) =>
              index === target.gameIndex
                ? withGamePresentation(entry, game)
                : entry,
            ),
          },
        };
        await this.serialize("local", async () => {
          await fsp.mkdir(this.dir, { recursive: true });
          atomicWrite(`${filePath}.json.edit`, JSON.stringify(edit));
          this.pendingEdits.add(filePath);
        });
        return this.commitPublishedEdit(filePath, edit, false);
      });
    } finally {
      if (this.pendingEdits.has(filePath)) void this.retryGamePresentations();
    }
  }

  private async recoverPublishedEdit(
    filePath: string,
    requireIndex = true,
  ): Promise<PublishedGame | null> {
    let raw: string;
    try {
      raw = await fsp.readFile(`${filePath}.json.edit`, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.pendingEdits.delete(filePath);
        return null;
      }
      throw error;
    }
    const value = JSON.parse(raw) as Partial<PublishedDemoEdit>;
    const game = readPublishedGame(value.game);
    const update =
      game &&
      readGamePresentationUpdate({
        demo: value.target,
        expectedRevision: game.revision - 1,
        presentation: game.presentation,
      });
    const filename = path.basename(filePath);
    if (
      value.version !== 1 ||
      !game ||
      !update ||
      !("demo" in update) ||
      update.demo.filename !== filename ||
      (value.expectedETag !== null &&
        (typeof value.expectedETag !== "string" ||
          !value.expectedETag ||
          value.expectedETag.length > 1024 ||
          /[\r\n]/.test(value.expectedETag)))
    )
      throw new Error(`Invalid pending demo metadata edit: ${filename}`);
    const record = publishedDemoRecord(value.record, filename, true);
    const selected = targetDemoGame(record, {
      ...update.demo,
      gameId: game.id,
    });
    if (
      selected.presentationRevision !== game.revision ||
      JSON.stringify(
        readGamePresentation({
          title: selected.title,
          teamNames: selected.teamNames,
        }),
      ) !== JSON.stringify(game.presentation)
    )
      throw new Error(`Invalid pending demo metadata edit: ${filename}`);
    this.pendingEdits.add(filePath);
    return this.commitPublishedEdit(
      filePath,
      {
        version: 1,
        expectedETag: value.expectedETag,
        target: update.demo,
        game,
        record,
      },
      requireIndex,
    );
  }

  /** A comparison failure can only be retried as the exact original comparison. */
  private async commitPublishedEdit(
    filePath: string,
    edit: PublishedDemoEdit,
    requireIndex: boolean,
  ): Promise<PublishedGame> {
    let accepted = edit.record;
    try {
      if (edit.expectedETag === null)
        await this.readIndexedDemo(edit.target.filename);
      await this.client!.send(
        new PutObjectCommand({
          Bucket: this.config!.bucket,
          Key: `${this.config!.prefix}${edit.target.filename}.json`,
          Body: JSON.stringify(edit.record, null, 2),
          ContentType: "application/json; charset=utf-8",
          CacheControl: "no-cache",
          ...(edit.expectedETag === null
            ? { IfNoneMatch: "*" }
            : { IfMatch: edit.expectedETag }),
        }),
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "PreconditionFailed")
        throw error;
      const remote = await this.readRemoteSidecar(edit.target.filename);
      const matchesById = remote?.record.games?.filter(
        (game) => game.gameId === edit.game.id,
      );
      const committed = matchesById?.length === 1 ? matchesById[0] : undefined;
      const matches =
        committed?.presentationRevision === edit.game.revision &&
        JSON.stringify(
          readGamePresentation({
            title: committed.title,
            teamNames: committed.teamNames,
          }),
        ) === JSON.stringify(edit.game.presentation);
      if (!remote || !matches) {
        // Even if this unlink fails, the surviving intent keeps its old ETag;
        // a restart cannot turn a rejected save into an unconditional overwrite.
        await this.serialize("local", async () => {
          await fsp
            .unlink(`${filePath}.json.edit`)
            .catch((error: NodeJS.ErrnoException) => {
              if (error.code !== "ENOENT") throw error;
            });
          this.pendingEdits.delete(filePath);
        });
        throw new GamePresentationError(
          409,
          "Game details changed. Close and reopen the editor.",
        );
      }
      accepted = publishedDemoRecord(remote.record, edit.target.filename, true);
    }
    // Only an accepted (or proved-already-accepted) snapshot enters ordinary retry.
    await this.serialize("local", async () => {
      await this.writeLocalSidecar(filePath, accepted);
      this.presentationFiles.add(filePath);
    });
    try {
      if (!(await this.updateIndex(accepted, true, new Set([edit.game.id])))) {
        if (requireIndex)
          throw new GamePresentationError(
            404,
            "The published demo is no longer in the index",
          );
        return edit.game;
      }
      await this.serialize("local", async () => {
        const recording = await fsp.stat(filePath).then(
          () => true,
          (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return false;
            throw error;
          },
        );
        if (!recording) {
          // History is authoritative in R2. Remove the cache before its intent,
          // so a crash cannot replay unselected games from a full old snapshot.
          await fsp
            .unlink(`${filePath}.json`)
            .catch((error: NodeJS.ErrnoException) => {
              if (error.code !== "ENOENT") throw error;
            });
          this.presentationFiles.delete(filePath);
          this.publishedPresentations.delete(filePath);
        } else
          this.publishedPresentations.set(
            filePath,
            this.presentationSignature(accepted),
          );
        await fsp
          .unlink(`${filePath}.json.edit`)
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        this.pendingEdits.delete(filePath);
      });
    } catch (error) {
      if (requireIndex) throw error;
      log.error(
        { error, filename: edit.target.filename },
        "Saved demo index update remains queued for retry",
      );
    }
    return edit.game;
  }

  /** Commit an edit to the actual sidecar before acknowledging the live update. */
  async saveGamePresentation(
    filePath: string,
    game: PublishedGame,
  ): Promise<void> {
    await this.serializeMetadata(filePath, async () => {
      await this.recoverPublishedEdit(filePath);
      let record = await this.readSidecar(`${filePath}.json`);
      if (!record && this.client)
        record = await this.readRemoteSidecar(path.basename(filePath)).then(
          (result) => result?.record ?? null,
        );
      const previous =
        record &&
        this.publishedGames(record).find((entry) => entry.id === game.id);
      if (!record || !previous)
        throw new Error("The recorded game metadata is not available");
      if (
        previous.revision > game.revision ||
        (previous.revision === game.revision &&
          JSON.stringify(previous.presentation) !==
            JSON.stringify(game.presentation))
      )
        throw new Error("The saved game labels changed; reload and try again");
      const updated = this.overlayPresentations(record, [game]);
      await this.serialize("local", async () => {
        await this.writeLocalSidecar(filePath, updated);
        this.presentationFiles.add(filePath);
      });
    });
    void this.retryGamePresentations();
  }

  /** Edited local sidecars double as the retry queue across process restarts. */
  async publishGamePresentations(): Promise<void> {
    if (!this.client) return;
    let failure: unknown;
    for (const filePath of this.pendingEdits) {
      try {
        await this.serializeMetadata(filePath, () =>
          this.recoverPublishedEdit(filePath),
        );
      } catch (error) {
        failure ??= error;
      }
    }
    for (const filePath of this.presentationFiles) {
      if (this.pendingEdits.has(filePath)) continue;
      try {
        await this.serializeMetadata(filePath, async () => {
          const local = await this.readSidecar(`${filePath}.json`);
          if (
            !local ||
            this.publishedPresentations.get(filePath) ===
              this.presentationSignature(local)
          )
            return;
          // Only finalized uploads may be edited. A missing remote record stays missing.
          const remote = await this.writeSidecar(
            path.basename(filePath),
            local,
            false,
          );
          if (!remote) return;
          if (await this.updateIndex(remote, true))
            this.publishedPresentations.set(
              filePath,
              this.presentationSignature(local),
            );
        });
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
  }

  private async retryGamePresentations(): Promise<void> {
    try {
      await this.publishGamePresentations();
    } catch (err) {
      log.error(
        { err },
        "Saved game metadata publication failed — kept for retry",
      );
    }
  }

  /**
   * Upload the demo, then checkpoints and metadata, then fold the record into the
   * index — in that order, so every failure keeps the local files and
   * the whole (idempotent) chain retries on the next sweep.
   */
  private async uploadOne(filePath: string): Promise<string> {
    const config = this.config!;
    const basename = path.basename(filePath);
    if (basename.endsWith(FAILED_SUFFIX)) {
      // A spool salvage couldn't read: parked under failed/ for later
      // inspection so it doesn't accumulate on the volume. No sidecar,
      // no index entry — it isn't a demo.
      const key = `${config.prefix}${FAILED_PREFIX}${basename}`;
      await this.uploadDemoFile(filePath, key);
      return key;
    }
    const key = `${config.prefix}${basename}`;
    const record = await this.readSidecar(`${filePath}.json`);
    if (await this.rewrittenInBucket(filePath, key)) {
      log.warn(
        { key },
        "Demo was rewritten in the bucket after this copy was uploaded — keeping the bucket's",
      );
      if (record) await this.updateIndex(record);
      return key;
    }
    await this.uploadDemoFile(filePath, key);
    await this.publishCheckpoints?.(filePath, key);
    if (record) {
      await this.serializeMetadata(filePath, async () => {
        // A first upload may have reached its sidecar but not its index entry.
        // Recover its edit before the normal append below, keeping the intent
        // durable until that append succeeds.
        await this.recoverPublishedEdit(filePath, false);
        const latest = (await this.readSidecar(`${filePath}.json`)) ?? record;
        const published = (await this.writeSidecar(basename, latest, true))!;
        await this.updateIndex(published);
        if (latest.games?.some((game) => game.gameId)) {
          this.publishedPresentations.set(
            filePath,
            this.presentationSignature(latest),
          );
          this.presentationFiles.add(filePath);
        }
      });
    }
    return key;
  }

  private publishedGames(record: DemoMetadata): PublishedGame[] {
    return (record.games ?? []).flatMap((game) => {
      const saved =
        game.gameId &&
        readPublishedGame({
          id: game.gameId,
          revision: game.presentationRevision ?? 0,
          presentation: {
            ...(game.title !== undefined && { title: game.title }),
            ...(game.teamNames !== undefined && { teamNames: game.teamNames }),
          },
        });
      return saved ? [saved] : [];
    });
  }

  private presentationSignature(record: DemoMetadata): string {
    return JSON.stringify(this.publishedGames(record));
  }

  private overlayPresentations(
    record: DemoMetadata,
    snapshots: readonly PublishedGame[],
    source?: DemoMetadata,
  ): DemoMetadata {
    if (!snapshots.length) return record;
    if (!record.games && !source) return record;
    const base = record.games
      ? record
      : publishedDemoRecord(record, record.filename);
    const games = new Map(snapshots.map((game) => [game.id, game]));
    return {
      ...base,
      games: base.games.map((game) => {
        const legacyMatches =
          !game.gameId &&
          source?.games.filter(
            (candidate) =>
              candidate.gameId &&
              games.has(candidate.gameId) &&
              sameDemoGame(candidate, game),
          );
        const id =
          game.gameId ||
          (legacyMatches &&
            legacyMatches.length === 1 &&
            legacyMatches[0].gameId);
        const saved = id && games.get(id);
        return saved && saved.revision >= (game.presentationRevision ?? 0)
          ? withGamePresentation(game, saved)
          : game;
      }),
    };
  }

  private async writeLocalSidecar(
    filePath: string,
    record: DemoMetadata,
  ): Promise<void> {
    const target = `${filePath}.json`;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    atomicWrite(target, JSON.stringify(record, null, 2));
  }

  private async readRemoteSidecar(
    filename: string,
  ): Promise<{ record: DemoMetadata; etag: string } | null> {
    try {
      const object = await this.client!.send(
        new GetObjectCommand({
          Bucket: this.config!.bucket,
          Key: `${this.config!.prefix}${filename}.json`,
        }),
      );
      const value: unknown = JSON.parse(await object.Body!.transformToString());
      if (
        !value ||
        typeof value !== "object" ||
        (value as DemoMetadata).filename !== filename ||
        ((value as DemoMetadata).games !== undefined &&
          !Array.isArray((value as DemoMetadata).games)) ||
        !object.ETag
      )
        throw new Error(`Invalid demo metadata or missing ETag: ${filename}`);
      return { record: value as DemoMetadata, etag: object.ETag };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "NoSuchKey" || err.name === "NotFound")
      )
        return null;
      throw err;
    }
  }

  /** Pre-sidecar demos must already be indexed and have their original recording. */
  private async readIndexedDemo(filename: string): Promise<DemoMetadata> {
    let records: unknown;
    try {
      const index = await this.client!.send(
        new GetObjectCommand({
          Bucket: this.config!.bucket,
          Key: `${this.config!.prefix}index.json`,
        }),
      );
      records = JSON.parse(await index.Body!.transformToString());
      if (!Array.isArray(records))
        throw new Error("Invalid published demo index");
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      )
        throw new GamePresentationError(404, "Published demo not found");
      throw error;
    }
    const matches = (records as DemoMetadata[]).filter(
      (record) => record?.filename === filename,
    );
    if (matches.length !== 1)
      throw new GamePresentationError(404, "Published demo not found");
    try {
      await this.client!.send(
        new HeadObjectCommand({
          Bucket: this.config!.bucket,
          Key: `${this.config!.prefix}${filename}`,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      )
        throw new GamePresentationError(404, "Published demo not found");
      throw error;
    }
    return publishedDemoRecord(matches[0], filename);
  }

  /** Conditional replacement keeps concurrent repairs and unrelated fields. */
  private async writeSidecar(
    filename: string,
    desired: DemoMetadata,
    allowCreate: boolean,
  ): Promise<DemoMetadata | null> {
    const key = `${this.config!.prefix}${filename}.json`;
    for (let attempt = 0; ; attempt++) {
      const remote = await this.readRemoteSidecar(filename);
      const current = remote?.record;
      if (!current && !allowCreate) return null;
      const snapshots = this.publishedGames(desired);
      // A backfill may finish after the recording upload but before its first
      // sidecar. Adopt only untouched legacy games; authored identities/labels
      // must never be replaced by a stale recording's local metadata.
      const adoptionSource = {
        ...desired,
        games: (desired.games ?? []).filter((candidate) =>
          current?.games?.some(
            (game) =>
              game.gameId === undefined &&
              game.title === undefined &&
              game.teamNames === undefined &&
              (game.presentationRevision === undefined ||
                game.presentationRevision === 0) &&
              sameDemoGame(game, candidate),
          ),
        ),
      };
      let updated = current
        ? this.overlayPresentations(current, snapshots, adoptionSource)
        : desired;
      if (
        current &&
        snapshots.some(
          (saved) =>
            updated.games?.filter((game) => game.gameId === saved.id).length !==
            1,
        )
      )
        throw new Error(
          "The recorded game identity changed; metadata was not overwritten",
        );
      // Analysis cannot recover the recorder's original retention reason.
      if (
        current &&
        desired.reason !== undefined &&
        snapshots.some(
          (saved) => !current.games?.some((game) => game.gameId === saved.id),
        )
      )
        updated = { ...updated, reason: desired.reason };
      if (current && JSON.stringify(updated) === JSON.stringify(current))
        return updated;
      try {
        await this.client!.send(
          new PutObjectCommand({
            Bucket: this.config!.bucket,
            Key: key,
            Body: JSON.stringify(updated, null, 2),
            ContentType: "application/json; charset=utf-8",
            CacheControl: "no-cache",
            ...(remote ? { IfMatch: remote.etag } : { IfNoneMatch: "*" }),
          }),
        );
        return updated;
      } catch (err) {
        if (
          attempt >= 4 ||
          !(err instanceof Error) ||
          err.name !== "PreconditionFailed"
        )
          throw err;
      }
    }
  }

  /**
   * Whether the bucket holds another version of this demo: names are
   * unique and uploads whole, so this recording was uploaded before, and
   * its objects have been rewritten in place since
   * (scripts/migrate-relay-demos.ts) — which a copy left behind here, by a
   * crash between upload and unlink, must not undo.
   */
  private async rewrittenInBucket(
    filePath: string,
    key: string,
  ): Promise<boolean> {
    let etag: string;
    try {
      const head = await this.client!.send(
        new HeadObjectCommand({ Bucket: this.config!.bucket, Key: key }),
      );
      etag = unquoteEtag(head.ETag);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NotFound" || error.name === "NoSuchKey")
      )
        return false;
      throw error;
    }
    const local = await fileEtags(filePath);
    return etag !== local.md5 && etag !== local.multipartEtag;
  }

  /**
   * Null for pre-sidecar legacy files (demo still uploads, unindexed)
   * or an unreadable record (logged; rebuildable later if ever fixed).
   */
  private async readSidecar(sidecarPath: string): Promise<DemoMetadata | null> {
    let raw: string;
    try {
      raw = await fsp.readFile(sidecarPath, "utf-8");
    } catch {
      return null;
    }
    try {
      return JSON.parse(raw) as DemoMetadata;
    } catch (err) {
      log.warn(
        { err, file: path.basename(sidecarPath) },
        "Unreadable demo sidecar — uploading demo without an index entry",
      );
      return null;
    }
  }

  /**
   * Conditional updates preserve concurrent backfills and other uploaders.
   * Appends are deduped by filename so retries after a partial failure stay clean.
   * Any unexpected read/parse error throws (kept + retried) rather than
   * risk clobbering the index with a truncated read.
   */
  private async updateIndex(
    record: DemoMetadata,
    existingOnly = false,
    gameIds?: ReadonlySet<string>,
  ): Promise<boolean> {
    const config = this.config!;
    const key = `${config.prefix}index.json`;
    let found = false;
    const snapshots = this.publishedGames(record).filter(
      (game) => !gameIds || gameIds.has(game.id),
    );
    const count = await updateDemoIndex(
      this.client!,
      config.bucket,
      key,
      (entries) => {
        const existing = entries?.find(
          (entry) => entry.filename === record.filename,
        );
        found = !!existing || !existingOnly;
        if (!existing)
          return existingOnly ? undefined : [...(entries ?? []), record];
        const updated = this.overlayPresentations(existing, snapshots, record);
        if (
          existingOnly &&
          snapshots.some(
            (saved) => !updated.games?.some((game) => game.gameId === saved.id),
          )
        )
          throw new Error(
            "The indexed game's identity changed; metadata was not overwritten",
          );
        return JSON.stringify(updated) === JSON.stringify(existing)
          ? undefined
          : entries!.map((entry) => (entry === existing ? updated : entry));
      },
    );
    log.debug({ entries: count }, "Demo index updated");
    return found;
  }

  /** Expire only confirmed cache copies; unsynced saves survive indefinitely. */
  private prunePublishedSidecars(): Promise<void> {
    return this.serialize("local", async () => {
      for (const filePath of this.presentationFiles) {
        if (this.pendingEdits.has(filePath)) continue;
        const local = await this.readSidecar(`${filePath}.json`);
        if (
          !local ||
          this.publishedPresentations.get(filePath) !==
            this.presentationSignature(local)
        )
          continue;
        try {
          const stat = await fsp.stat(`${filePath}.json`);
          if (Date.now() - stat.mtimeMs < PUBLISHED_DEMO_SIDECAR_CACHE_MS)
            continue;
          if (
            await fsp.stat(filePath).then(
              () => true,
              (error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return false;
                throw error;
              },
            )
          )
            continue;
          await fsp.unlink(`${filePath}.json`);
          this.presentationFiles.delete(filePath);
          this.publishedPresentations.delete(filePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT")
            log.warn(
              { error, filePath },
              "Synced demo metadata cache could not be removed",
            );
        }
      }
    });
  }

  private async uploadDemoFile(filePath: string, key: string): Promise<void> {
    const bytes = await fsp.stat(filePath).then(
      (s) => s.size,
      () => null,
    );
    log.info(
      { key, file: path.basename(filePath), bytes },
      "Demo upload starting",
    );
    const body = fs.createReadStream(filePath);
    // Read errors surface through upload.done(); a bare 'error' on the
    // stream (e.g. the upload aborts before consuming it) must not
    // crash the process.
    body.on("error", () => {});
    try {
      const upload = new Upload({
        client: this.client!,
        params: {
          Bucket: this.config!.bucket,
          Key: key,
          Body: body,
          ContentType: "application/octet-stream",
          // Demo filenames are unique (random suffix), so objects are
          // immutable — cache them as hard as anything will allow.
          CacheControl: "public, max-age=31536000, immutable",
        },
        partSize: UPLOAD_PART_BYTES,
        queueSize: 2,
      });
      await upload.done();
    } finally {
      body.destroy();
    }
  }

  /** Boot + retry sweep over the demo dir. */
  async sweep(): Promise<void> {
    await this.retryGamePresentations();
    let entries: string[];
    try {
      entries = await fsp.readdir(this.dir);
    } catch {
      return; // Dir doesn't exist yet — nothing recorded.
    }
    let requeued = 0;
    for (const name of entries) {
      const filePath = path.join(this.dir, name);
      if (name.endsWith(".rec.json.edit")) {
        this.pendingEdits.add(filePath.slice(0, -".json.edit".length));
      } else if (name.endsWith(PARTIAL_SUFFIX)) {
        // Live spools are .partial too: never touch one a recorder in
        // this process owns (salvaging an open file would race its
        // writes). For the rest, only a cold mtime marks a crashed
        // recording — which is then salvaged into a demo, not deleted.
        if (this.isLive(filePath)) continue;
        try {
          const stat = await fsp.stat(filePath);
          if (Date.now() - stat.mtimeMs < STALE_PARTIAL_MS) continue;
        } catch {
          continue; // Renamed/removed between readdir and stat.
        }
        log.warn({ file: name }, "Salvaging crashed recording");
        const outcome = await salvagePartialDemo(filePath, {
          minLengthMs: this.salvageMinLengthMs,
        });
        if (outcome.kind !== "dropped") this.enqueue(outcome.path);
      } else if (
        name.endsWith(".rec.json") ||
        name.endsWith(`.rec${DEMO_CHECKPOINT_SUFFIX}`) ||
        name.endsWith(`.rec${DEMO_CHECKPOINT_SUFFIX}.tmp`)
      ) {
        if (name.endsWith(".rec.json")) {
          const record = await this.readSidecar(filePath);
          if (record?.games?.some((game) => game.gameId)) {
            this.presentationFiles.add(filePath.slice(0, -5));
            continue;
          }
        }
        // A sidecar without its .rec is a crash-window orphan (the demo
        // uploaded and unlinked, then the process died before this
        // unlink). The mtime guard covers the finalize race where the
        // .rec appears moments after its sidecar.
        try {
          await fsp.access(
            filePath.replace(/(\.checkpoints\.json(?:\.tmp)?|\.json)$/, ""),
          );
        } catch {
          try {
            const stat = await fsp.stat(filePath);
            if (Date.now() - stat.mtimeMs < STALE_PARTIAL_MS) continue;
            log.warn({ file: name }, "Removing orphan demo sidecar");
            await fsp.unlink(filePath);
          } catch {
            // Removed between readdir and stat — nothing to do.
          }
        }
      } else if (name.endsWith(".rec") || name.endsWith(FAILED_SUFFIX)) {
        if (!this.queued.has(filePath)) requeued++;
        this.enqueue(filePath);
      }
    }
    if (requeued > 0 && this.enabled) {
      log.info({ count: requeued }, "Sweep queued demos awaiting upload");
    }
    await this.retryGamePresentations();
    await this.prunePublishedSidecars();
  }
}
