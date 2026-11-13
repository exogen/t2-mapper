import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPrivateDemoStorageConfig,
  PrivateDemoStore,
} from "./privateDemoStore.js";

afterEach(() => vi.restoreAllMocks());

const demoEnv = {
  DEMO_R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  DEMO_R2_BUCKET: "t2-demos",
  DEMO_R2_ACCESS_KEY_ID: "key",
  DEMO_R2_SECRET_ACCESS_KEY: "secret",
  DEMO_R2_PREFIX: "demos/",
};

describe("loadPrivateDemoStorageConfig", () => {
  it("reuses the demo credentials and prefix for a separate bucket", () => {
    expect(
      loadPrivateDemoStorageConfig({
        ...demoEnv,
        DEMO_PRIVATE_R2_BUCKET: " t2-demos-private ",
      }),
    ).toEqual({
      endpoint: demoEnv.DEMO_R2_ENDPOINT,
      bucket: "t2-demos-private",
      accessKeyId: "key",
      secretAccessKey: "secret",
      prefix: "demos/",
    });
    expect(
      loadPrivateDemoStorageConfig({
        ...demoEnv,
        DEMO_PRIVATE_R2_BUCKET: "t2-demos-private",
        DEMO_PRIVATE_R2_PREFIX: "guids/",
      })?.prefix,
    ).toBe("guids/");
  });

  it("stays disabled without the private bucket or demo storage", () => {
    expect(loadPrivateDemoStorageConfig(demoEnv)).toBeNull();
    expect(
      loadPrivateDemoStorageConfig({ DEMO_PRIVATE_R2_BUCKET: "private" }),
    ).toBeNull();
  });

  it("refuses the publicly served demo bucket", () => {
    expect(() =>
      loadPrivateDemoStorageConfig({
        ...demoEnv,
        DEMO_PRIVATE_R2_BUCKET: "t2-demos",
      }),
    ).toThrow(/separate bucket/);
  });
});

const config = {
  endpoint: demoEnv.DEMO_R2_ENDPOINT,
  bucket: "private",
  accessKeyId: "key",
  secretAccessKey: "secret",
  prefix: "demos/",
};

type Operation = (
  store: PrivateDemoStore,
  signal?: AbortSignal,
) => Promise<unknown>;
const operations: Array<[string, Operation]> = [
  ["read", (store, signal) => store.read("a.rec", ".guids.json", signal)],
  [
    "put",
    (store, signal) =>
      store.put("a.rec", ".guids.json", { namesByGuid: {} }, signal),
  ],
  ["delete", (store, signal) => store.delete("a.rec", ".guids.json", signal)],
  ["list", (store, signal) => store.listDemoKeys(".guids.json", signal)],
];

describe("PrivateDemoStore cancellation", () => {
  it.each(operations)(
    "cancels an in-flight %s request",
    async (_name, operation) => {
      let requestSignal: AbortSignal | undefined;
      const send = vi.fn(
        (_command, { abortSignal }: { abortSignal: AbortSignal }) => {
          requestSignal = abortSignal;
          return new Promise((_resolve, reject) => {
            abortSignal.addEventListener(
              "abort",
              () => reject(abortSignal.reason),
              { once: true },
            );
          });
        },
      );
      const store = new PrivateDemoStore(config, {
        send,
      } as unknown as S3Client);
      const abort = new AbortController();
      const result = operation(store, abort.signal);
      expect(requestSignal?.aborted).toBe(false);
      const reason = new Error("Demo was deleted");
      abort.abort(reason);
      await expect(result).rejects.toBe(reason);
      expect(requestSignal?.aborted).toBe(true);
      expect(send).toHaveBeenCalledOnce();
    },
  );

  it.each(operations)(
    "does not start %s after cancellation",
    async (_name, operation) => {
      const send = vi.fn();
      const store = new PrivateDemoStore(config, {
        send,
      } as unknown as S3Client);
      const abort = new AbortController();
      const reason = new Error("Relay stopped");
      abort.abort(reason);
      await expect(operation(store, abort.signal)).rejects.toBe(reason);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("retains the request deadline when a caller supplies a live signal", async () => {
    const timeout = new AbortController();
    const deadline = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeout.signal);
    const send = vi.fn(
      (_command, { abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => reject(abortSignal.reason),
            { once: true },
          );
        }),
    );
    const store = new PrivateDemoStore(config, { send } as unknown as S3Client);
    const caller = new AbortController();
    const result = store.read("a.rec", ".guids.json", caller.signal);
    const reason = new Error("Request timed out");
    timeout.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(deadline).toHaveBeenCalledWith(30_000);
    expect(caller.signal.aborted).toBe(false);
  });

  it("does not parse a response body delivered after cancellation", async () => {
    let finish!: (body: string) => void;
    const transformToString = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const send = vi.fn(async () => ({ Body: { transformToString } }));
    const store = new PrivateDemoStore(config, { send } as unknown as S3Client);
    const abort = new AbortController();
    const result = store.read("a.rec", ".guids.json", abort.signal);
    await vi.waitFor(() => expect(transformToString).toHaveBeenCalledOnce());
    const reason = new Error("Canceled while downloading body");
    abort.abort(reason);
    finish("invalid JSON");
    await expect(result).rejects.toBe(reason);
  });

  it("does not turn cancellation into a missing-sidecar result", async () => {
    const abort = new AbortController();
    const reason = new Error("Canceled");
    const send = vi.fn(async () => {
      abort.abort(reason);
      throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
    });
    const store = new PrivateDemoStore(config, { send } as unknown as S3Client);
    await expect(store.read("a.rec", ".guids.json", abort.signal)).rejects.toBe(
      reason,
    );
  });

  it("does not request another page when a canceled listing returns late", async () => {
    const abort = new AbortController();
    const reason = new Error("Listing canceled");
    const send = vi.fn(async () => {
      abort.abort(reason);
      return {
        Contents: [{ Key: "demos/a.rec.guids.json" }],
        IsTruncated: true,
        NextContinuationToken: "next",
      };
    });
    const store = new PrivateDemoStore(config, { send } as unknown as S3Client);
    await expect(store.listDemoKeys(".guids.json", abort.signal)).rejects.toBe(
      reason,
    );
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps ordinary reads, writes, deletes and pagination working without a caller signal", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand)
        return {
          Body: {
            transformToString: async () => '{"namesByGuid":{"123":["Player"]}}',
          },
        };
      if (command instanceof ListObjectsV2Command)
        return command.input.ContinuationToken
          ? {
              Contents: [
                { Key: "demos/users/owner/b.rec.guids.json" },
                { Key: "demos/a.rec.stats.json" },
              ],
            }
          : {
              Contents: [{ Key: "demos/a.rec.guids.json" }],
              IsTruncated: true,
              NextContinuationToken: "next",
            };
      return {};
    });
    const store = new PrivateDemoStore(config, { send } as unknown as S3Client);
    await expect(store.read("a.rec", ".guids.json")).resolves.toEqual({
      namesByGuid: { "123": ["Player"] },
    });
    await store.put("a.rec", ".guids.json", { namesByGuid: {} });
    await store.delete("a.rec", ".guids.json");
    await expect(store.listDemoKeys(".guids.json")).resolves.toEqual([
      "a.rec",
      "users/owner/b.rec",
    ]);
    expect(send.mock.calls[1][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send).toHaveBeenCalledTimes(5);
  });
});
