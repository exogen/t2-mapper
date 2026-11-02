import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { gzipSync } from "node:zlib";
import { DemoParser, DemoIdentString, type Move } from "t2-demo-parser";
import type { WebSocket } from "ws";
import { DemoReplaySource } from "./demoReplaySource.js";
import {
  createReplayDemoLoader,
  validateReplayDemoReference,
} from "./replayDemoLoader.js";
import type {
  ReplayClientMessage,
  ReplayState,
  ReplayStatus,
  ReplayUploadResponse,
} from "./replayTypes.js";
import {
  MAX_REPLAY_UPLOAD_BYTES,
  REPLAY_UPLOAD_TIMEOUT_MS,
  isReplayCreatorId,
} from "./replayTypes.js";
import { SOURCE_DEMO_PROTOCOL_VERSION } from "./demoSourceMetadata.js";
import type { ServerMessage, WatchCatchupPayload } from "./types.js";
import { serializeCatchupPayload } from "./watchSerialize.js";
import {
  MAX_CATCHUP_COMPRESSED_BYTES,
  MAX_CATCHUP_DECOMPRESSED_BYTES,
} from "./catchupLimits.js";

const TICK_MS = 32;
const CATCHUP_CHUNK_BYTES = 256 * 1024;

export interface ReplaySource {
  readonly tick: number;
  readonly durationTicks: number;
  readonly complete: boolean;
  readonly recorderName?: string | null;
  readonly recordingDate?: string | null;
  advanceOneTick(): Array<
    | { kind: "packet"; data: Uint8Array }
    | { kind: "info"; firstPerson: boolean }
    | { kind: "move"; tick: number; move: Move; firstPerson: boolean }
  >;
  seek(tick: number, signal?: AbortSignal): Promise<void>;
  catchup(
    sessionId: string,
    epoch: number,
    status: "paused" | "playing" | "ended",
  ): WatchCatchupPayload;
  prepareScene?(signal?: AbortSignal): Promise<void>;
}

export interface ReplaySessionManagerOptions {
  loadDemo?: (reference: string, signal: AbortSignal) => Promise<Uint8Array>;
  createSource?: (
    bytes: Uint8Array,
    signal: AbortSignal,
  ) => Promise<ReplaySource>;
  now?: () => number;
  maxSessions?: number;
  maxParticipants?: number;
  idleTtlMs?: number;
  maxBufferedBytes?: number;
}

interface Session {
  id: string;
  creatorHash: string;
  demo: string;
  recorderName: string | null;
  recordingDate: string | null;
  ownerHash: Buffer;
  participants: Map<WebSocket, boolean>;
  source: ReplaySource | null;
  status: ReplayStatus;
  epoch: number;
  revision: number;
  abort: AbortController;
  seekAbort: AbortController | null;
  seekGeneration: number;
  seekTask: Promise<void>;
  closed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  expires: ReturnType<typeof setTimeout> | null;
  anchorTick: number;
  anchorTime: number;
  catchupCache?: {
    tick: number;
    epoch: number;
    status: ReplayStatus;
    bytes: Uint8Array;
  };
  error?: string;
  uploaded: boolean;
  releasedTick?: number;
  releasedDurationTicks?: number;
}

interface UploadObserver {
  id: string;
  creatorHash: string;
  ws: WebSocket;
  totalBytes: number;
  receivedBytes: number;
  percent: number;
  claimed: boolean;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
}

export class ReplayCapacityError extends Error {
  constructor() {
    super("All replay sessions are in use. Please try again later.");
  }
}

export interface UploadedReplayRequest {
  name: string;
  creatorId: string;
  tick?: number;
  uploadId?: string;
  read: (
    signal: AbortSignal,
    onProgress?: (receivedBytes: number) => void,
  ) => Promise<Uint8Array>;
  signal: AbortSignal;
}

