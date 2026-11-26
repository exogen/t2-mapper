import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkPreviewFixtures } from "../scripts/lib/linkPreviewFixtures.js";
import type { ClipView } from "./clipTypes.js";
import type { DemoMetadata } from "./demoMetadata.js";
import { createLinkPreviewHttpHandler } from "./linkPreviewHttp.js";
import type { ServerInfo } from "./types.js";

const siteUrl = "https://play.example.com/app/";
const secret = "preview-secret";
const discordId = "12345678901234567";
const demo = linkPreviewFixtures.find((entry) => entry.kind === "demo")!.demo;
const clip: ClipView = {
  ...linkPreviewFixtures.find((entry) => entry.kind === "clip")!.clip,
  ownerDiscordId: discordId,
  checkpointUrl: "/checkpoint",
};
const server: ServerInfo = {
  address: "test.example.com:28000",
  name: "Example Server",
  mod: "Classic",
  gameType: "Capture the Flag",
  mapName: "RiverDance",
  playerCount: 10,
  maxPlayers: 32,
  botCount: 0,
  ping: 25,
  buildVersion: 25034,
  passwordRequired: false,
  tournament: false,
  isPatrolled: false,
};

function pendingDemo() {
  let resolve!: (value: DemoMetadata) => void;
  const promise = new Promise<DemoMetadata>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function fixture() {
  let uploads = 2;
  const listServers = vi.fn(async () => [server]);
  const readProfile = vi.fn((id: string) => ({
    profile: {
      name: "Example Player",
      image: "https://cdn.example.com/avatar.png",
      discordId: id,
      discordUsername: "example",
      t2AccountNames: [],
      t2Profile: null,
    },
    demoCount: uploads,
    clipCount: 1,
  }));
  const readDemo = vi.fn<
    (
      key: string,
      signal: AbortSignal,
      options?: { sourceVerified: boolean },
    ) => Promise<DemoMetadata | undefined>
  >(async () => demo);
  const readClip = vi.fn<
    (id: string, signal: AbortSignal) => Promise<ClipView | undefined>
  >(async () => clip);
  const handle = createLinkPreviewHttpHandler({
    siteUrl,
    secret,
    listServers,
    readProfile,
    readDemo,
    readClip,
  });
  return {
    setUploads(count: number) {
      uploads = count;
    },
    listServers,
    readProfile,
    readDemo,
    readClip,
    async request(page: string, token = secret) {
      const url = new URL(page, siteUrl).href;
      const req = {
        url: `/api/link-preview?${new URLSearchParams({ url })}`,
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      } as IncomingMessage;
      const res = {
        setHeader: vi.fn(),
        writeHead: vi.fn().mockReturnThis(),
        end: vi.fn(),
      };
      expect(await handle(req, res as unknown as ServerResponse)).toBe(true);
      return {
        status: res.writeHead.mock.calls[0][0] as number,
        text: res.end.mock.calls[0][0] as string | undefined,
        headers: res.setHeader.mock.calls,
      };
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("relay link preview endpoint", () => {
  it("requires Pages authorization and the configured app origin and path", async () => {
    const relay = fixture();
    expect((await relay.request("?name=Example+Server", "wrong")).status).toBe(
      404,
    );
    expect(
      (await relay.request("https://elsewhere.example/?name=Example+Server"))
        .status,
    ).toBe(404);
    expect((await relay.request("/other/?name=Example+Server")).status).toBe(
      404,
    );
    expect(relay.listServers).not.toHaveBeenCalled();
  });

  it("selects a listed game server and preserves the public name-based link", async () => {
    const relay = fixture();
    const preview = await relay.request(
      "?name=Example+Server&ownerToken=private",
    );
    expect(preview.status).toBe(200);
    expect(preview.text).toContain(
      "Watch live: Riverdance (CTF) – 10/32 players",
    );
    expect(preview.text).toContain("?mode=live&amp;name=Example+Server");
    expect(preview.text).not.toContain("ownerToken");
    expect(preview.headers).toContainEqual(["Cache-Control", "no-store"]);
    expect((await relay.request("?address=TEST.EXAMPLE.COM")).status).toBe(200);
    expect((await relay.request("?address=unlisted.example.com")).status).toBe(
      404,
    );
  });

  it("renders public activity counts and refreshes the profile after five minutes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const relay = fixture();
    expect((await relay.request(`?user=${discordId}`)).text).toContain(
      "1 clip, 2 uploads",
    );
    relay.setUploads(3);
    now.mockReturnValue(1_299_999);
    expect((await relay.request(`?user=${discordId}`)).text).toContain(
      "1 clip, 2 uploads",
    );
    expect(relay.readProfile).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_300_000);
    expect((await relay.request(`?user=${discordId}`)).text).toContain(
      "1 clip, 3 uploads",
    );
    expect(relay.readProfile).toHaveBeenCalledTimes(2);
    expect((await relay.request("?user=invalid")).status).toBe(404);
  });

  it("renders recordings and reads a clip's public source from its ID", async () => {
    const relay = fixture();
    expect((await relay.request("?demo=recording.rec")).text).toContain(
      "Riverdance (CTF)",
    );
    expect(
      (await relay.request(`?clip=${clip.id}&demo=unrelated.rec`)).text,
    ).toContain(clip.title);
    expect(relay.readDemo.mock.calls).toEqual([
      ["recording.rec", expect.any(AbortSignal)],
      [clip.sourceDemo, expect.any(AbortSignal), { sourceVerified: true }],
    ]);
    expect((await relay.request(`?clip=${clip.id}`)).status).toBe(200);
    expect(relay.readClip).toHaveBeenCalledTimes(1);
    expect((await relay.request("?demo=tribesforever%3A22945")).status).toBe(
      404,
    );
    expect(relay.readDemo).toHaveBeenCalledTimes(2);
  });

  it("coalesces recording reads and expires cached metadata after thirty seconds", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const relay = fixture();
    const { promise, resolve } = pendingDemo();
    relay.readDemo.mockReturnValueOnce(promise);
    const first = relay.request("?demo=recording.rec");
    const second = relay.request("?demo=recording.rec&t=10");
    expect(relay.readDemo).toHaveBeenCalledTimes(1);
    resolve(demo);
    expect(await first).toEqual(await second);

    relay.readDemo.mockResolvedValueOnce(undefined);
    now.mockReturnValue(1_029_999);
    expect((await relay.request("?demo=recording.rec")).status).toBe(200);
    now.mockReturnValue(1_030_000);
    expect((await relay.request("?demo=recording.rec")).status).toBe(404);
    expect((await relay.request("?demo=recording.rec")).status).toBe(200);
    expect(relay.readDemo).toHaveBeenCalledTimes(3);
  });

  it("aborts a stalled recording lookup and retries the next request", async () => {
    vi.useFakeTimers();
    const relay = fixture();
    const { promise, resolve } = pendingDemo();
    relay.readDemo.mockReturnValueOnce(promise);
    const pending = relay.request("?demo=recording.rec");
    const signal = relay.readDemo.mock.calls[0][1];
    await vi.advanceTimersByTimeAsync(3_000);
    expect(signal.aborted).toBe(true);
    expect((await pending).status).toBe(503);
    resolve(demo);
    expect((await relay.request("?demo=recording.rec")).status).toBe(200);
    expect(relay.readDemo).toHaveBeenCalledTimes(2);
  });

  it("reports a temporary failure for a failed master-server lookup", async () => {
    const relay = fixture();
    relay.listServers.mockRejectedValueOnce(new Error("master down"));
    expect((await relay.request("?name=Example+Server")).status).toBe(503);
  });
});
