import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeSyncReport,
  syncAssets,
  type AssetSyncOptions,
  type AssetSyncState,
  type AssetSyncStore,
  type RemoteAsset,
  type StoredSyncState,
} from "./assetSync.js";
import { metadataFor, precompressedMetadataFor } from "./assetMetadata.js";

function remote(content: string | Buffer): RemoteAsset {
  return {
    size: Buffer.byteLength(content),
    etag: `"${createHash("md5").update(content).digest("hex")}"`,
  };
}

describe("asset synchronization", () => {
  let source: string;
  let state: StoredSyncState | undefined;
  let objects: Map<string, RemoteAsset>;
  let store: AssetSyncStore;
  let options: AssetSyncOptions;
  let revision: number;
  beforeEach(async () => {
    source = await fs.mkdtemp(path.join(os.tmpdir(), "asset-sync-test-"));
    await fs.writeFile(path.join(source, "tree.dts"), "tree");
    await fs.writeFile(path.join(source, "map.cs"), "code");
    state = undefined;
    revision = 0;
    objects = new Map([
      ["tree.dts", remote("tree")],
      ["tree.dts.br", remote("packed tree")],
      ["map.cs", remote("code")],
    ]);
    store = {
      readState: vi.fn(async () => structuredClone(state)),
      writeState: vi.fn(
        async (value: AssetSyncState, previousEtag?: string) => {
          expect(previousEtag).toBe(state?.etag);
          state = {
            value: structuredClone(value),
            etag: `"revision-${++revision}"`,
          };
          return state.etag;
        },
      ),
      list: vi.fn(async () => new Map(objects)),
      upload: vi.fn(async (key, file) => {
        objects.set(key, remote(await fs.readFile(file)));
      }),
      updateMetadata: vi.fn(async () => {}),
      delete: vi.fn(async (keys) => {
        for (const key of keys) objects.delete(key);
      }),
    };
    options = {
      source,
      files: ["map.cs", "tree.dts"],
      bucketUrl: "s3://assets/game/base/",
      fingerprint: "A",
      policy: "headers-A",
      compression: "br:11",
      precompress: true,
      concurrency: 2,
      store,
      log: vi.fn(),
      compress: vi.fn(async (file) => {
        const output = path.join(source, `${file}.br`);
        await fs.writeFile(
          output,
          `packed ${await fs.readFile(path.join(source, file), "utf8")}`,
        );
        return output;
      }),
    };
  });
  afterEach(async () => {
    await fs.rm(source, { recursive: true, force: true });
  });

  it("bootstraps from one listing, then skips unchanged assets with one state read", async () => {
    const first = await syncAssets(options);
    expect(first).toMatchObject({ skipped: false, uploads: 0, report: "" });
    expect(store.list).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    expect(await syncAssets(options)).toMatchObject({
      skipped: true,
      report: "",
    });
    expect(store.readState).toHaveBeenCalledTimes(1);
    expect(store.list).not.toHaveBeenCalled();
    expect(store.writeState).not.toHaveBeenCalled();
    expect(options.compress).not.toHaveBeenCalled();
  });

  it("detects same-size edits even with older timestamps; uploads raw and br with explicit headers", async () => {
    await syncAssets(options);
    await fs.writeFile(path.join(source, "tree.dts"), "TREE");
    await fs.utimes(path.join(source, "tree.dts"), 0, 0);
    const result = await syncAssets({ ...options, fingerprint: "B" });
    expect(result.uploads).toBe(2);
    expect(store.list).toHaveBeenCalledTimes(2);
    expect(store.upload).toHaveBeenCalledWith(
      "tree.dts",
      path.join(source, "tree.dts"),
      metadataFor("tree.dts"),
    );
    expect(store.upload).toHaveBeenCalledWith(
      "tree.dts.br",
      path.join(source, "tree.dts.br"),
      precompressedMetadataFor("tree.dts"),
    );
    expect(result.report).toContain("to s3://assets/game/base/tree.dts.br");
    expect(state?.value.fingerprint).toBe("B");
  });

  it("ignores a fresh checkout's timestamps when contents match", async () => {
    await fs.utimes(path.join(source, "tree.dts"), new Date(), new Date());
    expect((await syncAssets(options)).uploads).toBe(0);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it("force-sync discovers a raw object removed manually", async () => {
    await syncAssets(options);
    objects.delete("map.cs");
    expect((await syncAssets(options)).skipped).toBe(true);
    expect((await syncAssets({ ...options, forceSync: true })).uploads).toBe(1);
    expect(objects.has("map.cs")).toBe(true);
  });

  it("repairs a missing compressed sibling without re-uploading its source", async () => {
    objects.delete("tree.dts.br");
    expect((await syncAssets(options)).uploads).toBe(1);
    expect(store.upload).toHaveBeenCalledTimes(1);
    expect(store.upload).toHaveBeenCalledWith(
      "tree.dts.br",
      expect.any(String),
      precompressedMetadataFor("tree.dts"),
    );
  });

  it("refreshes metadata without uploading or recompressing unchanged contents", async () => {
    await syncAssets(options);
    const result = await syncAssets({
      ...options,
      fingerprint: "B",
      policy: "headers-B",
    });
    expect(result).toMatchObject({ uploads: 0, metadataUpdates: 3 });
    expect(store.updateMetadata).toHaveBeenCalledWith(
      "tree.dts.br",
      precompressedMetadataFor("tree.dts"),
    );
    expect(options.compress).not.toHaveBeenCalled();
  });

  it("rebuilds siblings when compression settings change", async () => {
    await syncAssets(options);
    expect(
      (await syncAssets({ ...options, fingerprint: "B", compression: "br:10" }))
        .uploads,
    ).toBe(1);
  });

  it("retries failed metadata updates without recompressing unchanged assets", async () => {
    await syncAssets(options);
    const next = { ...options, fingerprint: "B", policy: "headers-B" };
    vi.mocked(store.updateMetadata).mockRejectedValueOnce(
      new Error("copy failed"),
    );
    await expect(syncAssets(next)).rejects.toThrow("copy failed");
    expect(state?.value.fingerprint).toBeUndefined();
    const retry = await syncAssets(next);
    expect(retry).toMatchObject({ uploads: 0, metadataUpdates: 3 });
    expect(options.compress).not.toHaveBeenCalled();
    expect(state?.value.fingerprint).toBe("B");
  });

  it("prunes removed formats and their siblings but preserves unknown and ignored files", async () => {
    for (const key of [
      "old.glb",
      "old.DTS",
      "old.DTS.br",
      "notes.txt",
      "fonts/old.png",
      "mystery.bin",
      "notes.txt.br",
    ])
      objects.set(key, remote("old"));
    const result = await syncAssets({ ...options, allowLargePrune: true });
    expect(result.deletions).toBe(3);
    expect(store.delete).toHaveBeenCalledWith([
      "old.DTS",
      "old.DTS.br",
      "old.glb",
    ]);
    for (const key of [
      "notes.txt",
      "fonts/old.png",
      "mystery.bin",
      "notes.txt.br",
    ])
      expect(objects.has(key)).toBe(true);
  });

  it("guards all bulk deletions before any mutations", async () => {
    objects.set("old.glb", remote("old"));
    await expect(syncAssets(options)).rejects.toThrow("--allow-large-prune");
    expect(store.writeState).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("never changes R2 or compresses files in a dry run", async () => {
    objects.clear();
    const result = await syncAssets({ ...options, dryRun: true });
    expect(result.uploads).toBe(3);
    expect(result.report).toContain("(dryrun) upload:");
    expect(store.writeState).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(options.compress).not.toHaveBeenCalled();
  });

  it("does not touch siblings with --no-precompress", async () => {
    objects.set("old.dts.br", remote("old"));
    await fs.writeFile(path.join(source, "tree.dts"), "TREE");
    expect(
      await syncAssets({ ...options, precompress: false, compression: "none" }),
    ).toMatchObject({ uploads: 1, deletions: 0 });
    expect(options.compress).not.toHaveBeenCalled();
    expect(objects.get("tree.dts.br")).toEqual(remote("packed tree"));
  });

  it("fails closed on a listing error", async () => {
    vi.mocked(store.list).mockRejectedValue(new Error("listing failed"));
    await expect(syncAssets(options)).rejects.toThrow("listing failed");
    expect(store.writeState).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("repairs a stale sibling after interruption even if the raw upload already succeeded", async () => {
    await syncAssets(options);
    await fs.writeFile(path.join(source, "tree.dts"), "TREE");
    const upload = store.upload;
    store.upload = vi.fn(async (key, file, metadata) => {
      if (key.endsWith(".br")) throw new Error("sibling upload failed");
      await upload(key, file, metadata);
    });
    await expect(
      syncAssets({ ...options, fingerprint: "B", concurrency: 1 }),
    ).rejects.toThrow("sibling upload failed");
    expect(state?.value.fingerprint).toBeUndefined();
    expect(objects.get("tree.dts")).toEqual(remote("TREE"));
    store.upload = upload;
    const result = await syncAssets({ ...options, fingerprint: "B" });
    expect(result.uploads).toBe(1);
    expect(objects.get("tree.dts.br")).toEqual(remote("packed TREE"));
    expect(result.report).toContain("to s3://assets/game/base/tree.dts\n");
  });

  it("does not incorrectly skip a rollback after a partial deployment", async () => {
    await syncAssets(options);
    await fs.writeFile(path.join(source, "tree.dts"), "TREE");
    vi.mocked(options.compress).mockRejectedValueOnce(
      new Error("compression failed"),
    );
    await expect(
      syncAssets({ ...options, fingerprint: "B", concurrency: 1 }),
    ).rejects.toThrow("compression failed");
    await fs.writeFile(path.join(source, "tree.dts"), "tree");
    expect((await syncAssets(options)).skipped).toBe(false);
    expect(objects.get("tree.dts")).toEqual(remote("tree"));
    expect(objects.get("tree.dts.br")).toEqual(remote("packed tree"));
  });

  it("retains the purge report across retries, clearing it only after acknowledgment", async () => {
    objects.delete("map.cs");
    const result = await syncAssets(options);
    const retry = await syncAssets(options);
    expect(retry).toMatchObject({ skipped: true, report: result.report });
    await expect(
      acknowledgeSyncReport(store, result.report.split("\n")[0] + "\n"),
    ).rejects.toThrow("refusing");
    await acknowledgeSyncReport(store, result.report);
    expect((await syncAssets(options)).report).toBe("");
    vi.clearAllMocks();
    await acknowledgeSyncReport(store, "");
    expect(store.readState).not.toHaveBeenCalled();
  });

  it("does not save success after an individual delete failure", async () => {
    objects.set("old.glb", remote("old"));
    vi.mocked(store.delete).mockRejectedValueOnce(new Error("delete failed"));
    await expect(
      syncAssets({ ...options, allowLargePrune: true }),
    ).rejects.toThrow("delete failed");
    expect(state?.value.fingerprint).toBeUndefined();
    expect(state?.value.report.some((line) => line.includes("old.glb"))).toBe(
      true,
    );
  });

  it("waits for active uploads to settle before returning a failure", async () => {
    objects.clear();
    let finish: () => void = () => {};
    let started: () => void = () => {};
    const active = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    store.upload = vi.fn(async (key) => {
      if (key === "map.cs") {
        await active;
        throw new Error("failed");
      }
      started();
      await blocked;
    });
    let settled = false;
    const running = syncAssets(options).catch(() => {
      settled = true;
    });
    await active;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    finish();
    await running;
    expect(settled).toBe(true);
    expect(state?.value.fingerprint).toBeUndefined();
  });
});