/** Preparation still stops when a source implementation is slow to acknowledge cancellation. */
async function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([task, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** Replay rooms own their clocks and capabilities; they never open game connections. */
export class ReplaySessionManager {
  private readonly options: Required<ReplaySessionManagerOptions>;
  private readonly sessions = new Map<string, Session>();
  private readonly memberships = new Map<WebSocket, Session>();
  private readonly uploadObservers = new Map<string, UploadObserver>();
  private readonly uploadSubscriptions = new Map<WebSocket, UploadObserver>();
  private stopped = false;

  constructor(options: ReplaySessionManagerOptions = {}) {
    this.options = {
      loadDemo: options.loadDemo ?? createReplayDemoLoader(),
      createSource:
        options.createSource ??
        ((bytes, signal) => DemoReplaySource.load(bytes, { signal })),
      now: options.now ?? (() => performance.now()),
      maxSessions: options.maxSessions ?? 4,
      maxParticipants: options.maxParticipants ?? 64,
      idleTtlMs: options.idleTtlMs ?? 10 * 60_000,
      maxBufferedBytes: options.maxBufferedBytes ?? 8 * 1024 * 1024,
    };
  }

  async handle(ws: WebSocket, message: ReplayClientMessage): Promise<void> {
    if (this.stopped || ws.readyState !== ws.OPEN) return;
    try {
      switch (message.type) {
        case "watchReplayUpload":
          this.watchUpload(
            ws,
            message.uploadId,
            message.totalBytes,
            message.creatorId,
          );
          return;
        case "createReplay":
          await this.create(ws, message.demo, message.creatorId, message.tick);
          return;
        case "joinReplay":
          this.join(ws, message.sessionId, message.ownerToken);
          return;
        case "leaveReplay":
          this.detach(ws);
          return;
        case "syncReplay": {
          const session = this.requireMembership(ws, message.sessionId);
          this.sendState(session, ws);
          if (
            session.source &&
            session.status !== "seeking" &&
            session.status !== "preparing"
          )
            this.sendCatchup(session, ws);
          return;
        }
        case "controlReplay":
          await this.control(ws, message);
          return;
      }
    } catch (error) {
      this.send(ws, {
        type: "replayError",
        message:
          error instanceof Error ? error.message : "Replay request failed",
        ...("sessionId" in message ? { sessionId: message.sessionId } : {}),
      });
    }
  }

  private watchUpload(
    ws: WebSocket,
    uploadId: string,
    totalBytes: number,
    creatorId: string,
  ): void {
    const creatorHash = this.creatorHash(creatorId);
    if (
      typeof uploadId !== "string" ||
      !/^[A-Za-z0-9_-]{22,128}$/.test(uploadId)
    )
      throw new Error("Invalid upload progress ID");
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes < 1 ||
      totalBytes > MAX_REPLAY_UPLOAD_BYTES
    )
      throw new Error("Invalid replay upload size");
    const existing = this.uploadObservers.get(uploadId);
    if (existing && (existing.ws !== ws || existing.claimed))
      throw new Error("Upload progress ID is already in use");
    const count = [...this.uploadObservers.values()].filter(
      (observer) => observer.ws !== ws && observer.creatorHash !== creatorHash,
    ).length;
    if (count >= this.options.maxSessions) throw new ReplayCapacityError();
    // A socket observes one upload and belongs to at most one room. Validate
    // first so a rejected registration cannot interrupt an existing replay.
    this.replaceCreator(creatorHash, undefined, ws);
    this.detach(ws);
    const observer: UploadObserver = {
      id: uploadId,
      creatorHash,
      ws,
      totalBytes,
      receivedBytes: 0,
      percent: 0,
      claimed: false,
      abort: new AbortController(),
      timer: null,
    };
    observer.timer = setTimeout(() => {
      if (this.uploadObservers.get(uploadId) !== observer || observer.claimed)
        return;
      this.finishUploadObserver(
        observer,
        new DOMException("Replay upload timed out", "TimeoutError"),
      );
      this.send(ws, {
        type: "replayError",
        message: "Replay upload timed out",
      });
    }, REPLAY_UPLOAD_TIMEOUT_MS);
    observer.timer.unref?.();
    this.uploadObservers.set(uploadId, observer);
    this.uploadSubscriptions.set(ws, observer);
    this.send(ws, {
      type: "replayUploadProgress",
      uploadId,
      receivedBytes: 0,
      totalBytes,
    });
  }

  private claimUpload(uploadId: string, creatorHash: string): UploadObserver {
    const observer = this.uploadObservers.get(uploadId);
    if (
      !observer ||
      observer.creatorHash !== creatorHash ||
      observer.claimed ||
      observer.ws.readyState !== observer.ws.OPEN
    )
      throw new Error(
        "Upload progress ID is missing, expired, or already claimed",
      );
    observer.claimed = true;
    if (observer.timer) clearTimeout(observer.timer);
    observer.timer = null;
    return observer;
  }

  private reportUpload(observer: UploadObserver, receivedBytes: number): void {
    observer.abort.signal.throwIfAborted();
    if (
      !Number.isSafeInteger(receivedBytes) ||
      receivedBytes < observer.receivedBytes ||
      receivedBytes > observer.totalBytes
    )
      throw new Error("Upload size does not match the selected file");
    const percent = Math.floor((receivedBytes * 100) / observer.totalBytes);
    const changed =
      percent !== observer.percent ||
      (receivedBytes === observer.totalBytes &&
        observer.receivedBytes !== receivedBytes);
    observer.receivedBytes = receivedBytes;
    if (!changed) return;
    observer.percent = percent;
    this.send(observer.ws, {
      type: "replayUploadProgress",
      uploadId: observer.id,
      receivedBytes,
      totalBytes: observer.totalBytes,
    });
  }

  private finishUploadObserver(
    observer: UploadObserver,
    error?: unknown,
  ): void {
    if (this.uploadObservers.get(observer.id) !== observer) return;
    this.uploadObservers.delete(observer.id);
    this.uploadSubscriptions.delete(observer.ws);
    if (observer.timer) clearTimeout(observer.timer);
    observer.timer = null;
    if (error !== undefined) observer.abort.abort(error);
  }

  private async create(
    ws: WebSocket,
    demo: string,
    creatorId: string,
    tick?: number,
  ): Promise<void> {
    const creatorHash = this.creatorHash(creatorId);
    validateReplayDemoReference(demo);
    if (tick !== undefined) this.validateTick(tick);
    const { session, ownerToken } = this.reserve(demo, creatorHash, ws);
    this.sendState(session, ws, ownerToken);
    try {
      const bytes = await this.options.loadDemo(demo, session.abort.signal);
      if (!this.isCurrent(session)) return;
      await this.initialize(session, bytes, tick, session.abort.signal);
    } catch (error) {
      if (!this.isCurrent(session)) return;
      this.failSession(session, error);
    }
  }

  /** Uploads are private room sources, never published or resolved as hosted references. */
  async createUploadedDemo(
    request: UploadedReplayRequest,
  ): Promise<ReplayUploadResponse> {
    const { name, tick } = request;
    const creatorHash = this.creatorHash(request.creatorId);
    if (
      typeof name !== "string" ||
      !name ||
      name.length > 255 ||
      !/\.rec$/i.test(name) ||
      /[/\\\x00-\x1f\x7f]/.test(name)
    )
      throw new Error("Choose a Tribes 2 .rec file");
    if (tick !== undefined) this.validateTick(tick);
    request.signal.throwIfAborted();
    const observer =
      request.uploadId === undefined
        ? undefined
        : this.claimUpload(request.uploadId, creatorHash);
    let session: Session | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reservation = this.reserve(name, creatorHash, undefined, observer);
      session = reservation.session;
      const { ownerToken } = reservation;
      session.uploaded = true;
      this.refreshExpiry(session);
      const timeout = new AbortController();
      timer = setTimeout(
        () =>
          timeout.abort(
            new DOMException("Replay upload timed out", "TimeoutError"),
          ),
        REPLAY_UPLOAD_TIMEOUT_MS,
      );
      timer.unref?.();
      const signal = AbortSignal.any([
        request.signal,
        session.abort.signal,
        timeout.signal,
        ...(observer ? [observer.abort.signal] : []),
      ]);
      const report = observer
        ? (received: number) => this.reportUpload(observer, received)
        : undefined;
      const bytes = await abortable(request.read(signal, report), signal);
      signal.throwIfAborted();
      if (!bytes.byteLength || bytes.byteLength > MAX_REPLAY_UPLOAD_BYTES)
        throw new Error(
          "Demo is empty or exceeds the replay upload size limit",
        );
      if (observer) {
        this.reportUpload(observer, bytes.byteLength);
        if (bytes.byteLength !== observer.totalBytes)
          throw new Error("Upload size does not match the selected file");
      }
      let header;
      try {
        header = DemoParser.peekHeader(bytes).header;
      } catch {
        throw new Error("The upload is not a Tribes 2 demo");
      }
      if (
        header.identString !== DemoIdentString ||
        header.protocolVersion !== SOURCE_DEMO_PROTOCOL_VERSION
      )
        throw new Error("Only supported Tribes 2 demos can be replayed");
      await abortable(this.initialize(session, bytes, tick, signal), signal);
      signal.throwIfAborted();
      if (!this.isCurrent(session))
        throw new Error("Replay session expired during upload");
      // A successfully prepared but not yet claimed room gets the full grace.
      this.clearExpiry(session);
      this.refreshExpiry(session);
      if (observer) this.finishUploadObserver(observer);
      return { sessionId: session.id, ownerToken };
    } catch (error) {
      if (session) this.destroy(session);
      if (observer) this.finishUploadObserver(observer, error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** A capability response that never flushed must not leave an orphan upload. */
  discardUnclaimedUpload(sessionId: string, ownerToken: string): void {
    const session = this.sessions.get(sessionId);
    if (
      !session?.uploaded ||
      session.participants.size > 0 ||
      typeof ownerToken !== "string" ||
      ownerToken.length > 256 ||
      !timingSafeEqual(hashToken(ownerToken), session.ownerHash)
    )
      return;
    this.destroy(session);
  }

  private reserve(
    demo: string,
    creatorHash: string,
    ws?: WebSocket,
    observer?: UploadObserver,
  ): { session: Session; ownerToken: string } {
    if (this.stopped) throw new Error("The relay is shutting down");
    this.replaceCreator(creatorHash, observer, ws);
    if (this.sessions.size >= this.options.maxSessions) {
      // Closed and failed rooms retain a final view for existing viewers,
      // but must not prevent new sessions throughout their expiry grace.
      const reclaimable = [...this.sessions.values()].find(
        (session) =>
          session.closed || (session.status === "ended" && session.error),
      );
      if (reclaimable) this.destroy(reclaimable);
    }
    if (this.sessions.size >= this.options.maxSessions)
      throw new ReplayCapacityError();
    if (ws) this.detach(ws);
    const ownerToken = randomBytes(32).toString("base64url");
    const session: Session = {
      id: randomUUID(),
      creatorHash,
      demo,
      recorderName: null,
      recordingDate: null,
      ownerHash: hashToken(ownerToken),
      participants: ws ? new Map([[ws, true]]) : new Map(),
      source: null,
      status: "preparing",
      epoch: 1,
      revision: 0,
      abort: new AbortController(),
      seekAbort: null,
      seekGeneration: 0,
      seekTask: Promise.resolve(),
      closed: false,
      timer: null,
      expires: null,
      anchorTick: 0,
      anchorTime: 0,
      uploaded: false,
    };
    this.sessions.set(session.id, session);
    if (ws) this.memberships.set(ws, session);
    return { session, ownerToken };
  }

  private creatorHash(creatorId: unknown): string {
    if (!isReplayCreatorId(creatorId))
      throw new Error("Invalid replay client ID");
    return hashToken(creatorId).toString("hex");
  }

  /** Starting a new replay replaces only this browser session's creations. */
  private replaceCreator(
    creatorHash: string,
    keepObserver?: UploadObserver,
    requestingSocket?: WebSocket,
  ): void {
    for (const observer of this.uploadObservers.values()) {
      if (observer.creatorHash === creatorHash && observer !== keepObserver)
        this.finishUploadObserver(
          observer,
          new DOMException("Replaced by a new replay", "AbortError"),
        );
    }
    for (const session of this.sessions.values()) {
      if (session.creatorHash === creatorHash) {
        // The requesting socket is already switching to a new room. An old
        // terminal state could otherwise be mistaken for its creation reply.
        if (
          requestingSocket &&
          this.memberships.get(requestingSocket) === session
        ) {
          this.memberships.delete(requestingSocket);
          session.participants.delete(requestingSocket);
        }
        this.destroy(session);
      }
    }
  }

  private async initialize(
    session: Session,
    bytes: Uint8Array,
    tick: number | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const source = await this.options.createSource(bytes, signal);
    signal.throwIfAborted();
    if (!this.isCurrent(session)) return;
    session.source = source;
    session.recorderName = source.recorderName ?? null;
    session.recordingDate = source.recordingDate ?? null;
    if (tick !== undefined)
      await source.seek(Math.min(tick, source.durationTicks), signal);
    else await source.prepareScene?.(signal);
    signal.throwIfAborted();
    if (!this.isCurrent(session)) return;
    session.status = source.complete ? "ended" : "paused";
    session.revision++;
    // Uploads have no socket yet; validate their first snapshot before returning
    // a capability for a room that browsers could never hydrate.
    if (!this.catchupBytes(session)) throw new Error(session.error);
    this.broadcastState(session);
    this.snapshotAll(session);
    this.refreshExpiry(session);
  }

  private join(ws: WebSocket, id: string, ownerToken?: string): void {
    if (typeof id !== "string") throw new Error("Invalid replay session");
    const session = this.sessions.get(id);
    if (!session) throw new Error("This replay session has ended or expired");
    if (
      !session.participants.has(ws) &&
      session.participants.size >= this.options.maxParticipants
    )
      throw new Error("This replay session is full");
    const supplied =
      typeof ownerToken === "string" && ownerToken.length <= 256
        ? hashToken(ownerToken)
        : null;
    const owner =
      supplied !== null && timingSafeEqual(supplied, session.ownerHash);
    if (this.memberships.get(ws) !== session) this.detach(ws);
    // Rejoining without a token cannot demote an already-authorized socket.
    session.participants.set(
      ws,
      owner || session.participants.get(ws) === true,
    );
    this.memberships.set(ws, session);
    this.refreshExpiry(session);
    this.broadcastState(session);
    if (
      session.source &&
      session.status !== "seeking" &&
      session.status !== "preparing"
    )
      this.sendCatchup(session, ws);
  }

  private requireMembership(ws: WebSocket, id: string): Session {
    const session = this.memberships.get(ws);
    if (!session || session.id !== id)
      throw new Error("Join the replay session first");
    return session;
  }

  private async control(
    ws: WebSocket,
    message: Extract<ReplayClientMessage, { type: "controlReplay" }>,
  ): Promise<void> {
    const session = this.requireMembership(ws, message.sessionId);
    if (session.closed) throw new Error("This replay session has ended");
    if (!session.participants.get(ws))
      throw new Error("Only the replay creator can control playback");
    if (
      !Number.isSafeInteger(message.revision) ||
      message.revision !== session.revision
    ) {
      this.sendState(session, ws);
      throw new Error("Replay state changed; try the control again");
    }
    if (!["play", "pause", "seek", "end"].includes(message.action))
      throw new Error("Invalid replay control");
    if (!session.source || session.status === "preparing")
      throw new Error("The replay is still preparing");
    if (message.action === "seek") {
      this.validateTick(message.tick);
      await this.seek(
        session,
        Math.min(message.tick!, session.source.durationTicks),
      );
      return;
    }
    if (message.action === "pause" && message.tick !== undefined) {
      this.validateTick(message.tick);
      if (message.tick !== session.source.tick) {
        await this.seek(
          session,
          Math.min(message.tick, session.source.durationTicks),
        );
        return;
      }
    }
    if (session.status === "seeking")
      throw new Error("The replay is still seeking");
    if (message.action === "play") {
      if (session.source.complete)
        throw new Error("Seek to an earlier point to replay again");
      session.status = "playing";
      session.error = undefined;
      session.anchorTick = session.source.tick;
      session.anchorTime = this.options.now();
      session.revision++;
      this.clearExpiry(session);
      this.broadcastState(session);
      this.schedule(session);
    } else {
      this.stopTimer(session);
      session.status = message.action === "end" ? "ended" : "paused";
      session.error = undefined;
      if (message.action === "end") {
        session.closed = true;
        session.ownerHash = hashToken(randomBytes(32).toString("base64url"));
      }
      session.epoch++;
      session.revision++;
      this.broadcastState(session);
      this.snapshotAll(session);
      if (session.closed && session.uploaded) this.releaseSource(session);
      this.refreshExpiry(session);
    }
  }

  private validateTick(tick: unknown): asserts tick is number {
    if (!Number.isSafeInteger(tick) || (tick as number) < 0)
      throw new Error("Replay position must be a non-negative tick");
  }

  private async seek(session: Session, tick: number): Promise<void> {
    this.stopTimer(session);
    this.clearExpiry(session);
    session.seekAbort?.abort();
    const abort = new AbortController();
    session.seekAbort = abort;
    const generation = ++session.seekGeneration;
    session.status = "seeking";
    session.revision++;
    this.broadcastState(session);
    // Aborted source seeks restore their prior checkpoint. Wait for that
    // rollback before another request can mutate the same parser.
    const preceding = session.seekTask;
    const task = (async () => {
      await preceding.catch(() => {});
      if (
        !this.isCurrent(session) ||
        generation !== session.seekGeneration ||
        abort.signal.aborted
      )
        return;
      try {
        try {
          await session.source!.seek(
            tick,
            AbortSignal.any([abort.signal, session.abort.signal]),
          );
          session.error = undefined;
        } catch (error) {
          if (abort.signal.aborted || session.abort.signal.aborted) throw error;
          // The source restores its last committed checkpoint on failure.
          // Rehydrate that position so everyone can keep watching instead of
          // leaving the room permanently stuck in its seeking state.
          session.error =
            error instanceof Error ? error.message : "Couldn't seek the replay";
        }
        if (!this.isCurrent(session) || generation !== session.seekGeneration)
          return;
        session.status = session.source!.complete ? "ended" : "paused";
        session.epoch++;
        session.revision++;
        this.broadcastState(session);
        this.snapshotAll(session);
        this.refreshExpiry(session);
      } catch (error) {
        if (
          !this.isCurrent(session) ||
          generation !== session.seekGeneration ||
          abort.signal.aborted
        )
          return;
        this.failSession(session, error);
      } finally {
        if (session.seekAbort === abort) session.seekAbort = null;
      }
    })();
    session.seekTask = task;
    await task;
  }

  private schedule(session: Session): void {
    this.stopTimer(session);
    if (!this.isCurrent(session) || session.status !== "playing") return;
    const target =
      session.anchorTime +
      (session.source!.tick + 1 - session.anchorTick) * TICK_MS;
    session.timer = setTimeout(
      () => this.pump(session),
      Math.max(0, target - this.options.now()),
    );
    session.timer.unref?.();
  }

  private pump(session: Session): void {
    session.timer = null;
    if (
      !this.isCurrent(session) ||
      session.status !== "playing" ||
      !session.source
    )
      return;
    const target =
      session.anchorTick +
      Math.floor((this.options.now() - session.anchorTime) / TICK_MS);
    try {
      // Bound a stalled relay's catch-up burst; continuation yields to sockets.
      const deadline = performance.now() + 8;
      for (
        let count = 0;
        session.source.tick < target &&
        count < 8 &&
        !session.source.complete &&
        (count === 0 || performance.now() < deadline);
        count++
      ) {
        const before = session.source.tick;
        const events = session.source.advanceOneTick();
        for (const event of events) {
          for (const ws of [...session.participants.keys()]) {
            if (event.kind === "packet")
              this.sendBinary(session, ws, event.data);
            else if (this.canSend(session, ws)) {
              if (event.kind === "info")
                this.send(ws, {
                  type: "replayInfo",
                  sessionId: session.id,
                  epoch: session.epoch,
                  firstPerson: event.firstPerson,
                });
              else
                this.send(ws, {
                  type: "replayTick",
                  sessionId: session.id,
                  epoch: session.epoch,
                  tick: event.tick,
                  move: event.move,
                  firstPerson: event.firstPerson,
                });
            }
          }
        }
        if (session.source.tick === before && !session.source.complete)
          throw new Error("Replay source did not advance");
      }
      if (session.source.complete) {
        session.status = "ended";
        session.epoch++;
        session.revision++;
        this.broadcastState(session);
        this.snapshotAll(session);
        this.refreshExpiry(session);
      } else if (session.status === "playing") this.schedule(session);
    } catch (error) {
      this.failSession(session, error);
    }
  }

  private sendCatchup(
    session: Session,
    ws: WebSocket,
    compressed?: Uint8Array,
  ): void {
    if (
      !session.source ||
      session.status === "preparing" ||
      session.status === "seeking"
    )
      return;
    const bytes = compressed ?? this.catchupBytes(session);
    if (!bytes) return;
    if (!this.canSend(session, ws, bytes.byteLength)) return;
    this.send(ws, {
      type: "catchupBegin",
      address: `replay:${session.id}`,
      epoch: session.epoch,
      totalBytes: bytes.byteLength,
      chunkCount: Math.max(
        1,
        Math.ceil(bytes.byteLength / CATCHUP_CHUNK_BYTES),
      ),
      encoding: "gzip",
    });
    for (
      let offset = 0;
      offset < bytes.byteLength;
      offset += CATCHUP_CHUNK_BYTES
    )
      ws.send(bytes.subarray(offset, offset + CATCHUP_CHUNK_BYTES), {
        binary: true,
      });
    this.send(ws, { type: "catchupEnd" });
  }

  private catchupBytes(session: Session): Uint8Array | null {
    const cached = session.catchupCache;
    if (
      cached &&
      cached.tick === session.source!.tick &&
      cached.epoch === session.epoch &&
      cached.status === session.status
    )
      return cached.bytes;
    try {
      const json = serializeCatchupPayload(
        session.source!.catchup(
          session.id,
          session.epoch,
          session.status === "playing"
            ? "playing"
            : session.status === "ended"
              ? "ended"
              : "paused",
        ),
      );
      if (Buffer.byteLength(json, "utf8") > MAX_CATCHUP_DECOMPRESSED_BYTES)
        throw new Error("Replay snapshot exceeds the decoded size limit");
      const bytes = gzipSync(json, { level: 3 });
      if (bytes.byteLength > MAX_CATCHUP_COMPRESSED_BYTES)
        throw new Error("Replay snapshot exceeds the compressed size limit");
      session.catchupCache = {
        tick: session.source!.tick,
        epoch: session.epoch,
        status: session.status,
        bytes,
      };
      return bytes;
    } catch (error) {
      this.failSession(session, error);
      return null;
    }
  }

  private snapshotAll(session: Session): void {
    if (!session.participants.size) return;
    const compressed = this.catchupBytes(session);
    if (!compressed) return;
    for (const ws of [...session.participants.keys()])
      this.sendCatchup(session, ws, compressed);
  }

  private state(session: Session, ws: WebSocket): ReplayState {
    return {
      sessionId: session.id,
      demo: session.demo,
      recorderName: session.recorderName,
      recordingDate: session.recordingDate,
      tick: session.source?.tick ?? session.releasedTick ?? 0,
      durationTicks:
        session.source?.durationTicks ?? session.releasedDurationTicks ?? 0,
      status: session.status,
      epoch: session.epoch,
      revision: session.revision,
      watcherCount: session.participants.size,
      isOwner: session.participants.get(ws) === true,
      closed: session.closed,
      ...(session.error ? { error: session.error } : {}),
    };
  }

  private sendState(
    session: Session,
    ws: WebSocket,
    ownerToken?: string,
  ): void {
    this.send(ws, {
      type: "replayState",
      ...this.state(session, ws),
      ...(ownerToken ? { ownerToken } : {}),
    });
  }

  private broadcastState(session: Session): void {
    for (const ws of session.participants.keys()) this.sendState(session, ws);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  private canSend(
    session: Session,
    ws: WebSocket,
    additionalBytes = 0,
  ): boolean {
    if (
      ws.readyState !== ws.OPEN ||
      (ws.bufferedAmount ?? 0) + additionalBytes > this.options.maxBufferedBytes
    ) {
      this.detach(ws);
      if (ws.readyState === ws.OPEN)
        ws.close(1013, "Replay viewer fell behind; reconnect to sync");
      return false;
    }
    return session.participants.has(ws);
  }

  private sendBinary(session: Session, ws: WebSocket, bytes: Uint8Array): void {
    if (this.canSend(session, ws, bytes.byteLength))
      ws.send(bytes, { binary: true });
  }

  detach(ws: WebSocket): void {
    const observer = this.uploadSubscriptions.get(ws);
    if (observer)
      this.finishUploadObserver(
        observer,
        new DOMException("Replay upload canceled", "AbortError"),
      );
    const session = this.memberships.get(ws);
    if (!session) return;
    this.memberships.delete(ws);
    const owner = session.participants.get(ws);
    session.participants.delete(ws);
    if (owner && !this.hasOwner(session) && session.status === "preparing") {
      this.destroy(session);
      return;
    }
    this.broadcastState(session);
    this.refreshExpiry(session);
  }

  private hasOwner(session: Session): boolean {
    return [...session.participants.values()].some(Boolean);
  }

  private refreshExpiry(session: Session): void {
    if (
      !session.participants.size ||
      !this.hasOwner(session) ||
      session.status === "ended"
    )
      this.expireLater(session);
    else this.clearExpiry(session);
  }

  private expireLater(session: Session): void {
    if (session.expires) return;
    session.expires = setTimeout(
      () => this.destroy(session),
      this.options.idleTtlMs,
    );
    session.expires.unref?.();
  }

  private clearExpiry(session: Session): void {
    if (session.expires) clearTimeout(session.expires);
    session.expires = null;
  }

  private stopTimer(session: Session): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
  }

  private isCurrent(session: Session): boolean {
    return (
      !this.stopped &&
      this.sessions.get(session.id) === session &&
      !session.abort.signal.aborted
    );
  }

  /** Malformed/oversized state cannot be repaired by reconnecting to this source. */
  private failSession(session: Session, error: unknown): void {
    if (session.closed && session.error) return;
    this.stopTimer(session);
    session.seekAbort?.abort();
    session.status = "ended";
    session.closed = true;
    session.error =
      error instanceof Error ? error.message : "Replay source failed";
    session.epoch++;
    session.revision++;
    this.broadcastState(session);
    this.releaseSource(session);
    this.expireLater(session);
  }

  private destroy(session: Session): void {
    if (this.sessions.get(session.id) !== session) return;
    this.stopTimer(session);
    this.clearExpiry(session);
    session.abort.abort();
    session.seekAbort?.abort();
    session.status = "ended";
    session.closed = true;
    session.revision++;
    this.broadcastState(session);
    for (const ws of session.participants.keys()) this.memberships.delete(ws);
    session.participants.clear();
    this.releaseSource(session);
    this.sessions.delete(session.id);
  }

  private releaseSource(session: Session): void {
    if (session.source) {
      session.releasedTick = session.source.tick;
      session.releasedDurationTicks = session.source.durationTicks;
    }
    session.source = null;
    session.catchupCache = undefined;
  }

  getStatusSummary(): Array<{
    sessionId: string;
    status: ReplayStatus;
    watcherCount: number;
    tick: number;
  }> {
    return [...this.sessions.values()].map((session) => ({
      sessionId: session.id,
      status: session.status,
      watcherCount: session.participants.size,
      tick: session.source?.tick ?? session.releasedTick ?? 0,
    }));
  }

  shutdown(): void {
    for (const observer of this.uploadObservers.values())
      this.finishUploadObserver(
        observer,
        new DOMException("The relay is shutting down", "AbortError"),
      );
    for (const session of this.sessions.values()) this.destroy(session);
    this.stopped = true;
  }
}
