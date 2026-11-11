import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import type Database from "better-sqlite3";
import { abortable } from "./abortable.js";
import {
  closeRejectedRequest,
  handleAccountCors,
  json,
} from "./accountHttp.js";
import { isDiscordId, type AccountUser } from "./accountTypes.js";
import type { DemoMetadata } from "./demoMetadata.js";
import type { PreparedDemoCheckpoints } from "./demoCheckpointGenerator.js";
import { buildDemoFilename } from "./demoKeys.js";
import {
  DemoUploadProcessingError,
  type DemoUploadProcessingResult,
} from "./demoUploadProcess.js";
import {
  DemoValidationError,
  validateSourceDemo,
} from "./demoSourceValidation.js";
import { browserIdentity } from "./browserAudit.js";
import { demoLog as log } from "./logger.js";
import {
  MAX_USER_DEMO_BYTES,
  MAX_USER_DEMO_DECOMPRESSED_BYTES,
  MAX_USER_DEMO_METADATA_BYTES,
  MAX_USER_DEMO_SIDECAR_BYTES,
  MAX_USER_DEMO_STORAGE_BYTES,
  MAX_USER_DEMOS,
  USER_DEMO_UPLOAD_PATH,
  type UserDemoUpload,
  type UserDemoUploadList,
  type UserDemoUploadState,
} from "./userDemoTypes.js";

const MAX_PENDING_UPLOADS = 8;
const TRANSFER_TIMEOUT_MS = 5 * 60_000;
const RETRY_INTERVAL_MS = 30_000;
const RATE_WINDOW_MS = 60 * 60_000;
const MAX_ACCOUNT_ATTEMPTS = 100;
const MAX_IP_ATTEMPTS = MAX_ACCOUNT_ATTEMPTS * 2;
const MAX_PUBLISH_ATTEMPTS = 3;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

interface UploadRow {
  id: string;
  owner_discord_id: string;
  discord_handle_at_upload_time: string | null;
  discord_display_name_at_upload_time: string | null;
  original_filename: string;
  object_key: string | null;
  sha256: string | null;
  state: UserDemoUploadState;
  raw_bytes: number;
  reserved_bytes: number;
  charged_bytes: number;
  recorded_at: string | null;
  created_at: number;
  updated_at: number;
  error: string | null;
}

export interface UserDemoUploadsOptions {
  database: Database.Database;
  directory: string;
  assetRoot: string;
  trustedOrigins: readonly string[];
  trustFlyProxy: boolean;
  /** Free space every upload must leave on the volume. */
  minFreeDiskBytes: number;
  getAccount(headers: IncomingHttpHeaders): Promise<AccountUser | null>;
  processDemo(
    input: string,
    assetRoot: string,
    signal: AbortSignal,
  ): Promise<DemoUploadProcessingResult>;
  publishDemo(
    key: string,
    file: string,
    metadata: DemoMetadata,
    checkpoints: PreparedDemoCheckpoints,
  ): Promise<void>;
  deleteDemo(key: string): Promise<void>;
}

class UploadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const limits = {
  maxDemoBytes: MAX_USER_DEMO_BYTES,
  maxExpandedBytes: MAX_USER_DEMO_DECOMPRESSED_BYTES,
  maxStorageBytes: MAX_USER_DEMO_STORAGE_BYTES,
  maxDemos: MAX_USER_DEMOS,
};

function publicDemo(row: UploadRow): UserDemoUpload {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    filename: row.object_key,
    state: row.state,
    bytes: row.raw_bytes,
    storedBytes: row.charged_bytes,
    recordedAt: row.recorded_at,
    createdAt: new Date(row.created_at).toISOString(),
    error: row.error,
  };
}

