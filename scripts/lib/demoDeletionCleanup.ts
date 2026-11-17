import path from "node:path";
import Database from "better-sqlite3";
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { hasPendingAccountSchemaMigrations } from "../../relay/accountDatabase.js";
import {
  DEMO_GUIDS_SUFFIX,
  readDemoGuidSidecar,
} from "../../relay/demoGuids.js";
import { isPublishedDemoKey } from "../../relay/demoKeys.js";
import type { DemoMetadata } from "../../relay/demoMetadata.js";
import {
  DEMO_STATS_SUFFIX,
  DEMO_PROFILES_SUFFIX,
} from "../../relay/demoStats.js";
import type { DemoUploadConfig } from "../../relay/demoUpload.js";
import { createPlayerDemosReader } from "../../relay/playerDemos.js";
import {
  isMissingObject,
  loadPrivateDemoStorageConfig,
  PrivateDemoStore,
} from "../../relay/privateDemoStore.js";
import { listAllObjects } from "./r2.js";
import { prepareDemoDeletionProfiles } from "./demoDeletionProfiles.js";

export const DEMO_DELETION_SUFFIX = ".deletion.json";
const CLIP_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ownsSidecar(key: string, recordingKey: string): boolean {
  return (
    key.slice(0, key.toLowerCase().lastIndexOf(".rec.") + 4) === recordingKey &&
    !key.endsWith(DEMO_DELETION_SUFFIX)
  );
}

export interface DemoDeletionPlan {
  version: 1;
  demoKey: string;
  metadata: unknown;
  sourceETag: string | null;
  guids: string[];
  clipIds: string[];
  privateObjects: string[];
}

/** Offline maintenance: callers must stop relay workers and other backfills. */
export class DemoDeletionCleanup {
  private readonly store: PrivateDemoStore;
  private readonly memberships: ReturnType<typeof createPlayerDemosReader>;
  private journals = new Map<string, DemoDeletionPlan>();
  private privateKeys: string[] = [];
  private readonly options: {
    database: Database.Database;
    config: DemoUploadConfig;
    privateConfig: DemoUploadConfig;
    client: S3Client;
  };

  constructor(options: DemoDeletionCleanup["options"]) {
    this.options = options;
    this.store = new PrivateDemoStore(options.privateConfig, options.client);
    this.memberships = createPlayerDemosReader({ database: options.database });
  }

  async pending(): Promise<Map<string, unknown>> {
    const { client, privateConfig } = this.options;
    this.privateKeys = (await listAllObjects(client, privateConfig)).map(
      ({ key }) => key,
    );
    const pending = new Map<string, unknown>();
    for (const key of this.privateKeys) {
      if (!key.endsWith(DEMO_DELETION_SUFFIX)) continue;
      const demoKey = key.slice(
        privateConfig.prefix.length,
        -DEMO_DELETION_SUFFIX.length,
      );
      const value = (await this.store.read(
        demoKey,
        DEMO_DELETION_SUFFIX,
      )) as DemoDeletionPlan | null;
      if (
        !value ||
        value.version !== 1 ||
        value.demoKey !== demoKey ||
        !isPublishedDemoKey(demoKey) ||
        demoKey.startsWith("users/") ||
        !(value.sourceETag === null || typeof value.sourceETag === "string") ||
        !Array.isArray(value.guids) ||
        value.guids.some((guid) => !/^[1-9]\d*$/.test(guid)) ||
        !Array.isArray(value.clipIds) ||
        value.clipIds.some((id) => !CLIP_ID.test(id)) ||
        !Array.isArray(value.privateObjects) ||
        value.privateObjects.some(
          (object) =>
            typeof object !== "string" ||
            !ownsSidecar(object, `${privateConfig.prefix}${demoKey}`),
        )
      )
        throw new Error(`Invalid deletion journal: ${key}`);
      this.journals.set(demoKey, value);
      pending.set(demoKey, value.metadata);
    }
    return pending;
  }

