import fs from "node:fs/promises";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoLog } from "./logger";
import { DEMO_STATS_VERSION, type DemoStatsSidecar } from "./demoPlayerStats";
import {
  DEMO_PROFILES_SUFFIX,
  DEMO_STATS_SUFFIX,
  PROFILE_REFRESH_VERSION,
} from "./demoStats";
import { DEMO_GUIDS_SUFFIX } from "./demoGuids";
import { DemoStatsScheduler } from "./demoStatsScheduler";
import type { PrivateDemoStore } from "./privateDemoStore";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const DAY = 24 * 60 * 60_000;
const NOW = 100 * DAY;
const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "t2-demos",
  accessKeyId: "key",
  secretAccessKey: "secret",
  prefix: "demos/",
};

function missing(): Error {
  return Object.assign(new Error("Missing"), { name: "NoSuchKey" });
}

function fixture({
  objects = new Map<string, { body: string; at: number; etag?: string }>(),
  stats = new Set<string>(),
  saved = new Map<string, unknown>(),
  refreshProfiles,
  readNamesByGuid,
  now = () => NOW,
  retryDelayMs,
  firstSweepDelayMs,
  sweepIntervalMs,
  compute = vi.fn(async (file: string): Promise<DemoStatsSidecar> => ({
    version: DEMO_STATS_VERSION,
    statsByGuid: { [await fs.readFile(file, "utf8")]: {} as never },
  })),
}: {
  objects?: Map<string, { body: string; at: number; etag?: string }>;
  stats?: Set<string>;
  saved?: Map<string, unknown>;
  compute?: ReturnType<
    typeof vi.fn<(file: string) => Promise<DemoStatsSidecar>>
  >;
  refreshProfiles?: (
    demoKey: string,
    stats: DemoStatsSidecar,
    signal: AbortSignal,
  ) => Promise<void>;
  readNamesByGuid?: (
    file: string,
    signal?: AbortSignal,
  ) => Promise<Record<string, string[]>>;
  now?: () => number;
  retryDelayMs?: number;
  firstSweepDelayMs?: number;
  sweepIntervalMs?: number;
} = {}) {
  const client = {
    send: vi.fn(async (command: unknown) => {
      if (command instanceof ListObjectsV2Command)
        return {
          Contents: [...objects].map(([Key, { at, etag }]) => ({
            Key,
            LastModified: new Date(at),
            ETag: etag,
          })),
        };
      const key = (command as GetObjectCommand | HeadObjectCommand).input.Key!;
      const object = objects.get(key);
      if (!object) throw missing();
      if (command instanceof GetObjectCommand)
        return {
          Body: Readable.from([Buffer.from(object.body)]),
          ETag: object.etag,
        };
      return { ETag: object.etag };
    }),
  } as unknown as S3Client;
  const store = {
    listDemoKeys: vi.fn(async (suffix: string) => [
      ...new Set([
        ...(suffix === DEMO_STATS_SUFFIX ? stats : []),
        ...[...saved.keys()]
          .filter((key) => key.endsWith(suffix))
          .map((key) => key.slice(0, -suffix.length)),
      ]),
    ]),
    read: vi.fn(
      async (demoKey: string, suffix: string) =>
        saved.get(`${demoKey}${suffix}`) ??
        (suffix === DEMO_STATS_SUFFIX && stats.has(demoKey)
          ? { version: DEMO_STATS_VERSION, statsByGuid: {} }
          : null),
    ),
    delete: vi.fn(async (demoKey: string, suffix: string) => {
      saved.delete(`${demoKey}${suffix}`);
    }),
    put: vi.fn(async (demoKey: string, suffix: string, value: unknown) => {
      saved.set(`${demoKey}${suffix}`, value);
    }),
  } as unknown as PrivateDemoStore;
  const scheduler = new DemoStatsScheduler({
    config,
    store,
    compute,
    client,
    now,
    refreshProfiles,
    readNamesByGuid,
    retryDelayMs,
    firstSweepDelayMs,
    sweepIntervalMs,
  });
  return { scheduler, saved, objects, compute, client, store };
}

