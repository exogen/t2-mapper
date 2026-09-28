import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";

// Exercise the real SDK serializer/signature path without contacting R2.
const mocks = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...sdk,
    S3Client: class extends sdk.S3Client {
      constructor(config: import("@aws-sdk/client-s3").S3ClientConfig) {
        super({ ...config, requestHandler: { handle: mocks.handle } });
      }
    },
  };
});
vi.mock("./logger", () => ({
  demoLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { DemoSourceCache } from "./demoSourceCache";
import { resolveRemoteDemo } from "./demoSources";
import { buildHeader } from "./demoWriter";

afterEach(() => vi.unstubAllGlobals());

it("starts one plain streaming PUT before the source finishes downloading", async () => {
  const header = buildHeader(3);
  const tail = new Uint8Array([1, 2, 3]);
  const size = header.length + tail.length;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              controller = c;
              c.enqueue(header);
            },
          }),
          { headers: { "Content-Length": String(size) } },
        ),
    ),
  );
  let uploadStarted = false;
  let uploaded: Buffer | undefined;
  let sidecar: unknown;
  mocks.handle.mockImplementation(async (request) => {
    if (request.method === "HEAD")
      return {
        response: { statusCode: 404, headers: {}, body: Readable.from([]) },
      };
    expect(request.method).toBe("PUT");
    expect(request.query).not.toHaveProperty("uploadId");
    expect(request.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(request.headers["content-encoding"]).toBeUndefined();
    expect(request.headers["transfer-encoding"]).toBeUndefined();
    if (request.path.endsWith(".rec")) {
      expect(request.headers["content-length"]).toBe(String(size));
      expect(request.headers["x-amz-content-sha256"]).toBe("UNSIGNED-PAYLOAD");
      expect(request.body).toBeInstanceOf(Readable);
      uploadStarted = true;
      const chunks: Buffer[] = [];
      for await (const chunk of request.body) chunks.push(chunk);
      uploaded = Buffer.concat(chunks);
    } else {
      expect(uploaded).toHaveLength(size);
      sidecar = JSON.parse(request.body);
    }
    return {
      response: {
        statusCode: 200,
        headers: { etag: '"test"' },
        body: Readable.from([]),
      },
    };
  });
  const pending = new DemoSourceCache(
    {
      endpoint: "https://r2.example",
      bucket: "demos",
      prefix: "demos/",
      accessKeyId: "test",
      secretAccessKey: "test",
    },
    "https://demos.example/demos",
  ).ensure(resolveRemoteDemo("tribesforever", "22945"));
  await vi.waitFor(() => expect(uploadStarted).toBe(true));
  expect(uploaded).toBeUndefined();
  controller.enqueue(tail);
  controller.close();
  expect(await pending).toBe(
    "https://demos.example/demos/sources/tribesforever/22945.rec",
  );
  expect(uploaded).toEqual(Buffer.concat([header, tail]));
  expect(sidecar).toMatchObject({ gameVersion: 25034 });
  expect(
    mocks.handle.mock.calls.filter(([request]) => request.method === "PUT"),
  ).toHaveLength(2);
});