  private async sourceETag(demoKey: string): Promise<string | null> {
    const { client, config } = this.options;
    try {
      const source = await client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: `${config.prefix}${demoKey}`,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!source.ETag) throw new Error(`Recording has no ETag: ${demoKey}`);
      return source.ETag;
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async plan(demoKey: string, metadata: unknown): Promise<DemoDeletionPlan> {
    if (!isPublishedDemoKey(demoKey) || demoKey.startsWith("users/"))
      throw new Error(`Not a MapGenius recording: ${demoKey}`);
    const { database, privateConfig } = this.options;
    const previous = this.journals.get(demoKey);
    const sourceETag = await this.sourceETag(demoKey);
    if (previous && sourceETag !== null && sourceETag !== previous.sourceETag)
      throw new Error(`Recording replaced since deletion began: ${demoKey}`);
    const guids = new Set([
      ...(previous?.guids ?? []),
      ...(this.memberships.guidsForDemo(demoKey) ?? []),
    ]);
    const guidData = await this.store.read(demoKey, DEMO_GUIDS_SUFFIX);
    if (guidData !== null)
      for (const guid of Object.keys(readDemoGuidSidecar(guidData).namesByGuid))
        guids.add(guid);
    const stats = (await this.store.read(demoKey, DEMO_STATS_SUFFIX)) as {
      statsByGuid?: unknown;
    } | null;
    if (stats !== null) {
      if (
        !stats.statsByGuid ||
        typeof stats.statsByGuid !== "object" ||
        Array.isArray(stats.statsByGuid)
      )
        throw new Error(`Invalid player stats inventory: ${demoKey}`);
      for (const guid of Object.keys(stats.statsByGuid))
        if (/^[1-9]\d*$/.test(guid)) guids.add(guid);
    }
    // Older deletions may have lost both inventories. Rebuild all known derived
    // rows rather than leave an untraceable best score behind.
    if (!previous && !guidData && !stats && isPublishedDemoKey(demoKey))
      for (const guid of database
        .prepare(
          "SELECT guid FROM t2PlayerProfile UNION SELECT guid FROM t2PlayerBestMap",
        )
        .pluck()
        .all() as string[])
        guids.add(guid);
    const clipIds = new Set(previous?.clipIds);
    for (const id of database
      .prepare("SELECT id FROM clip WHERE sourceDemo=?")
      .pluck()
      .all(demoKey) as string[])
      clipIds.add(id);
    if ([...clipIds].some((id) => !CLIP_ID.test(id)))
      throw new Error(`Invalid dependent clip ID: ${demoKey}`);
    const prefix = `${privateConfig.prefix}${demoKey}`;
    const privateObjects = new Set(previous?.privateObjects);
    for (const key of this.privateKeys)
      if (ownsSidecar(key, prefix)) privateObjects.add(key);
    for (const suffix of [
      DEMO_GUIDS_SUFFIX,
      DEMO_STATS_SUFFIX,
      DEMO_PROFILES_SUFFIX,
    ])
      privateObjects.add(`${prefix}${suffix}`);
    return {
      version: 1,
      demoKey,
      metadata: previous?.metadata ?? metadata,
      sourceETag: previous?.sourceETag ?? sourceETag,
      guids: [...guids],
      clipIds: [...clipIds],
      privateObjects: [...privateObjects],
    };
  }

  async persist(plan: DemoDeletionPlan): Promise<void> {
    const current = await this.sourceETag(plan.demoKey);
    if (current !== null && current !== plan.sourceETag)
      throw new Error(`Recording changed before deletion: ${plan.demoKey}`);
    await this.store.put(plan.demoKey, DEMO_DELETION_SUFFIX, plan);
  }

  private async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += 1000) {
      const result = await this.options.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.slice(start, start + 1000).map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
        { abortSignal: AbortSignal.timeout(60_000) },
      );
      if (result.Errors?.length)
        throw new Error(
          `Object deletion failed: ${result.Errors.map(({ Key, Code }) => `${Key}: ${Code}`).join(", ")}`,
        );
    }
  }

  async removeDependencies(plan: DemoDeletionPlan): Promise<void> {
    const { database, config, privateConfig, client } = this.options;
    if ((await this.sourceETag(plan.demoKey)) !== null)
      throw new Error(
        `Recording still exists; dependent data retained: ${plan.demoKey}`,
      );
    database.transaction(() => {
      this.memberships.remove(plan.demoKey);
      database
        .prepare("UPDATE clip SET state='deleting' WHERE sourceDemo=?")
        .run(plan.demoKey);
    })();
    await this.deleteObjects(privateConfig.bucket, plan.privateObjects);
    for (const id of plan.clipIds) {
      const prefix = `${config.prefix}clips/${id}/`;
      const keys = new Set([
        `${prefix}timeline.json`,
        `${prefix}checkpoint.json`,
        ...(await listAllObjects(client, config, prefix)).map(({ key }) => key),
      ]);
      await this.deleteObjects(config.bucket, [...keys]);
      database
        .prepare(
          "DELETE FROM clip WHERE id=? AND sourceDemo=? AND state='deleting'",
        )
        .run(id, plan.demoKey);
    }
  }

  async prepareProfiles(
    plans: DemoDeletionPlan[],
    index: DemoMetadata[],
  ): Promise<() => void> {
    const guids = [...new Set(plans.flatMap((plan) => plan.guids))];
    if (!guids.length) return () => {};
    const { client, config } = this.options;
    const sources = new Map(
      (await listAllObjects(client, config)).map(({ key, etag }) => [
        key,
        etag,
      ]),
    );
    const sourceETags = new Map<string, string>();
    for (const record of index) {
      const key = `${config.prefix}${record.filename}`;
      if (!sources.has(key))
        throw new Error(`Surviving demo is missing: ${record.filename}`);
      const etag = sources.get(key) ?? (await this.sourceETag(record.filename));
      if (!etag)
        throw new Error(
          `Surviving demo has no source fingerprint: ${record.filename}`,
        );
      sourceETags.set(record.filename, etag);
    }
    const result = await prepareDemoDeletionProfiles({
      database: this.options.database,
      store: this.store,
      index,
      guids,
      sourceETags,
    });
    return result.commit;
  }

  async finish(plan: DemoDeletionPlan): Promise<void> {
    await this.store.delete(plan.demoKey, DEMO_DELETION_SUFFIX);
  }

  close(): void {
    this.options.database.close();
  }
}

export function openDemoDeletionCleanup({
  databasePath,
  write,
  config,
  client,
}: {
  databasePath?: string;
  write: boolean;
  config: DemoUploadConfig;
  client: S3Client;
}): DemoDeletionCleanup {
  if (!databasePath)
    throw new Error(
      "Set --database=FILE or AUTH_DATABASE_PATH to the account database belonging to this demo bucket.",
    );
  const privateConfig = loadPrivateDemoStorageConfig();
  if (!privateConfig)
    throw new Error(
      "Missing DEMO_PRIVATE_R2_BUCKET; full demo cleanup requires private storage.",
    );
  const filename = path.resolve(databasePath);
  const database = new Database(filename, {
    readonly: !write,
    fileMustExist: true,
  });
  try {
    if (hasPendingAccountSchemaMigrations(database))
      throw new Error(
        "Account database must be migrated by the updated relay before deleting demos.",
      );
    console.error(
      JSON.stringify({
        database: filename,
        publicBucket: config.bucket,
        privateBucket: privateConfig.bucket,
        mode: write ? "delete" : "dry-run",
      }),
    );
    return new DemoDeletionCleanup({ database, config, privateConfig, client });
  } catch (error) {
    database.close();
    throw error;
  }
}