async function syncFiles(files: readonly string[]): Promise<void> {
  for (const file of files) {
    const handle = await fs.open(file, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

/** Ownership, quota reservations, and resumable jobs share the account database. */
export class UserDemoUploads {
  private readonly database: Database.Database;
  private readonly directory: string;
  private readonly options: UserDemoUploadsOptions;
  private readonly running = new Map<string, Promise<void>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly requests = new Set<Promise<boolean>>();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(options: UserDemoUploadsOptions) {
    this.options = options;
    this.database = options.database;
    this.directory = path.resolve(options.directory);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS user_demo_uploads (
        id TEXT PRIMARY KEY,
        owner_discord_id TEXT NOT NULL,
        discord_handle_at_upload_time TEXT,
        discord_display_name_at_upload_time TEXT,
        original_filename TEXT NOT NULL,
        object_key TEXT,
        sha256 TEXT,
        state TEXT NOT NULL CHECK(state IN ('receiving','queued','processing','publishing','ready','deleting','failed')),
        raw_bytes INTEGER NOT NULL CHECK(raw_bytes > 0),
        reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0),
        charged_bytes INTEGER NOT NULL DEFAULT 0 CHECK(charged_bytes >= 0),
        recorded_at TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        error TEXT,
        UNIQUE(owner_discord_id, sha256)
      );
      CREATE INDEX IF NOT EXISTS user_demo_upload_owner ON user_demo_uploads(owner_discord_id, state);
      CREATE INDEX IF NOT EXISTS user_demo_upload_jobs ON user_demo_uploads(state, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS user_demo_upload_objects ON user_demo_uploads(object_key);
      CREATE TABLE IF NOT EXISTS user_demo_upload_rates (
        key TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL
      );
    `);
    const columns = new Set(
      this.database
        .prepare("SELECT name FROM pragma_table_info(?)")
        .pluck()
        .all("user_demo_uploads") as string[],
    );
    if (!columns.has("discord_handle_at_upload_time"))
      this.database.exec(
        "ALTER TABLE user_demo_uploads ADD COLUMN discord_handle_at_upload_time TEXT",
      );
    if (!columns.has("discord_display_name_at_upload_time"))
      this.database.exec(
        "ALTER TABLE user_demo_uploads ADD COLUMN discord_display_name_at_upload_time TEXT",
      );
  }

  async start(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    await fs.chmod(this.directory, 0o700);
    const rows = this.database
      .prepare("SELECT * FROM user_demo_uploads")
      .all() as UploadRow[];
    const known = new Set(rows.map((row) => row.id));
    for (const entry of await fs.readdir(this.directory, {
      withFileTypes: true,
    })) {
      if (UUID.test(entry.name) && !known.has(entry.name))
        await fs.rm(path.join(this.directory, entry.name), {
          recursive: true,
          force: true,
        });
    }
    for (const row of rows) {
      if (row.state === "receiving") {
        await this.fail(row.id, "Upload was interrupted. Please try again.");
      } else if (row.state === "ready" || row.state === "failed") {
        await this.removeLocal(row.id);
      } else {
        // Interrupted jobs start over from the saved original.
        if (row.state === "processing" || row.state === "publishing")
          this.setState(row.id, "queued");
        this.schedule(row.id);
      }
    }
    this.prune();
    this.timer = setInterval(() => {
      try {
        this.prune();
        const pending = this.database
          .prepare(
            "SELECT id FROM user_demo_uploads WHERE state IN ('queued','deleting')",
          )
          .all() as Array<{ id: string }>;
        for (const { id } of pending) this.schedule(id);
      } catch (error) {
        log.error({ err: error }, "User demo cleanup could not run");
      }
    }, RETRY_INTERVAL_MS);
    this.timer.unref();
  }

  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const task = this.handleRequest(req, res);
    this.requests.add(task);
    void task.finally(() => this.requests.delete(task)).catch(() => {});
    return task;
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://relay.invalid");
    } catch {
      return false;
    }
    if (
      url.pathname !== USER_DEMO_UPLOAD_PATH &&
      !url.pathname.startsWith(`${USER_DEMO_UPLOAD_PATH}/`)
    )
      return false;
    // Credentialed mutations must come from a trusted browser origin.
    if (
      !req.headers.origin &&
      (req.method === "POST" || req.method === "DELETE")
    ) {
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
        throw new UploadError(503, "Demo uploads are temporarily unavailable");
      const user = await this.options.getAccount(req.headers);
      if (this.closed)
        throw new UploadError(503, "Demo uploads are temporarily unavailable");
      if (!user) throw new UploadError(401, "Sign in to manage your demos");
      if (!isDiscordId(user.discordId))
        throw new UploadError(403, "A linked Discord account is required");
      const owners = url.searchParams.getAll("owner");
      if (
        owners.length > 0 &&
        (owners.length !== 1 || owners[0] !== user.discordId)
      )
        throw new UploadError(
          401,
          "Your signed-in account changed. Please try again.",
        );
      if (req.method === "GET" && url.pathname === USER_DEMO_UPLOAD_PATH) {
        json(res, 200, this.list(user.discordId));
      } else if (
        req.method === "POST" &&
        url.pathname === USER_DEMO_UPLOAD_PATH
      ) {
        await this.receive(req, res, url, user);
      } else if (req.method === "DELETE") {
        const id = url.pathname.slice(USER_DEMO_UPLOAD_PATH.length + 1);
        const row = UUID.test(id) ? this.row(id) : undefined;
        if (!row || row.owner_discord_id !== user.discordId)
          throw new UploadError(404, "Demo not found");
        this.setState(id, "deleting", null);
        this.controllers
          .get(id)
          ?.abort(new DOMException("Upload deleted", "AbortError"));
        if (!this.controllers.has(id) || this.running.has(id))
          this.schedule(id);
        json(res, 202, { demo: publicDemo(this.row(id)!) });
      } else {
        res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
        throw new UploadError(405, "Method not allowed");
      }
    } catch (error) {
      const status = error instanceof UploadError ? error.status : 500;
      if (status === 429) res.setHeader("Retry-After", "3600");
      closeRejectedRequest(req, res);
      json(res, status, {
        error:
          error instanceof UploadError
            ? error.message
            : "Could not manage demo uploads",
      });
      if (status === 500) log.error({ err: error }, "User demo request failed");
    }
    return true;
  }

  private list(owner: string): UserDemoUploadList {
    const rows = this.database
      .prepare(
        "SELECT * FROM user_demo_uploads WHERE owner_discord_id = ? ORDER BY created_at DESC",
      )
      .all(owner) as UploadRow[];
    return {
      demos: rows.map(publicDemo),
      usage: this.usage(owner),
      limits,
    };
  }

  private usage(owner: string): { bytes: number; count: number } {
    return this.database
      .prepare(
        "SELECT COALESCE(SUM(reserved_bytes + charged_bytes), 0) AS bytes, COUNT(*) AS count FROM user_demo_uploads WHERE owner_discord_id = ? AND state != 'failed'",
      )
      .get(owner) as { bytes: number; count: number };
  }

  private reserve(
    user: AccountUser,
    ip: string,
    filename: string,
    size: number,
    availableDiskBytes: number,
  ): UploadRow {
    const owner = user.discordId;
    return this.database
      .transaction(() => {
        const now = Date.now();
        for (const [key, limit] of [
          [`account:${owner}`, MAX_ACCOUNT_ATTEMPTS],
          [`ip:${ip}`, MAX_IP_ATTEMPTS],
        ] as const) {
          const rate = this.database
            .prepare(
              "SELECT started_at, attempts FROM user_demo_upload_rates WHERE key = ?",
            )
            .get(key) as { started_at: number; attempts: number } | undefined;
          if (
            rate &&
            rate.started_at > now - RATE_WINDOW_MS &&
            rate.attempts >= limit
          )
            throw new UploadError(
              429,
              "Too many upload attempts. Please try again later.",
            );
        }
        for (const key of [`account:${owner}`, `ip:${ip}`]) {
          this.database
            .prepare(
              "INSERT INTO user_demo_upload_rates(key, started_at, attempts) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET started_at = CASE WHEN started_at <= ? THEN excluded.started_at ELSE started_at END, attempts = CASE WHEN started_at <= ? THEN 1 ELSE attempts + 1 END",
            )
            .run(key, now, now - RATE_WINDOW_MS, now - RATE_WINDOW_MS);
        }
        const usage = this.usage(owner);
        if (usage.count >= MAX_USER_DEMOS)
          throw new UploadError(
            409,
            `Your demo library has reached its ${MAX_USER_DEMOS.toLocaleString("en-US")}-demo limit`,
          );
        const outstanding = this.database
          .prepare(
            "SELECT 1 FROM user_demo_uploads WHERE owner_discord_id = ? AND state NOT IN ('ready','failed') LIMIT 1",
          )
          .get(owner);
        if (outstanding)
          throw new UploadError(
            409,
            "Please wait for your current upload or deletion to finish",
          );
        const pending = this.database
          .prepare(
            "SELECT COUNT(*) AS count, COALESCE(SUM(raw_bytes + ?), 0) AS bytes FROM user_demo_uploads WHERE state NOT IN ('ready','failed')",
          )
          .get(MAX_USER_DEMO_SIDECAR_BYTES) as { count: number; bytes: number };
        const reservation = size + MAX_USER_DEMO_SIDECAR_BYTES;
        if (pending.count >= MAX_PENDING_UPLOADS)
          throw new UploadError(
            503,
            "Demo uploads are busy. Please try again shortly.",
          );
        // Incomplete transfers may not have consumed their disk space yet.
        if (
          pending.bytes + reservation + this.options.minFreeDiskBytes >
          availableDiskBytes
        )
          throw new UploadError(
            503,
            "Demo uploads are temporarily out of disk space",
          );
        if (usage.bytes + reservation > MAX_USER_DEMO_STORAGE_BYTES)
          throw new UploadError(
            409,
            "Your demo library does not have enough storage available",
          );
        const id = randomUUID();
        this.database
          .prepare(
            "INSERT INTO user_demo_uploads(id, owner_discord_id, discord_handle_at_upload_time, discord_display_name_at_upload_time, original_filename, state, raw_bytes, reserved_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'receiving', ?, ?, ?, ?)",
          )
          .run(
            id,
            owner,
            user.discordUsername,
            user.name,
            filename,
            size,
            reservation,
            now,
            now,
          );
        return this.row(id)!;
      })
      .immediate();
  }

  private async receive(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    user: AccountUser,
  ): Promise<void> {
    const owner = user.discordId;
    const name = url.searchParams.get("filename");
    if (
      url.searchParams.getAll("filename").length !== 1 ||
      !name ||
      name.length > 200 ||
      !/\.rec$/i.test(name) ||
      /[/\\\x00-\x1f\x7f]/.test(name)
    )
      throw new UploadError(
        400,
        "Choose a .rec demo file with a valid filename",
      );
    if (
      !/^application\/octet-stream(?:\s*;|$)/i.test(
        req.headers["content-type"] ?? "",
      )
    )
      throw new UploadError(415, "Upload the demo as application/octet-stream");
    if (
      req.headers["content-encoding"] &&
      req.headers["content-encoding"] !== "identity"
    )
      throw new UploadError(415, "Upload the unencoded demo file");
    const rawLength = req.headers["content-length"];
    if (
      !rawLength ||
      !/^\d+$/.test(rawLength) ||
      !Number.isSafeInteger(Number(rawLength)) ||
      Number(rawLength) <= 0
    )
      throw new UploadError(411, "A valid Content-Length is required");
    if (req.headers["transfer-encoding"])
      throw new UploadError(400, "Upload the demo with a fixed Content-Length");
    const size = Number(rawLength);
    if (size > MAX_USER_DEMO_BYTES)
      throw new UploadError(413, "Demo exceeds the 50 MB upload limit");
    const disk = await fs.statfs(this.directory);
    if (this.closed)
      throw new UploadError(503, "Demo uploads are temporarily unavailable");
    const row = this.reserve(
      user,
      browserIdentity(req, this.options.trustFlyProxy).clientIp,
      name,
      size,
      disk.bavail * disk.bsize,
    );
    const abort = new AbortController();
    this.controllers.set(row.id, abort);
    const canceled = () =>
      abort.abort(new UploadError(400, "Upload was canceled"));
    const disconnected = () => {
      if (!res.writableFinished) canceled();
    };
    req.once("aborted", canceled);
    res.once("close", disconnected);
    if (req.aborted) canceled();
    const timer = setTimeout(
      () => abort.abort(new UploadError(408, "Upload timed out")),
      TRANSFER_TIMEOUT_MS,
    );
    timer.unref();
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      const header = await abortable(validateSourceDemo(req), abort.signal);
      if (header.identString.length + 13 + header.initialBlockSize > size)
        throw new UploadError(422, "The demo ends inside its initial state");
      await fs.mkdir(this.jobDirectory(row.id), { mode: 0o700 });
      handle = await fs.open(this.localFile(row.id), "wx", 0o600);
      const digest = createHash("sha256");
      const iterator = req.iterator({ destroyOnReturn: false });
      let received = 0;
      try {
        for (;;) {
          const { value, done } = await abortable(
            iterator.next(),
            abort.signal,
          );
          if (done) break;
          const chunk = value as Buffer;
          received += chunk.byteLength;
          if (received > size)
            throw new UploadError(
              400,
              "Upload size does not match Content-Length",
            );
          digest.update(chunk);
          await handle.writeFile(chunk);
        }
      } finally {
        void iterator.return?.().catch(() => {});
      }
      abort.signal.throwIfAborted();
      if (received !== size)
        throw new UploadError(400, "Upload size does not match Content-Length");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await syncFiles([this.jobDirectory(row.id), this.directory]);
      abort.signal.throwIfAborted();
      const hash = digest.digest("hex");
      const duplicate = this.database
        .transaction(() => {
          const current = this.row(row.id);
          if (!current || current.state === "deleting")
            throw new UploadError(409, "Upload was deleted");
          const existing = this.database
            .prepare(
              "SELECT * FROM user_demo_uploads WHERE owner_discord_id = ? AND sha256 = ?",
            )
            .get(owner, hash) as UploadRow | undefined;
          if (existing) return existing;
          this.database
            .prepare(
              "UPDATE user_demo_uploads SET sha256 = ?, state = 'queued', updated_at = ? WHERE id = ?",
            )
            .run(hash, Date.now(), row.id);
          return undefined;
        })
        .immediate();
      if (duplicate) {
        await this.removeLocal(row.id);
        this.database
          .prepare("DELETE FROM user_demo_uploads WHERE id = ?")
          .run(row.id);
        if (duplicate.state === "deleting")
          throw new UploadError(
            409,
            "This demo is still being deleted. Please try again shortly.",
          );
        json(res, 200, { demo: publicDemo(duplicate), duplicate: true });
      } else json(res, 202, { demo: publicDemo(this.row(row.id)!) });
    } catch (error) {
      const failure =
        error instanceof DemoValidationError
          ? new UploadError(422, error.message)
          : error;
      await handle?.close();
      if (this.row(row.id)?.state === "deleting") await this.delete(row.id);
      else
        await this.fail(
          row.id,
          failure instanceof UploadError
            ? failure.message
            : "Upload was interrupted. Please try again.",
        );
      throw failure;
    } finally {
      clearTimeout(timer);
      req.off("aborted", canceled);
      res.off("close", disconnected);
      this.controllers.delete(row.id);
      if (this.row(row.id)?.state === "queued") this.schedule(row.id);
    }
  }

  private schedule(id: string): void {
    if (this.closed || this.running.has(id)) return;
    const task = this.run(id).catch((error) =>
      log.error({ err: error, uploadId: id }, "User demo job could not finish"),
    );
    this.running.set(id, task);
    void task.finally(() => this.running.delete(id));
  }

  private async run(id: string): Promise<void> {
    const row = this.row(id);
    if (row?.state === "deleting") return this.delete(id);
    if (row?.state !== "queued") return;
    const abort = new AbortController();
    this.controllers.set(id, abort);
    try {
      this.setState(id, "processing");
      const original = await fs.lstat(this.localFile(id));
      if (!original.isFile() || original.size !== row.raw_bytes)
        throw new UploadError(
          422,
          "The saved upload is incomplete. Please upload it again.",
        );
      const result = await this.options.processDemo(
        this.localFile(id),
        this.options.assetRoot,
        abort.signal,
      );
      if (this.row(id)?.state === "deleting") {
        await this.delete(id);
        return;
      }
      if (this.closed) {
        this.setState(id, "queued");
        return;
      }
      const {
        discordHandleAtUploadTime: _discardedHandle,
        discordDisplayNameAtUploadTime: _discardedDisplayName,
        ...analyzed
      } = result.metadata;
      const key = row.object_key ?? this.uniqueObjectKey(row, result);
      const metadata: DemoMetadata = {
        ...analyzed,
        filename: key,
        ...(row.discord_handle_at_upload_time !== null && {
          discordHandleAtUploadTime: row.discord_handle_at_upload_time,
        }),
        ...(row.discord_display_name_at_upload_time !== null && {
          discordDisplayNameAtUploadTime:
            row.discord_display_name_at_upload_time,
        }),
      };
      const metadataBytes = Buffer.byteLength(JSON.stringify(metadata));
      if (metadataBytes > MAX_USER_DEMO_METADATA_BYTES)
        throw new UploadError(
          422,
          "Generated demo data exceeds the size limit",
        );
      // From here on, objects may exist under the key, so cleanup must remove them.
      this.database
        .prepare(
          "UPDATE user_demo_uploads SET state = 'publishing', object_key = ?, charged_bytes = raw_bytes + ?, reserved_bytes = 0, recorded_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          key,
          metadataBytes + result.checkpoints.bytes,
          metadata.recordedAt,
          Date.now(),
          id,
        );
      for (let attempt = 1; ; attempt++) {
        try {
          await this.options.publishDemo(
            key,
            this.localFile(id),
            metadata,
            result.checkpoints,
          );
          break;
        } catch (error) {
          if (
            attempt >= MAX_PUBLISH_ATTEMPTS ||
            this.row(id)?.state !== "publishing"
          )
            throw error;
          log.warn(
            { err: error, uploadId: id, attempt },
            "User demo publication failed; retrying",
          );
          this.setState(
            id,
            "publishing",
            "Could not publish this demo. Retrying shortly.",
          );
          await abortable(
            new Promise((resolve) =>
              setTimeout(resolve, RETRY_INTERVAL_MS).unref(),
            ),
            abort.signal,
          );
        }
      }
      if (this.row(id)?.state === "deleting") {
        await this.delete(id);
        return;
      }
      this.setState(id, "ready", null);
      await this.removeLocal(id).catch((error) =>
        log.warn(
          { err: error, uploadId: id },
          "Published demo temporary files could not be removed",
        ),
      );
      if (this.row(id)?.state === "deleting") {
        await this.delete(id);
        return;
      }
      log.info({ uploadId: id, key }, "User demo published");
    } catch (error) {
      const current = this.row(id);
      if (!current) return;
      if (current.state === "deleting") {
        await this.delete(id);
        return;
      }
      if (this.closed) {
        this.setState(id, "queued");
        return;
      }
      log.warn({ err: error, uploadId: id }, "User demo processing failed");
      await this.fail(
        id,
        current.state === "publishing"
          ? "Could not publish this demo. Please try again later."
          : error instanceof UploadError ||
              error instanceof DemoUploadProcessingError
            ? error.message.slice(0, 240)
            : "Could not process this demo. Please try again.",
      );
    } finally {
      this.controllers.delete(id);
    }
  }

  /** Name the public recording like a relay recording. */
  private uniqueObjectKey(
    row: UploadRow,
    { metadata, startMission }: DemoUploadProcessingResult,
  ): string {
    const taken = this.database.prepare(
      "SELECT 1 FROM user_demo_uploads WHERE object_key = ?",
    );
    const date = new Date(metadata.recordedAt);
    let key: string;
    do
      key = `users/${row.owner_discord_id}/${buildDemoFilename(date, metadata.server, startMission)}`;
    while (taken.get(key));
    return key;
  }

  private async fail(id: string, message: string): Promise<void> {
    if (!this.row(id)) return;
    this.setState(id, "deleting", message);
    await this.delete(id);
  }

  private async delete(id: string): Promise<void> {
    const row = this.row(id);
    if (!row) return;
    if (row.object_key) await this.options.deleteDemo(row.object_key);
    await this.removeLocal(id);
    if (this.row(id)?.error) {
      this.database
        .prepare(
          "UPDATE user_demo_uploads SET state = 'failed', object_key = NULL, sha256 = NULL, reserved_bytes = 0, charged_bytes = 0, updated_at = ? WHERE id = ?",
        )
        .run(Date.now(), id);
    } else
      this.database
        .prepare("DELETE FROM user_demo_uploads WHERE id = ?")
        .run(id);
  }

  private row(id: string): UploadRow | undefined {
    return this.database
      .prepare("SELECT * FROM user_demo_uploads WHERE id = ?")
      .get(id) as UploadRow | undefined;
  }

  private setState(
    id: string,
    state: UserDemoUploadState,
    error?: string | null,
  ): void {
    if (error === undefined)
      this.database
        .prepare(
          "UPDATE user_demo_uploads SET state = ?, updated_at = ? WHERE id = ?",
        )
        .run(state, Date.now(), id);
    else
      this.database
        .prepare(
          "UPDATE user_demo_uploads SET state = ?, error = ?, updated_at = ? WHERE id = ?",
        )
        .run(state, error, Date.now(), id);
  }

  private jobDirectory(id: string): string {
    return path.join(this.directory, id);
  }
  private localFile(id: string): string {
    return path.join(this.jobDirectory(id), "demo.rec");
  }
  private removeLocal(id: string): Promise<void> {
    return fs.rm(this.jobDirectory(id), { recursive: true, force: true });
  }

  private prune(): void {
    this.database
      .prepare("DELETE FROM user_demo_upload_rates WHERE started_at <= ?")
      .run(Date.now() - RATE_WINDOW_MS);
    this.database
      .prepare(
        "DELETE FROM user_demo_uploads WHERE state = 'failed' AND (updated_at < ? OR id NOT IN (SELECT id FROM user_demo_uploads f WHERE f.owner_discord_id = user_demo_uploads.owner_discord_id AND f.state = 'failed' ORDER BY created_at DESC LIMIT 10))",
      )
      .run(Date.now() - 24 * RATE_WINDOW_MS);
  }

  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.timer);
    for (const controller of this.controllers.values())
      controller.abort(
        new DOMException("Relay is shutting down", "AbortError"),
      );
    await Promise.allSettled([...this.requests, ...this.running.values()]);
  }
}
