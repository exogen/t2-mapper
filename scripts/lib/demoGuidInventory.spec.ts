import { describe, expect, it, vi } from "vitest";
import {
  DEMO_GUIDS_SUFFIX,
  type DemoGuidSidecar,
} from "../../relay/demoGuids.js";
import { collectDemoGuidInventory } from "./demoGuidInventory.js";

describe("private demo GUID inventory", () => {
  it("can restrict automatic reads to available published sidecars", async () => {
    const store = {
      listDemoKeys: vi.fn(async () => ["published.rec", "orphan.rec"]),
      read: vi.fn(async (key: string) => {
        if (key === "orphan.rec") throw new Error("Corrupt orphan");
        return { namesByGuid: { "123": [] } };
      }),
    };
    const inventory = await collectDemoGuidInventory(store, {
      concurrency: 16,
      includeDemoKeys: new Set([
        "published.rec",
        "historical-without-guids.rec",
      ]),
    });
    expect(inventory.namesByGuid).toEqual({ "123": [] });
    expect(inventory.sidecarCount).toBe(1);
    expect(inventory.failed).toBe(0);
    expect(store.read).toHaveBeenCalledExactlyOnceWith(
      "published.rec",
      DEMO_GUIDS_SUFFIX,
    );
  });

  it("rejects cancellation without reporting it as a corrupt inventory entry", async () => {
    const abort = new AbortController();
    const reason = new Error("Stopped");
    const onError = vi.fn();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const store = {
      listDemoKeys: vi.fn(async () => ["a.rec", "b.rec"]),
      read: vi.fn(async () => {
        started();
        await gate;
        return { namesByGuid: { "123": [] } };
      }),
    };
    const pending = collectDemoGuidInventory(store, {
      concurrency: 1,
      signal: abort.signal,
      onError,
    });
    const rejected = expect(pending).rejects.toBe(reason);
    await reading;
    abort.abort(reason);
    release();
    await rejected;
    expect(store.read).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("deduplicates GUIDs and names while retaining GUIDs without names", async () => {
    const stored = new Map<string, DemoGuidSidecar>([
      ["a.rec", { namesByGuid: { "123": ["Zulu", "Alpha"], "999": [] } }],
      [
        "users/owner/b.rec",
        { namesByGuid: { "123": ["Alpha"], "456": ["Beta"] } },
      ],
    ]);
    const store = {
      listDemoKeys: vi.fn(async () => [...stored.keys()]),
      read: vi.fn(async (key: string) => stored.get(key)),
    };
    const inventory = await collectDemoGuidInventory(store, {
      concurrency: 16,
    });
    expect(inventory.namesByGuid).toEqual({
      "123": ["Alpha", "Zulu"],
      "456": ["Beta"],
      "999": [],
    });
    expect(inventory.sidecars).toEqual(stored);
    expect(inventory.failed).toBe(0);
    expect(inventory.sidecarCount).toBe(2);
    expect(store.listDemoKeys).toHaveBeenCalledExactlyOnceWith(
      DEMO_GUIDS_SUFFIX,
    );
    expect(store.read.mock.calls).toEqual([
      ["a.rec", DEMO_GUIDS_SUFFIX],
      ["users/owner/b.rec", DEMO_GUIDS_SUFFIX],
    ]);
  });

  it("reports missing, corrupt and failed reads and returns the valid partial inventory", async () => {
    const networkError = new Error("Offline");
    const onError = vi.fn();
    const store = {
      listDemoKeys: async () => [
        "valid.rec",
        "missing.rec",
        "corrupt.rec",
        "failed.rec",
      ],
      read: vi.fn(async (key: string) => {
        if (key === "valid.rec") return { namesByGuid: { "123": ["Alpha"] } };
        if (key === "missing.rec") return null;
        if (key === "corrupt.rec") return { namesByGuid: { "456": "Beta" } };
        throw networkError;
      }),
    };
    const inventory = await collectDemoGuidInventory(store, {
      concurrency: 2,
      onError,
    });
    expect(inventory.namesByGuid).toEqual({ "123": ["Alpha"] });
    expect([...inventory.sidecars.keys()]).toEqual(["valid.rec"]);
    expect(inventory.failed).toBe(3);
    expect(inventory.sidecarCount).toBe(4);
    expect(onError).toHaveBeenCalledWith("missing.rec", expect.any(Error));
    expect(onError).toHaveBeenCalledWith("corrupt.rec", expect.any(Error));
    expect(onError).toHaveBeenCalledWith("failed.rec", networkError);
    expect(store.read).toHaveBeenCalledTimes(4);
  });

  it("limits simultaneous reads and fetches each sidecar once", async () => {
    const pending = new Map<string, (value: DemoGuidSidecar) => void>();
    const store = {
      listDemoKeys: async () => ["a.rec", "b.rec", "c.rec", "d.rec"],
      read: vi.fn(
        (key: string) =>
          new Promise<DemoGuidSidecar>((resolve) => pending.set(key, resolve)),
      ),
    };
    const inventory = collectDemoGuidInventory(store, { concurrency: 2 });
    await vi.waitFor(() => expect(store.read).toHaveBeenCalledTimes(2));
    expect([...pending.keys()]).toEqual(["a.rec", "b.rec"]);
    pending.get("a.rec")!({ namesByGuid: { "123": ["Alpha"] } });
    await vi.waitFor(() => expect(store.read).toHaveBeenCalledTimes(3));
    expect(pending.has("d.rec")).toBe(false);
    pending.get("b.rec")!({ namesByGuid: { "456": [] } });
    await vi.waitFor(() => expect(store.read).toHaveBeenCalledTimes(4));
    pending.get("c.rec")!({ namesByGuid: { "123": ["Beta"] } });
    pending.get("d.rec")!({ namesByGuid: {} });
    expect((await inventory).namesByGuid).toEqual({
      "123": ["Alpha", "Beta"],
      "456": [],
    });
    expect(store.read.mock.calls.map(([key]) => key)).toEqual([
      "a.rec",
      "b.rec",
      "c.rec",
      "d.rec",
    ]);
  });

  it("returns an empty inventory without starting workers when no sidecars exist", async () => {
    const store = { listDemoKeys: async () => [], read: vi.fn() };
    expect(await collectDemoGuidInventory(store, { concurrency: 16 })).toEqual({
      sidecars: new Map(),
      namesByGuid: {},
      failed: 0,
      sidecarCount: 0,
    });
    expect(store.read).not.toHaveBeenCalled();
  });
});
