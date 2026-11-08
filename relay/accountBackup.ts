import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type Database from "better-sqlite3";
import { createAccountDatabaseBackup } from "./accountDatabase.js";
import { logger } from "./logger.js";

const log = logger.child({ module: "accountBackup" });
const DEFAULT_INTERVAL_MS = 6 * 60 * 60_000;

export interface AccountBackupConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  intervalMs: number;
}

/** Account snapshots contain sessions and must never use the public demo bucket. */
export function loadAccountBackupConfig(
  env: NodeJS.ProcessEnv = process.env,
): AccountBackupConfig | null {
  const values = [
    env.ACCOUNT_BACKUP_R2_ENDPOINT,
    env.ACCOUNT_BACKUP_R2_BUCKET,
    env.ACCOUNT_BACKUP_R2_ACCESS_KEY_ID,
    env.ACCOUNT_BACKUP_R2_SECRET_ACCESS_KEY,
  ];
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error(
      "All four ACCOUNT_BACKUP_R2_* settings are required for account backups",
    );
  }
  const [endpoint, bucket, accessKeyId, secretAccessKey] = values as string[];
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("ACCOUNT_BACKUP_R2_ENDPOINT must be an HTTPS endpoint");
  }
  if (bucket === env.DEMO_R2_BUCKET) {
    throw new Error(
      "Account backups require a separate private bucket, not DEMO_R2_BUCKET",
    );
  }
  const intervalMs = Number(
    env.ACCOUNT_BACKUP_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
  );
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 60_000 ||
    intervalMs > 2_147_483_647
  ) {
    throw new Error(
      "ACCOUNT_BACKUP_INTERVAL_MS must be between 60000 and 2147483647",
    );
  }
  const prefix = env.ACCOUNT_BACKUP_R2_PREFIX ?? "accounts/";
  if (
    !prefix ||
    prefix.startsWith("/") ||
    prefix.includes("..") ||
    !prefix.endsWith("/")
  ) {
    throw new Error(
      "ACCOUNT_BACKUP_R2_PREFIX must be a relative prefix ending in /",
    );
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, prefix, intervalMs };
}

/** Start after auth schema migrations. Stop and drain before closing SQLite. */
export function startAccountBackups(
  database: Database.Database,
  config: AccountBackupConfig,
) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 2,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  let pending: Promise<void> | null = null;
  let stopped = false;

  async function upload(): Promise<void> {
    let directory: string | undefined;
    let body: fs.ReadStream | undefined;
    try {
      directory = await fsp.mkdtemp(
        path.join(path.dirname(database.name), ".account-backup-"),
      );
      const filename = path.join(directory, "accounts.sqlite");
      await createAccountDatabaseBackup(database, filename);
      const key = `${config.prefix}${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.sqlite`;
      body = fs.createReadStream(filename);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentLength: (await fsp.stat(filename)).size,
          ContentType: "application/vnd.sqlite3",
          CacheControl: "no-store",
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      log.info("Account database backup uploaded");
    } finally {
      body?.destroy();
      if (directory) await fsp.rm(directory, { recursive: true, force: true });
    }
  }

  function run(): Promise<void> {
    if (stopped)
      return Promise.reject(new Error("Account backups have stopped"));
    if (!pending)
      pending = upload().finally(() => {
        pending = null;
      });
    return pending;
  }

  function scheduledRun(): void {
    void run().catch(() => {
      // Do not log request objects or database data alongside credentials.
      log.error(
        "Account database backup failed; check the private bucket configuration and connectivity",
      );
    });
  }
  const timer = setInterval(scheduledRun, config.intervalMs);
  timer.unref();
  scheduledRun();
  return {
    run,
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      await pending?.catch(() => {});
      client.destroy();
    },
  };
}
