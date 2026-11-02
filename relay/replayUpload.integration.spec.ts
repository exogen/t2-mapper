import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { deflateRawSync, gunzipSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import { BlockTypeMove, BlockTypePacket } from "t2-demo-parser";
import type { WebSocket } from "ws";
import type { ReplayState, ReplayUploadResponse } from "./replayTypes";
import { REPLAY_CLIENT_ID_HEADER, REPLAY_UPLOAD_PATH } from "./replayTypes";
import {
  ReplaySessionManager,
  type ReplaySessionManagerOptions,
} from "./replaySession";
import { handleReplayUpload } from "./replayUpload";
import {
  buildDemoValues,
  buildHeader,
  buildInitialBlock,
  ZERO_MOVE,
} from "./demoWriter";
import {
  cameraGhost,
  command,
  CONNECT_SEQUENCE,
  netString,
  serverPacket,
} from "./serverPacketFixtures";
import type { ServerMessage, WatchCatchupPayload } from "./types";
import { deserializeCatchupPayload } from "./watchSerialize";
import { ReplayStreamAdapter } from "../src/stream/replayStreaming";
import type { RelayClient } from "../src/stream/relayClient";
import { DemoReplaySource } from "./demoReplaySource";

const CREATOR_A = "a".repeat(48);
const CREATOR_B = "b".repeat(48);

function block(type: number, bytes: Uint8Array): Uint8Array {
  const header = Buffer.alloc(2);
  header.writeUInt16LE((type << 12) | bytes.byteLength);
  return Buffer.concat([header, bytes]);
}

function uploadedRecording(): Uint8Array {
  const initial = buildInitialBlock({
    connectSequence: CONNECT_SEQUENCE,
    missionName: "Katabatic",
    demoValues: buildDemoValues({
      recorderName: "Local recorder",
      serverName: "Private replay",
      serverAddress: "example:28000",
      date: new Date("2026-01-01T00:00:00Z"),
      missionDisplayName: "Katabatic",
      mod: "classic",
      gameType: "Capture the Flag",
    }),
  });
  const events = [
    block(BlockTypePacket, serverPacket(1, { events: [cameraGhost(0)] })),
    block(
      BlockTypePacket,
      serverPacket(2, {
        camera: { pitch: 0.25 },
        events: [
          netString(1, 1, "ServerMessage"),
          command(2, 1, "MsgCTFAddTeam", "", "1", "Storm", "", "0"),
        ],
      }),
    ),
    ...Array.from({ length: 30 }, () => block(BlockTypeMove, ZERO_MOVE)),
  ];
  return Buffer.concat([
    buildHeader(initial.byteLength),
    initial,
    deflateRawSync(Buffer.concat(events)),
  ]);
}

class ViewerSocket {
  readonly OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  frames: Array<ServerMessage | Uint8Array> = [];
  send(data: string | Uint8Array): void {
    this.frames.push(
      typeof data === "string"
        ? (JSON.parse(data) as ServerMessage)
        : Uint8Array.from(data),
    );
  }
  close(): void {
    this.readyState = 3;
  }
  get ws(): WebSocket {
    return this as unknown as WebSocket;
  }
  state(): ReplayState {
    return this.frames
      .filter(
        (frame) =>
          !(frame instanceof Uint8Array) && frame.type === "replayState",
      )
      .at(-1)! as ReplayState;
  }
  catchup(): WatchCatchupPayload {
    const start = this.frames.findLastIndex(
      (frame) =>
        !(frame instanceof Uint8Array) && frame.type === "catchupBegin",
    );
    const bytes: Uint8Array[] = [];
    for (const frame of this.frames.slice(start + 1)) {
      if (frame instanceof Uint8Array) bytes.push(frame);
      else if (frame.type === "catchupEnd") break;
    }
    return deserializeCatchupPayload(
      gunzipSync(Buffer.concat(bytes)).toString(),
    );
  }
}

const managers: ReplaySessionManager[] = [];
const servers: Server[] = [];
const requests: ClientRequest[] = [];

async function setup(options: ReplaySessionManagerOptions = {}) {
  const hostedLoad = vi.fn(async () => {
    throw new Error("Uploaded demos must not fetch a hosted source");
  });
  const manager = new ReplaySessionManager({
    maxSessions: 1,
    loadDemo: hostedLoad,
    ...options,
  });
  managers.push(manager);
  const server = createServer((req, res) => {
    void handleReplayUpload(req, res, manager)
      .then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      })
      .catch((error) => res.destroy(error));
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const upload = async (
    bytes = uploadedRecording(),
    tick = 7,
    creatorId = CREATOR_A,
  ) =>
    fetch(`${base}${REPLAY_UPLOAD_PATH}?name=private.rec&tick=${tick}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        [REPLAY_CLIENT_ID_HEADER]: creatorId,
      },
      body: Buffer.from(bytes),
    });
  return { base, manager, hostedLoad, upload };
}

afterEach(async () => {
  for (const request of requests.splice(0)) request.destroy();
  for (const manager of managers.splice(0)) manager.shutdown();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

it("uploads only to a room, then seeds its owner and watchers at the same exact recording tick", async () => {
  const { manager, hostedLoad, upload, base } = await setup();
  const response = await upload();
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = (await response.json()) as ReplayUploadResponse;
  expect(Object.keys(result).sort()).toEqual(["ownerToken", "sessionId"]);
  expect(result.ownerToken).toEqual(expect.any(String));
  expect(manager.getStatusSummary()).toEqual([
    expect.objectContaining({
      sessionId: result.sessionId,
      status: "paused",
      tick: 7,
    }),
  ]);
  expect(hostedLoad).not.toHaveBeenCalled();

  const owner = new ViewerSocket();
  const watcher = new ViewerSocket();
  await manager.handle(owner.ws, {
    type: "joinReplay",
    sessionId: result.sessionId,
    ownerToken: result.ownerToken,
  });
  await manager.handle(watcher.ws, {
    type: "joinReplay",
    sessionId: result.sessionId,
  });
  expect(owner.state()).toMatchObject({
    isOwner: true,
    status: "paused",
    tick: 7,
  });
  expect(watcher.state()).toMatchObject({
    isOwner: false,
    status: "paused",
    tick: 7,
    watcherCount: 2,
  });
  for (const viewer of [owner, watcher]) {
    const snapshot = viewer.catchup();
    expect(snapshot.replay).toMatchObject({
      sessionId: result.sessionId,
      tick: 7,
      status: "paused",
    });
    expect(snapshot.initialGhosts).toHaveLength(1);
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    adapter.hydrate(snapshot);
    expect(adapter.stepToTime(999).timeSec).toBeCloseTo(7 * 0.032);
    expect(adapter.getSnapshot().teamScores).toContainEqual(
      expect.objectContaining({ teamId: 1, name: "Storm" }),
    );
  }
  expect(JSON.stringify(watcher.frames)).not.toContain(result.ownerToken);
  await manager.handle(watcher.ws, {
    type: "controlReplay",
    sessionId: result.sessionId,
    revision: watcher.state().revision,
    action: "play",
  });
  expect(watcher.frames.at(-1)).toMatchObject({
    type: "replayError",
    message: expect.stringContaining("creator"),
  });
  await manager.handle(owner.ws, {
    type: "controlReplay",
    sessionId: result.sessionId,
    revision: owner.state().revision,
    action: "play",
  });
  expect(owner.state().status).toBe("playing");
  await manager.handle(owner.ws, {
    type: "controlReplay",
    sessionId: result.sessionId,
    revision: owner.state().revision,
    action: "pause",
    tick: 7,
  });
  expect(watcher.catchup().replay).toMatchObject({ status: "paused", tick: 7 });
  // Upload responses never advertise a downloadable or published object.
  const download = await fetch(
    `${base}${REPLAY_UPLOAD_PATH}/${result.sessionId}/private.rec`,
  );
  expect(download.status).toBe(404);
});

it("reserves capacity before receiving the body and releases it when that upload disconnects", async () => {
  const { base, manager, upload } = await setup();
  const bytes = uploadedRecording();
  const partial = httpRequest(
    `${base}${REPLAY_UPLOAD_PATH}?name=partial.rec&tick=0`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": bytes.byteLength,
        [REPLAY_CLIENT_ID_HEADER]: CREATOR_A,
      },
    },
  );
  requests.push(partial);
  partial.on("error", () => {});
  partial.write(Buffer.from(bytes.subarray(0, 12)));
  await vi.waitFor(() => expect(manager.getStatusSummary()).toHaveLength(1));
  expect(manager.getStatusSummary()[0].status).toBe("preparing");
  const blocked = await upload(undefined, 7, CREATOR_B);
  expect(blocked.status).toBe(503);
  expect(await blocked.json()).toMatchObject({
    error: expect.stringContaining("in use"),
  });
  partial.destroy();
  await vi.waitFor(() => expect(manager.getStatusSummary()).toEqual([]));
  const retry = await upload();
  expect(retry.status).toBe(201);
  expect(manager.getStatusSummary()).toHaveLength(1);
});

it("discards an unclaimed uploaded source when its room expires and rejects its old invitation", async () => {
  const { manager, upload } = await setup({ idleTtlMs: 100 });
  const response = await upload();
  expect(response.status).toBe(201);
  const result = (await response.json()) as ReplayUploadResponse;
  await vi.waitFor(() => expect(manager.getStatusSummary()).toEqual([]));
  const late = new ViewerSocket();
  await manager.handle(late.ws, {
    type: "joinReplay",
    sessionId: result.sessionId,
    ownerToken: result.ownerToken,
  });
  expect(late.frames).toEqual([
    expect.objectContaining({
      type: "replayError",
      message: expect.stringContaining("expired"),
    }),
  ]);
});

it("replaces this browser's uploaded room at capacity, closes its old viewers, and keeps creator identity private", async () => {
  const { manager, upload, hostedLoad } = await setup();
  const firstResponse = await upload();
  expect(firstResponse.status).toBe(201);
  const first = (await firstResponse.json()) as ReplayUploadResponse;
  const owner = new ViewerSocket();
  const watcher = new ViewerSocket();
  await manager.handle(owner.ws, { type: "joinReplay", ...first });
  await manager.handle(watcher.ws, {
    type: "joinReplay",
    sessionId: first.sessionId,
  });
  const blocked = await upload(undefined, 11, CREATOR_B);
  expect(blocked.status).toBe(503);
  expect(manager.getStatusSummary()).toEqual([
    expect.objectContaining({ sessionId: first.sessionId, watcherCount: 2 }),
  ]);
  const replacementResponse = await upload(undefined, 11, CREATOR_A);
  expect(replacementResponse.status).toBe(201);
  const replacement =
    (await replacementResponse.json()) as ReplayUploadResponse;
  expect(replacement.sessionId).not.toBe(first.sessionId);
  expect(manager.getStatusSummary()).toEqual([
    expect.objectContaining({ sessionId: replacement.sessionId, tick: 11 }),
  ]);
  for (const viewer of [owner, watcher])
    expect(viewer.state()).toMatchObject({
      sessionId: first.sessionId,
      status: "ended",
      closed: true,
    });

  const nextOwner = new ViewerSocket();
  const nextWatcher = new ViewerSocket();
  await manager.handle(nextOwner.ws, { type: "joinReplay", ...replacement });
  await manager.handle(nextWatcher.ws, {
    type: "joinReplay",
    sessionId: replacement.sessionId,
  });
  expect(nextOwner.state()).toMatchObject({ isOwner: true, tick: 11 });
  expect(nextWatcher.catchup().replay).toMatchObject({
    tick: 11,
    status: "paused",
  });
  const stale = new ViewerSocket();
  await manager.handle(stale.ws, { type: "joinReplay", ...first });
  expect(stale.frames.at(-1)).toMatchObject({
    type: "replayError",
    message: expect.stringContaining("expired"),
  });
  for (const viewer of [owner, watcher, nextOwner, nextWatcher]) {
    const wire = JSON.stringify(viewer.frames);
    expect(wire).not.toContain(CREATOR_A);
    expect(wire).not.toContain(CREATOR_B);
  }
  expect(JSON.stringify(nextWatcher.frames)).not.toContain(
    replacement.ownerToken,
  );
  expect(hostedLoad).not.toHaveBeenCalled();
});

it("privately reports real received bytes and reaches 100% before preparation, then claims the room on the same socket", async () => {
  let releasePreparation!: () => void;
  const preparation = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  let preparing = false;
  const { base, manager, hostedLoad } = await setup({
    createSource: async (bytes, signal) => {
      preparing = true;
      let cancel!: () => void;
      const canceled = new Promise<never>((_resolve, reject) => {
        cancel = () => reject(signal.reason);
        if (signal.aborted) cancel();
        else signal.addEventListener("abort", cancel, { once: true });
      });
      try {
        await Promise.race([preparation, canceled]);
      } finally {
        signal.removeEventListener("abort", cancel);
      }
      return DemoReplaySource.load(bytes, { signal });
    },
  });
  const bytes = uploadedRecording();
  const uploadId = "private-upload-progress-12345";
  const owner = new ViewerSocket();
  const watcher = new ViewerSocket();
  await manager.handle(owner.ws, {
    type: "watchReplayUpload",
    creatorId: CREATOR_A,
    uploadId,
    totalBytes: bytes.byteLength,
  });
  const progress = () =>
    owner.frames.filter(
      (frame) =>
        !(frame instanceof Uint8Array) && frame.type === "replayUploadProgress",
    );
  expect(progress()).toEqual([
    {
      type: "replayUploadProgress",
      uploadId,
      receivedBytes: 0,
      totalBytes: bytes.byteLength,
    },
  ]);

  let responded = false;
  const uploaded = new Promise<{
    status: number;
    result: ReplayUploadResponse;
  }>((resolve, reject) => {
    const request = httpRequest(
      `${base}${REPLAY_UPLOAD_PATH}?name=private.rec&tick=7&uploadId=${uploadId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": bytes.byteLength,
          [REPLAY_CLIENT_ID_HEADER]: CREATOR_A,
        },
      },
      (response) => {
        responded = true;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode!,
              result: JSON.parse(
                Buffer.concat(chunks).toString(),
              ) as ReplayUploadResponse,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    requests.push(request);
    request.on("error", reject);
  });
  void uploaded.catch(() => {});
  const request = requests.at(-1)!;
  const prefixBytes = Math.floor(bytes.byteLength / 2);
  request.write(Buffer.from(bytes.subarray(0, prefixBytes)));
  await vi.waitFor(() =>
    expect(progress()).toContainEqual(
      expect.objectContaining({
        receivedBytes: prefixBytes,
        totalBytes: bytes.byteLength,
      }),
    ),
  );
  expect(preparing).toBe(false);
  expect(responded).toBe(false);
  expect(watcher.frames).toEqual([]);
  request.end(Buffer.from(bytes.subarray(prefixBytes)));
  await vi.waitFor(() => {
    expect(preparing).toBe(true);
    expect(progress().at(-1)).toMatchObject({
      receivedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
    });
  });
  // The body really arrived, while the real source factory has not been allowed
  // to parse it or return the HTTP capability yet.
  expect(responded).toBe(false);
  expect(manager.getStatusSummary()).toEqual([
    expect.objectContaining({ status: "preparing", watcherCount: 0 }),
  ]);
  releasePreparation();
  const { status, result } = await uploaded;
  expect(status).toBe(201);
  expect(hostedLoad).not.toHaveBeenCalled();
  await manager.handle(owner.ws, {
    type: "joinReplay",
    sessionId: result.sessionId,
    ownerToken: result.ownerToken,
  });
  await manager.handle(watcher.ws, {
    type: "joinReplay",
    sessionId: result.sessionId,
  });
  expect(owner.state()).toMatchObject({
    isOwner: true,
    status: "paused",
    tick: 7,
  });
  expect(watcher.state()).toMatchObject({
    isOwner: false,
    status: "paused",
    tick: 7,
  });
  expect(owner.catchup().replay).toMatchObject({ tick: 7, status: "paused" });
  expect(watcher.catchup().replay).toMatchObject({ tick: 7, status: "paused" });
  expect(
    watcher.frames.some(
      (frame) =>
        !(frame instanceof Uint8Array) && frame.type === "replayUploadProgress",
    ),
  ).toBe(false);
  expect(JSON.stringify(watcher.frames)).not.toContain(result.ownerToken);
  expect(JSON.stringify(watcher.frames)).not.toContain(uploadId);
});