describe("DemoStatsScheduler", () => {
  it("saves stats computed from each queued recording, once per key", async () => {
    const { scheduler, saved, objects, compute } = fixture();
    objects.set("demos/a.rec", { body: "from-a", at: NOW });
    objects.set("demos/users/123456789012345678/b.rec", {
      body: "from-b",
      at: NOW,
    });
    scheduler.enqueue("a.rec");
    scheduler.enqueue("a.rec");
    scheduler.enqueue("users/123456789012345678/b.rec");
    scheduler.enqueue("sources/tribesforever/c.rec");
    await scheduler.idle();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(Object.fromEntries(saved)).toEqual({
      "a.rec.stats.json": {
        version: DEMO_STATS_VERSION,
        statsByGuid: { "from-a": {} },
      },
      "users/123456789012345678/b.rec.stats.json": {
        version: DEMO_STATS_VERSION,
        statsByGuid: { "from-b": {} },
      },
    });
  });

  it("skips demos deleted before or during their replay", async () => {
    const { scheduler, saved, objects, compute } = fixture();
    objects.set("demos/kept.rec", { body: "kept", at: NOW });
    objects.set("demos/deleted-during.rec", { body: "x", at: NOW });
    compute.mockImplementationOnce(async () => {
      objects.delete("demos/deleted-during.rec");
      return { version: DEMO_STATS_VERSION, statsByGuid: {} };
    });
    scheduler.enqueue("deleted-during.rec");
    scheduler.enqueue("deleted-before.rec");
    scheduler.enqueue("kept.rec");
    scheduler.cancel("kept.rec");
    await scheduler.idle();
    expect(saved.size).toBe(0);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("logs worker failure and suppresses immediate retries until its cooldown", async () => {
    const { scheduler, saved, objects, compute } = fixture();
    const error = vi.spyOn(demoLog, "error").mockImplementation(() => {});
    objects.set("demos/bad.rec", { body: "bad", at: NOW });
    compute.mockRejectedValueOnce(new Error("worker crashed"));
    scheduler.enqueue("bad.rec");
    await scheduler.idle();
    scheduler.enqueue("bad.rec");
    await scheduler.idle();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(saved.size).toBe(0);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ demoKey: "bad.rec" }),
      "Demo player stats failed",
    );
  });

  it("retries a demo after a network error, unlike a failed replay", async () => {
    const { scheduler, saved, objects, client } = fixture();
    vi.spyOn(demoLog, "error").mockImplementation(() => {});
    objects.set("demos/flaky.rec", { body: "flaky", at: NOW });
    const send = vi.mocked(client.send);
    const real = send.getMockImplementation()!;
    send.mockImplementationOnce(async () => {
      throw new Error("socket hang up");
    });
    scheduler.enqueue("flaky.rec");
    await scheduler.idle();
    expect(saved.size).toBe(0);
    send.mockImplementation(real);
    scheduler.enqueue("flaky.rec");
    await scheduler.idle();
    expect([...saved.keys()]).toEqual(["flaky.rec.stats.json"]);
  });

  it("sweeps recent published demos without stats, newest first", async () => {
    const { scheduler, objects, compute } = fixture({
      stats: new Set(["done.rec"]),
    });
    const order: string[] = [];
    compute.mockImplementation(async (file) => {
      order.push(await fs.readFile(file, "utf8"));
      return { version: DEMO_STATS_VERSION, statsByGuid: {} };
    });
    objects.set("demos/older.rec", { body: "older", at: NOW - 2 * DAY });
    objects.set("demos/newer.rec", { body: "newer", at: NOW - DAY });
    objects.set("demos/done.rec", { body: "done", at: NOW });
    objects.set("demos/ancient.rec", { body: "ancient", at: NOW - 30 * DAY });
    objects.set("demos/newer.rec.json", { body: "{}", at: NOW });
    objects.set("demos/sources/tribesforever/x.rec", { body: "x", at: NOW });
    expect(await scheduler.sweep()).toBe(2);
    await scheduler.idle();
    expect(order).toEqual(["newer", "older"]);
  });

  it("refreshes profiles after saving stats and records successful completion", async () => {
    const refreshProfiles = vi.fn(async () => {
      expect(saved.has(`a.rec${DEMO_STATS_SUFFIX}`)).toBe(true);
      expect(saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(false);
    });
    const { scheduler, saved, objects } = fixture({ refreshProfiles });
    objects.set("demos/a.rec", { body: "101", at: NOW });
    scheduler.enqueue("a.rec");
    await scheduler.idle();
    expect(refreshProfiles).toHaveBeenCalledExactlyOnceWith(
      "a.rec",
      saved.get(`a.rec${DEMO_STATS_SUFFIX}`),
      expect.any(AbortSignal),
    );
    expect(saved.get(`a.rec${DEMO_PROFILES_SUFFIX}`)).toEqual({
      version: PROFILE_REFRESH_VERSION,
      statsVersion: DEMO_STATS_VERSION,
      updatedAt: NOW,
    });
    expect(await scheduler.sweep()).toBe(0);
  });

  it("recovers a failed profile refresh after restart without replaying saved stats", async () => {
    vi.spyOn(demoLog, "error").mockImplementation(() => {});
    const refreshProfiles = vi.fn().mockRejectedValue(new Error("SQLite busy"));
    const first = fixture({ refreshProfiles });
    first.objects.set("demos/a.rec", { body: "101", at: NOW });
    first.scheduler.enqueue("a.rec");
    await first.scheduler.idle();
    expect(first.saved.has(`a.rec${DEMO_STATS_SUFFIX}`)).toBe(true);
    expect(first.saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(false);

    const retry = vi.fn(async () => {});
    const second = fixture({
      objects: first.objects,
      saved: first.saved,
      refreshProfiles: retry,
    });
    expect(await second.scheduler.sweep()).toBe(1);
    await second.scheduler.idle();
    expect(second.compute).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
    expect(second.saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(true);
  });

  it("retries profile errors on the next sweep in the same process", async () => {
    vi.spyOn(demoLog, "error").mockImplementation(() => {});
    const refreshProfiles = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue(undefined);
    const { scheduler, objects, compute, saved } = fixture({ refreshProfiles });
    objects.set("demos/a.rec", { body: "101", at: NOW });
    scheduler.enqueue("a.rec");
    await scheduler.idle();
    expect(await scheduler.sweep()).toBe(1);
    await scheduler.idle();
    expect(compute).toHaveBeenCalledOnce();
    expect(refreshProfiles).toHaveBeenCalledTimes(2);
    expect(saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(true);
  });

  it("recomputes outdated saved stats before refreshing profiles", async () => {
    const refreshProfiles = vi.fn(async () => {});
    const { scheduler, objects, compute, saved } = fixture({ refreshProfiles });
    objects.set("demos/a.rec", { body: "101", at: NOW });
    saved.set(`a.rec${DEMO_STATS_SUFFIX}`, {
      version: DEMO_STATS_VERSION - 1,
      statsByGuid: { "999": {} },
    });
    scheduler.enqueue("a.rec");
    await scheduler.idle();
    expect(compute).toHaveBeenCalledOnce();
    expect(refreshProfiles).toHaveBeenCalledExactlyOnceWith(
      "a.rec",
      {
        version: DEMO_STATS_VERSION,
        statsByGuid: { "101": {} },
      },
      expect.any(AbortSignal),
    );
  });

  it("does not refresh deleted demos or leave a completion marker after deletion during refresh", async () => {
    const refreshProfiles = vi.fn(async () => {
      objects.delete("demos/a.rec");
    });
    const { scheduler, objects, saved } = fixture({ refreshProfiles });
    saved.set(`missing.rec${DEMO_STATS_SUFFIX}`, {
      version: DEMO_STATS_VERSION,
      statsByGuid: {},
    });
    scheduler.enqueue("missing.rec");
    objects.set("demos/a.rec", { body: "101", at: NOW });
    scheduler.enqueue("a.rec");
    await scheduler.idle();
    expect(refreshProfiles).toHaveBeenCalledOnce();
    expect(saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(false);
    expect(saved.has(`missing.rec${DEMO_PROFILES_SUFFIX}`)).toBe(false);
  });

  it.each(["stop", "cancel"] as const)(
    "does not start profile work after %s while stats are computing",
    async (action) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const refreshProfiles = vi.fn(async () => {});
      const f = fixture({ refreshProfiles });
      f.objects.set("demos/a.rec", { body: "101", at: NOW });
      f.objects.set("demos/b.rec", { body: "202", at: NOW });
      f.compute.mockImplementationOnce(async () => {
        await gate;
        return { version: DEMO_STATS_VERSION, statsByGuid: {} };
      });
      f.scheduler.enqueue("a.rec");
      if (action === "stop") f.scheduler.enqueue("b.rec");
      await vi.waitFor(() => expect(f.compute).toHaveBeenCalledOnce());
      if (action === "stop") f.scheduler.stop();
      else f.scheduler.cancel("a.rec");
      release();
      await f.scheduler.idle();
      expect(refreshProfiles).not.toHaveBeenCalled();
      expect(f.compute).toHaveBeenCalledOnce();
      expect(f.saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(false);
    },
  );

  it("does not mark stopped in-flight profile work complete", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refreshProfiles = vi.fn(async () => gate);
    const { scheduler, objects, saved } = fixture({ refreshProfiles });
    objects.set("demos/a.rec", { body: "101", at: NOW });
    scheduler.enqueue("a.rec");
    await vi.waitFor(() => expect(refreshProfiles).toHaveBeenCalledOnce());
    scheduler.stop();
    release();
    await scheduler.idle();
    expect(saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(false);
  });
});

const marker = (overrides: Record<string, unknown> = {}) => ({
  version: PROFILE_REFRESH_VERSION,
  statsVersion: DEMO_STATS_VERSION,
  updatedAt: NOW,
  ...overrides,
});
const currentStats = () => ({
  version: DEMO_STATS_VERSION,
  statsByGuid: { "101": {} as never },
});

it("invalidates an old successful marker before a refresh that can fail", async () => {
  vi.spyOn(demoLog, "error").mockImplementation(() => {});
  const refreshProfiles = vi
    .fn()
    .mockRejectedValueOnce(new Error("SQLite busy"))
    .mockResolvedValue(undefined);
  const f = fixture({ refreshProfiles });
  f.objects.set("demos/a.rec", { body: "101", at: NOW });
  f.saved.set(`a.rec${DEMO_STATS_SUFFIX}`, currentStats());
  f.saved.set(`a.rec${DEMO_PROFILES_SUFFIX}`, marker());
  f.scheduler.enqueue("a.rec");
  await f.scheduler.idle();
  expect(f.saved.has(`a.rec${DEMO_PROFILES_SUFFIX}`)).toBe(false);
  expect(await f.scheduler.sweep()).toBe(1);
  await f.scheduler.idle();
  expect(refreshProfiles).toHaveBeenCalledTimes(2);
  expect(f.compute).not.toHaveBeenCalled();
  expect(f.saved.get(`a.rec${DEMO_PROFILES_SUFFIX}`)).toEqual(marker());
});

it.each([
  [DEMO_STATS_SUFFIX, { version: DEMO_STATS_VERSION - 1, statsByGuid: {} }],
  [DEMO_PROFILES_SUFFIX, marker({ version: PROFILE_REFRESH_VERSION - 1 })],
  [DEMO_PROFILES_SUFFIX, marker({ statsVersion: DEMO_STATS_VERSION - 1 })],
  [DEMO_STATS_SUFFIX, { version: DEMO_STATS_VERSION, statsByGuid: [] }],
  [DEMO_STATS_SUFFIX, { ...currentStats(), sourceETag: 99 }],
  [DEMO_PROFILES_SUFFIX, marker({ sourceETag: 99 })],
  [DEMO_PROFILES_SUFFIX, { version: PROFILE_REFRESH_VERSION }],
])("sweeps existing but outdated or malformed %s", async (suffix, stale) => {
  const f = fixture({ refreshProfiles: vi.fn(async () => {}) });
  f.objects.set("demos/a.rec", { body: "101", at: NOW });
  f.saved.set(`a.rec${DEMO_STATS_SUFFIX}`, currentStats());
  f.saved.set(`a.rec${DEMO_PROFILES_SUFFIX}`, marker());
  f.saved.set(`a.rec${suffix}`, stale);
  expect(await f.scheduler.sweep()).toBe(1);
  await f.scheduler.idle();
  expect(f.saved.get(`a.rec${DEMO_STATS_SUFFIX}`)).toMatchObject({
    version: DEMO_STATS_VERSION,
  });
  expect(f.saved.get(`a.rec${DEMO_PROFILES_SUFFIX}`)).toEqual(marker());
});

it("repairs missing GUIDs and computes stats from one downloaded recording", async () => {
  const readNamesByGuid = vi.fn(async (file: string) => {
    expect(await fs.readFile(file, "utf8")).toBe("101");
    return { "101": ["Player"] };
  });
  const refreshProfiles = vi.fn(async () => {});
  const f = fixture({ readNamesByGuid, refreshProfiles });
  f.objects.set("demos/a.rec", { body: "101", at: NOW, etag: '"source"' });
  f.scheduler.enqueue("a.rec");
  await f.scheduler.idle();
  expect(readNamesByGuid).toHaveBeenCalledOnce();
  expect(f.compute).toHaveBeenCalledOnce();
  expect(readNamesByGuid.mock.calls[0][0]).toBe(f.compute.mock.calls[0][0]);
  expect(
    vi
      .mocked(f.client.send)
      .mock.calls.filter(([command]) => command instanceof GetObjectCommand),
  ).toHaveLength(1);
  expect(f.saved.get(`a.rec${DEMO_GUIDS_SUFFIX}`)).toEqual({
    namesByGuid: { "101": ["Player"] },
  });
  expect(f.saved.get(`a.rec${DEMO_STATS_SUFFIX}`)).toMatchObject({
    sourceETag: '"source"',
  });
  expect(f.saved.get(`a.rec${DEMO_PROFILES_SUFFIX}`)).toMatchObject({
    sourceETag: '"source"',
  });
});

it("retries a transient GUID worker failure after cooldown without replaying saved stats", async () => {
  vi.spyOn(demoLog, "error").mockImplementation(() => {});
  let now = NOW;
  const readNamesByGuid = vi
    .fn()
    .mockRejectedValueOnce(new Error("worker timeout"))
    .mockResolvedValue({ "101": [] });
  const f = fixture({ readNamesByGuid, now: () => now, retryDelayMs: 100 });
  f.objects.set("demos/a.rec", { body: "101", at: NOW });
  f.saved.set(`a.rec${DEMO_STATS_SUFFIX}`, currentStats());
  f.scheduler.enqueue("a.rec");
  await f.scheduler.idle();
  expect(await f.scheduler.sweep()).toBe(0);
  now += 100;
  expect(await f.scheduler.sweep()).toBe(1);
  await f.scheduler.idle();
  expect(readNamesByGuid).toHaveBeenCalledTimes(2);
  expect(f.compute).not.toHaveBeenCalled();
  expect(f.saved.get(`a.rec${DEMO_GUIDS_SUFFIX}`)).toEqual({
    namesByGuid: { "101": [] },
  });
});

it("lets a transient stats-worker failure recover on the hourly sweep", async () => {
  vi.spyOn(demoLog, "error").mockImplementation(() => {});
  let now = NOW;
  const f = fixture({ now: () => now });
  f.objects.set("demos/a.rec", { body: "101", at: NOW });
  f.compute.mockRejectedValueOnce(
    new Error("worker temporarily out of memory"),
  );
  f.scheduler.enqueue("a.rec");
  await f.scheduler.idle();
  expect(await f.scheduler.sweep()).toBe(0);
  now += 60 * 60_000;
  expect(await f.scheduler.sweep()).toBe(1);
  await f.scheduler.idle();
  expect(f.compute).toHaveBeenCalledTimes(2);
  expect(f.saved.has(`a.rec${DEMO_STATS_SUFFIX}`)).toBe(true);
});

it("treats corrupt stats JSON as recomputable but does not replay after a network read failure", async () => {
  vi.spyOn(demoLog, "error").mockImplementation(() => {});
  const f = fixture();
  f.objects.set("demos/a.rec", { body: "101", at: NOW });
  const read = vi.mocked(f.store.read);
  read.mockRejectedValueOnce(new SyntaxError("truncated JSON"));
  f.scheduler.enqueue("a.rec");
  await f.scheduler.idle();
  expect(f.compute).toHaveBeenCalledOnce();
  read.mockRejectedValueOnce(new Error("R2 unavailable"));
  f.scheduler.enqueue("a.rec");
  await f.scheduler.idle();
  expect(f.compute).toHaveBeenCalledOnce();
});

it.each(["cancel", "stop"] as const)(
  "does not write stats if %s arrives during the final HEAD",
  async (action) => {
    const f = fixture();
    f.objects.set("demos/a.rec", { body: "101", at: NOW });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = vi.mocked(f.client.send);
    const original = send.getMockImplementation()!;
    let heads = 0;
    let waiting = false;
    send.mockImplementation(async (...args) => {
      if (args[0] instanceof HeadObjectCommand && ++heads === 2) {
        waiting = true;
        await gate;
      }
      return original(...args);
    });
    f.scheduler.enqueue("a.rec");
    await vi.waitFor(() => expect(waiting).toBe(true));
    const canceled =
      action === "cancel"
        ? f.scheduler.cancel("a.rec")
        : (f.scheduler.stop(), Promise.resolve());
    release();
    await canceled;
    await f.scheduler.idle();
    expect(f.store.put).not.toHaveBeenCalled();
  },
);

it("cancel waits for an in-flight PUT before the publisher can delete its sidecars", async () => {
  const f = fixture();
  f.objects.set("demos/a.rec", { body: "101", at: NOW });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const put = vi.mocked(f.store.put);
  const original = put.getMockImplementation()!;
  put.mockImplementation(async (...args) => {
    await gate;
    await original(...args);
  });
  f.scheduler.enqueue("a.rec");
  await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
  let canceled = false;
  const cancel = f.scheduler.cancel("a.rec").then(() => {
    canceled = true;
  });
  await Promise.resolve();
  expect(canceled).toBe(false);
  release();
  await cancel;
  await f.store.delete("a.rec", DEMO_STATS_SUFFIX);
  await f.scheduler.idle();
  expect(f.saved.has(`a.rec${DEMO_STATS_SUFFIX}`)).toBe(false);
});

it("invalidates saved stats and GUIDs when the published recording was replaced", async () => {
  const readNamesByGuid = vi.fn(async () => ({ "202": ["Replacement"] }));
  const f = fixture({
    readNamesByGuid,
    refreshProfiles: vi.fn(async () => {}),
  });
  f.objects.set("demos/a.rec", { body: "202", at: NOW, etag: '"new"' });
  f.saved.set(`a.rec${DEMO_STATS_SUFFIX}`, {
    ...currentStats(),
    sourceETag: '"old"',
  });
  f.saved.set(`a.rec${DEMO_GUIDS_SUFFIX}`, {
    namesByGuid: { "101": ["Original"] },
  });
  f.saved.set(`a.rec${DEMO_PROFILES_SUFFIX}`, marker({ sourceETag: '"old"' }));
  expect(await f.scheduler.sweep()).toBe(1);
  await f.scheduler.idle();
  expect(f.compute).toHaveBeenCalledOnce();
  expect(readNamesByGuid).toHaveBeenCalledOnce();
  expect(f.saved.get(`a.rec${DEMO_STATS_SUFFIX}`)).toMatchObject({
    sourceETag: '"new"',
    statsByGuid: { "202": {} },
  });
  expect(f.saved.get(`a.rec${DEMO_GUIDS_SUFFIX}`)).toEqual({
    namesByGuid: { "202": ["Replacement"] },
  });
});

it("requeues source replacements during replay without publishing stale sidecars", async () => {
  vi.spyOn(demoLog, "error").mockImplementation(() => {});
  const f = fixture();
  f.objects.set("demos/a.rec", { body: "101", at: NOW, etag: '"old"' });
  f.compute.mockImplementationOnce(async () => {
    f.objects.set("demos/a.rec", { body: "202", at: NOW, etag: '"new"' });
    return currentStats();
  });
  f.scheduler.enqueue("a.rec");
  await f.scheduler.idle();
  expect(f.compute).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(f.store.put)
      .mock.calls.filter(([, suffix]) => suffix === DEMO_STATS_SUFFIX),
  ).toHaveLength(1);
  expect(f.saved.get(`a.rec${DEMO_STATS_SUFFIX}`)).toMatchObject({
    sourceETag: '"new"',
    statsByGuid: { "202": {} },
  });
});

it("coalesces overlapping sweeps and does not install duplicate timers", async () => {
  vi.useFakeTimers();
  const f = fixture({ firstSweepDelayMs: 10, sweepIntervalMs: 20 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = vi.mocked(f.client.send);
  send.mockImplementation(async () => {
    await gate;
    return { Contents: [] };
  });
  f.scheduler.start();
  f.scheduler.start();
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(10);
  const same = f.scheduler.sweep();
  await vi.advanceTimersByTimeAsync(100);
  expect(send).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  release();
  await same;
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  f.scheduler.stop();
  f.scheduler.start();
  expect(vi.getTimerCount()).toBe(0);
  expect(await f.scheduler.sweep()).toBe(0);
});

it.each([false, true])(
  "uses GET identity after HEAD replacement (existing GUIDs: %s)",
  async (existingGuids) => {
    const readNamesByGuid = vi.fn(async (file: string) => ({
      [await fs.readFile(file, "utf8")]: ["Replacement"],
    }));
    const f = fixture({ readNamesByGuid });
    f.objects.set("demos/a.rec", { body: "101", at: NOW, etag: '"old"' });
    f.saved.set(
      `a.rec${DEMO_STATS_SUFFIX}`,
      existingGuids
        ? { version: DEMO_STATS_VERSION - 1, statsByGuid: {} }
        : currentStats(),
    ); // legacy, no fingerprint
    if (existingGuids)
      f.saved.set(`a.rec${DEMO_GUIDS_SUFFIX}`, {
        namesByGuid: { "101": ["Original"] },
      });
    const send = vi.mocked(f.client.send);
    const original = send.getMockImplementation()!;
    send.mockImplementation(async (...args) => {
      if (args[0] instanceof GetObjectCommand)
        f.objects.set("demos/a.rec", { body: "202", at: NOW, etag: '"new"' });
      return original(...args);
    });
    f.scheduler.enqueue("a.rec");
    await f.scheduler.idle();
    expect(f.compute).toHaveBeenCalledOnce();
    expect(f.saved.get(`a.rec${DEMO_STATS_SUFFIX}`)).toMatchObject({
      sourceETag: '"new"',
      statsByGuid: { "202": {} },
    });
    expect(f.saved.get(`a.rec${DEMO_GUIDS_SUFFIX}`)).toEqual({
      namesByGuid: { "202": ["Replacement"] },
    });
  },
);
