import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";
import { handleDemoDownload } from "./demoDownload";
import { resolveDemoSource } from "../src/stream/demoSources";

vi.mock("./logger", () => ({
  relayLog: { child: () => ({ info: vi.fn(), warn: vi.fn() }) },
}));

it("polls over HTTP, follows the ready redirect, and reads the cached bytes", async () => {
  let ready!: (url: string) => void;
  const imported = new Promise<string>((resolve) => {
    ready = resolve;
  });
  const cache = { ensure: vi.fn(() => imported) };
  const statuses: number[] = [];
  const server = createServer((req, res) => {
    if (req.url === "/cached.rec") {
      res.end("cached demo bytes");
      return;
    }
    res.once("finish", () => {
      statuses.push(res.statusCode);
      if (res.statusCode === 202) ready(`${base}/cached.rec`);
    });
    void handleDemoDownload(req, res, false, cache);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv("RELAY_URL", base);
  try {
    const response = await resolveDemoSource("tribesforever:22945").load(
      new AbortController().signal,
    );
    expect(response.url).toBe(`${base}/cached.rec`);
    expect(await response.text()).toBe("cached demo bytes");
    expect(statuses).toEqual([202, 302]);
    expect(cache.ensure).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}, 10_000);
