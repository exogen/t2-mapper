import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { RelayClient } from "./relayClient";
import { WatchRequest } from "../../relay/watchRequest";
import type { ClientMessage } from "../../relay/types";

vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

/** Real WebSocket ordering; only the remote game's compatibility probe is held. */
describe("relay navigation over WebSocket", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const close of cleanup.splice(0)) await close();
    vi.unstubAllGlobals();
  });

  async function setup() {
    vi.stubGlobal("WebSocket", WebSocket);
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    const attached: string[] = [];
    const probes: { address: string; resolve(value: boolean): void }[] = [];
    const statuses: string[] = [];
    const rejected: string[] = [];
    const pending: Promise<void>[] = [];
    let notifyClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      notifyClosed = resolve;
    });
    server.on("connection", (socket) => {
      const send = (address: string, status: "connecting" | "ended") =>
        socket.send(
          JSON.stringify({
            type: "sessionStatus",
            address,
            status,
            watcherCount: 0,
          }),
        );
      const request = new WatchRequest({
        isKnown: (address) => address === "known:28000",
        probe: (address) =>
          new Promise<boolean>((resolve) => probes.push({ address, resolve })),
        checking: (address) => send(address, "connecting"),
        rejected: (address) => {
          rejected.push(address);
          send(address, "ended");
        },
        attach: (address) => {
          attached.push(address);
          send(address, "connecting");
        },
        detach: () => {},
      });
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as ClientMessage;
        if (message.type === "watchServer")
          pending.push(request.watch(message.address, message.channelId));
        if (message.type === "leaveServer") request.leave();
        if (message.type === "wsPing")
          socket.send(JSON.stringify({ type: "wsPong", ts: message.ts }));
      });
      socket.on("close", () => {
        request.leave();
        notifyClosed();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP server");
    let opened!: () => void;
    const open = new Promise<void>((resolve) => (opened = resolve));
    const client = new RelayClient(`ws://127.0.0.1:${address.port}`, {
      onOpen: () => opened(),
      onSessionStatus: (status, _message, info) =>
        statuses.push(`${info.address}:${status}`),
    });
    cleanup.push(async () => {
      client.close();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    client.connect();
    await open;
    return { client, probes, attached, statuses, rejected, pending, closed };
  }

  it("does not attach or reject an abandoned probe after another server is selected", async () => {
    const { client, probes, attached, statuses, rejected, pending } =
      await setup();
    client.watchServer("old:28000");
    await vi.waitFor(() => expect(probes).toHaveLength(1));
    client.watchServer("known:28000");
    await vi.waitFor(() => expect(attached).toEqual(["known:28000"]));
    probes[0].resolve(false);
    await Promise.all(pending);
    await vi.waitFor(() =>
      expect(statuses.at(-1)).toBe("known:28000:connecting"),
    );
    expect(statuses).not.toContain("old:28000:ended");
    expect(rejected).toEqual([]);
  });

  it("cancels on socket closure while an unlisted server is being probed", async () => {
    const { client, probes, attached, pending, closed } = await setup();
    client.watchServer("old:28000");
    await vi.waitFor(() => expect(probes).toHaveLength(1));
    client.close();
    // A second selection cannot be sent on the closed socket; resolving the
    // old probe after the close handshake must not attach it either.
    await closed;
    probes[0].resolve(true);
    await Promise.all(pending);
    expect(attached).toEqual([]);
  });
});
