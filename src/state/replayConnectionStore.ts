import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { ReplayClientMessage, ReplayState } from "../../relay/replayTypes";
import { REPLAY_UPLOAD_TIMEOUT_MS } from "../../relay/replayTypes";
import { RelayClient } from "../stream/relayClient";
import { ReplayStreamAdapter } from "../stream/replayStreaming";
import { STREAM_TICK_SEC } from "../stream/streamHelpers";
import { unloadDemo } from "../stream/demoFileLoader";
import { uploadReplay } from "../stream/replayUpload";
import { engineStore } from "./engineStore";
import { liveConnectionStore } from "./liveConnectionStore";
import { gameEntityStore } from "./gameEntityStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { casterStore } from "./casterStore";
import { randomId } from "../randomId";
import { getReplayCreatorId } from "./replayCreatorId";

type ReplayAction = Extract<
  ReplayClientMessage,
  { type: "controlReplay" }
>["action"];

export interface ReplayConnectionState {
  state: ReplayState | null;
  sessionId: string | null;
  adapter: ReplayStreamAdapter | null;
  /** Distinguishes repeated loads of the same map without changing on seek. */
  missionIdentity: string | null;
  ready: boolean;
  connecting: boolean;
  uploading: boolean;
  /** Server-received upload bytes / total bytes; 1 still awaits preparation. */
  uploadProgress: number | null;
  error: string | null;
  relayUrl: string;
  _relay: RelayClient | null;
  create(demo: string, tick?: number): void;
  createLocal(buffer: ArrayBuffer, name: string, tick?: number): void;
  join(sessionId: string): void;
  leave(): void;
  control(action: ReplayAction, tick?: number): void;
  sync(): void;
}

const DEFAULT_RELAY_URL = process.env.RELAY_URL || "ws://localhost:8765";
const RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 10_000];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let removeVisibilityListener: (() => void) | null = null;
let generation = 0;
interface PendingUpload {
  id: string;
  creatorId: string;
  totalBytes: number;
  buffer: ArrayBuffer | null;
  name: string;
  tick?: number;
  abort: AbortController;
  started: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
let pendingUpload: PendingUpload | null = null;
const ownerTokens = new Map<string, string>();

function tokenKey(url: string, sessionId: string): string {
  return `mapgenius.replay.owner:${url}:${sessionId}`;
}

function ownerToken(
  url: string,
  sessionId: string,
  token?: string,
): string | undefined {
  const key = tokenKey(url, sessionId);
  if (token) ownerTokens.set(key, token);
  try {
    if (token) sessionStorage.setItem(key, token);
    return sessionStorage.getItem(key) ?? ownerTokens.get(key);
  } catch {
    return ownerTokens.get(key);
  }
}

export const replayConnectionStore = createStore<ReplayConnectionState>(
  (set, get) => {
    function clearUpload(cancel = true) {
      const upload = pendingUpload;
      pendingUpload = null;
      if (!upload) return;
      upload.buffer = null;
      if (upload.timer) clearTimeout(upload.timer);
      upload.timer = null;
      if (cancel) upload.abort.abort();
    }

    function failUpload(error: unknown) {
      clearUpload();
      removeVisibilityListener?.();
      removeVisibilityListener = null;
      const relay = get()._relay;
      set({
        _relay: null,
        uploading: false,
        uploadProgress: null,
        connecting: false,
        error:
          error instanceof Error ? error.message : "Couldn't upload the demo",
      });
      relay?.close();
    }

    function close() {
      generation++;
      clearUpload();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      removeVisibilityListener?.();
      removeVisibilityListener = null;
      const relay = get()._relay;
      set({ _relay: null });
      relay?.close();
    }

    function hold() {
      get().adapter?.hold();
      if (
        engineStore.getState().playback.recording?.streamingPlayback ===
        get().adapter
      )
        engineStore.getState().setPlaybackStatus("paused");
    }

    function failAttempt(message: string) {
      hold();
      close();
      const state = get().state;
      set({
        ready: false,
        connecting: false,
        state: state
          ? { ...state, status: "ended", closed: true, error: message }
          : null,
        error: message,
      });
    }

    function connect(
      intent:
        | { demo: string; creatorId: string; tick?: number }
        | { sessionId: string }
        | { uploadId: string; totalBytes: number; creatorId: string },
      attempt = 0,
    ) {
      const currentGeneration = generation;
      const url = get().relayUrl;
      const current = () =>
        currentGeneration === generation && get()._relay === relay;
      const uploadCurrent = (upload: PendingUpload) =>
        current() && pendingUpload === upload && !upload.abort.signal.aborted;
      const startUpload = (upload: PendingUpload) => {
        const buffer = upload.buffer;
        if (!buffer || upload.started || !uploadCurrent(upload)) return;
        upload.started = true;
        // Socket handlers retain only metadata after this handoff. Only the
        // in-flight HTTP request needs to retain the possibly large body.
        upload.buffer = null;
        void uploadReplay(url, buffer, upload.name, {
          creatorId: upload.creatorId,
          tick: upload.tick,
          signal: upload.abort.signal,
          uploadId: upload.id,
        })
          .then(({ sessionId, ownerToken: token }) => {
            if (!uploadCurrent(upload)) return;
            clearUpload(false);
            ownerToken(url, sessionId, token);
            set({ sessionId, uploading: false, uploadProgress: null });
            relay.joinReplay(sessionId, token);
          })
          .catch((error) => {
            if (uploadCurrent(upload)) failUpload(error);
          });
      };
      const updateMissionIdentity = (
        missionName: string,
        sequence?: string | null,
      ) => {
        const sessionId = get().sessionId;
        if (!current() || !sessionId) return;
        const identity = JSON.stringify([
          sequence ?? missionName,
          missionName.toLowerCase(),
        ]);
        if (get().missionIdentity !== identity) {
          if (get().missionIdentity !== null)
            streamPlaybackStore.setState({
              followEntityId: null,
              followTargetId: null,
              followPlayer: null,
              followFlagSlot: null,
              lastFollowTargetId: null,
              lastFollowGhostIndex: null,
              cameraMode: "freeFly",
            });
          set({ missionIdentity: identity });
        }
        casterStore
          .getState()
          .activate(
            `replay:${sessionId}`,
            sequence ?? missionName,
            missionName,
          );
      };
      const relay = new RelayClient(url, {
        onOpen() {
          if (!current()) return;
          if ("demo" in intent)
            relay.createReplay(intent.demo, intent.creatorId, intent.tick);
          else if ("uploadId" in intent)
            relay.watchReplayUpload(
              intent.uploadId,
              intent.totalBytes,
              intent.creatorId,
            );
          else
            relay.joinReplay(
              intent.sessionId,
              ownerToken(url, intent.sessionId),
            );
        },
        onReplayUploadProgress(message) {
          const upload = pendingUpload;
          if (
            !upload ||
            !uploadCurrent(upload) ||
            message.uploadId !== upload.id ||
            message.totalBytes !== upload.totalBytes ||
            !Number.isSafeInteger(message.totalBytes) ||
            message.totalBytes <= 0 ||
            !Number.isSafeInteger(message.receivedBytes) ||
            message.receivedBytes < 0 ||
            message.receivedBytes > message.totalBytes
          )
            return;
          if (!upload.started) {
            if (message.receivedBytes !== 0) return;
            startUpload(upload);
          }
          const next = Math.max(
            get().uploadProgress ?? 0,
            Math.floor((message.receivedBytes / message.totalBytes) * 100) /
              100,
          );
          if (next !== get().uploadProgress) set({ uploadProgress: next });
        },
        onReplayState(state) {
          if (
            !current() ||
            (get().sessionId && get().sessionId !== state.sessionId)
          )
            return;
          const previous = get().state;
          if (
            previous &&
            (state.epoch < previous.epoch || state.revision < previous.revision)
          )
            return;
          if (state.ownerToken)
            ownerToken(url, state.sessionId, state.ownerToken);
          // Credentials remain private storage, never React-visible/shareable state.
          const { ownerToken: _token, ...publicState } = state;
          if (state.status !== "playing") hold();
          get().adapter?.applyState(publicState);
          const resetPending =
            previous?.epoch !== state.epoch ||
            state.status === "preparing" ||
            state.status === "seeking";
          set({
            state: publicState,
            sessionId: state.sessionId,
            error: state.error ?? null,
            connecting:
              resetPending ||
              !get().ready ||
              state.status === "preparing" ||
              state.status === "seeking",
            ...(resetPending ? { ready: false } : {}),
          });
          if (
            state.status === "playing" &&
            get().ready &&
            engineStore.getState().playback.recording?.streamingPlayback ===
              get().adapter
          )
            engineStore.getState().setPlaybackStatus("playing");
          if (state.status === "ended") {
            set({ connecting: false });
          }
        },
        onCatchup(payload) {
          if (
            !current() ||
            payload.replay?.sessionId !== get().sessionId ||
            payload.replay.epoch !== get().state?.epoch
          )
            return;
          const adapter = get().adapter!;
          adapter.hydrate(payload);
          if (adapter.missionName)
            updateMissionIdentity(adapter.missionName, payload.missionSequence);
          // Entity lifetimes change, while a selected player identity survives
          // hydration within the same mission.
          streamPlaybackStore.setState({ followEntityId: null });
          set({
            ready: true,
            connecting: false,
            error: get().state?.error ?? null,
          });
          if (
            engineStore.getState().playback.recording?.streamingPlayback ===
            adapter
          ) {
            const replay = payload.replay;
            // Reuse the engine's traversal token so old audio loads/effect
            // pools cannot survive a seek. The adapter revision rebases the
            // render clock directly; this does not ask a live source to seek.
            engineStore.setState(({ playback }) => ({
              playback: {
                ...playback,
                status: replay.status === "playing" ? "playing" : "paused",
                seekTime: replay.tick * STREAM_TICK_SEC,
                seekNonce: playback.seekNonce + 1,
                seekProgress: null,
                resumeAfterSeek: null,
                pendingSeekSec: null,
              },
            }));
          }
        },
        onGamePacket(data) {
          if (current()) get().adapter?.feedPacket(data);
        },
        onReplayTick(message) {
          if (!current()) return;
          get().adapter?.feedReplayTick(message);
          const state = get().state;
          // Keep React notifications near once per second; the adapter retains
          // every authoritative tick for control and rendering.
          if (
            state?.status === "playing" &&
            Math.floor(state.tick / 32) !== Math.floor(message.tick / 32)
          )
            set({ state: { ...state, tick: message.tick } });
        },
        onReplayInfo(message) {
          if (current()) get().adapter?.feedReplayInfo(message);
        },
        onReplayError(message) {
          if (!current()) return;
          if (pendingUpload) {
            failUpload(new Error(message));
            return;
          }
          if (!get().ready) {
            failAttempt(message);
            return;
          }
          set({ connecting: false, error: message });
        },
        onError(message) {
          if (!current()) return;
          if (pendingUpload) failUpload(new Error(message));
          else set({ error: message });
        },
        onClose() {
          if (!current()) return;
          if (pendingUpload) {
            failUpload(
              new Error(
                "Connection closed while uploading the demo; try again",
              ),
            );
            return;
          }
          hold();
          const sessionId = get().sessionId;
          const reconnect = !!sessionId && !get().state?.closed;
          set({
            _relay: null,
            ready: false,
            connecting: reconnect,
          });
          if (!reconnect) {
            if (!sessionId)
              set({
                connecting: false,
                error:
                  "Connection closed before the replay session was created",
              });
            return;
          }
          reconnectTimer = setTimeout(
            () => {
              reconnectTimer = null;
              if (generation === currentGeneration)
                connect({ sessionId }, attempt + 1);
            },
            RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)],
          );
        },
      });
      const adapter = get().adapter ?? new ReplayStreamAdapter(relay);
      adapter.relay = relay;
      adapter.onParseFault = () => {
        if (current()) get().sync();
      };
      // The renderer owns onMissionInfoChange once attached. Keep mission
      // identity updates independent so a slow source load or map change
      // still enables map information and command-circuit navigation.
      adapter.onMissionChange = (missionName) => {
        if (current()) {
          gameEntityStore.getState().setMissionInfo({ missionName });
          updateMissionIdentity(missionName, adapter.missionSequence);
        }
      };
      adapter.onMissionIdentity = (sequence, missionName) => {
        updateMissionIdentity(missionName, sequence);
      };
      adapter.onMissionInfoChange = () => {
        if (!current()) return;
        gameEntityStore.getState().setMissionInfo({
          missionName: adapter.missionName ?? undefined,
          missionDisplayName: adapter.missionDisplayName ?? undefined,
          missionTypeDisplayName: adapter.missionTypeDisplayName ?? undefined,
          gameClassName: adapter.gameClassName ?? undefined,
          serverDisplayName: adapter.serverDisplayName ?? undefined,
        });
      };
      set({ _relay: relay, adapter });
      relay.connect();
    }

    function begin() {
      close();
      const live = liveConnectionStore.getState();
      live.leaveServer();
      live.disconnectRelay();
      unloadDemo();
      set({
        state: null,
        sessionId: null,
        adapter: null,
        missionIdentity: null,
        ready: false,
        connecting: true,
        uploading: false,
        uploadProgress: null,
        error: null,
      });
      if (typeof document !== "undefined") {
        const onVisibility = () => {
          if (
            document.visibilityState === "visible" &&
            get().state?.status === "playing"
          )
            get().sync();
        };
        document.addEventListener("visibilitychange", onVisibility);
        removeVisibilityListener = () =>
          document.removeEventListener("visibilitychange", onVisibility);
      }
    }

    return {
      state: null,
      sessionId: null,
      adapter: null,
      missionIdentity: null,
      ready: false,
      connecting: false,
      uploading: false,
      uploadProgress: null,
      error: null,
      relayUrl: DEFAULT_RELAY_URL,
      _relay: null,
      create(demo, tick) {
        begin();
        try {
          connect({ demo, tick, creatorId: getReplayCreatorId() });
        } catch (error) {
          failAttempt(
            error instanceof Error
              ? error.message
              : "Couldn't create the replay session",
          );
        }
      },
      createLocal(buffer, name, tick) {
        begin();
        try {
          const creatorId = getReplayCreatorId();
          const id = randomId();
          const upload: PendingUpload = {
            id,
            creatorId,
            totalBytes: buffer.byteLength,
            buffer,
            name,
            tick,
            abort: new AbortController(),
            started: false,
            timer: null,
          };
          pendingUpload = upload;
          set({ uploading: true, uploadProgress: 0 });
          upload.timer = setTimeout(() => {
            if (pendingUpload === upload)
              failUpload(new Error("Uploading the demo timed out; try again"));
          }, REPLAY_UPLOAD_TIMEOUT_MS);
          connect({
            uploadId: upload.id,
            totalBytes: upload.totalBytes,
            creatorId,
          });
        } catch (error) {
          failUpload(error);
        }
      },
      join(sessionId) {
        begin();
        set({ sessionId });
        connect({ sessionId });
      },
      leave() {
        const sessionId = get().sessionId;
        get()._relay?.leaveReplay();
        close();
        if (
          sessionId &&
          casterStore.getState().context?.server === `replay:${sessionId}`
        )
          casterStore.getState().suspend();
        set({
          state: null,
          sessionId: null,
          adapter: null,
          missionIdentity: null,
          ready: false,
          connecting: false,
          uploading: false,
          uploadProgress: null,
          error: null,
        });
      },
      control(action, tick) {
        const state = get().state;
        if (
          !state?.isOwner ||
          (action === "seek" && (!Number.isSafeInteger(tick) || tick! < 0))
        )
          return;
        get()._relay?.controlReplay(
          state.sessionId,
          state.revision,
          action,
          tick,
        );
      },
      sync() {
        const { sessionId, _relay } = get();
        if (!sessionId || !_relay?.connected) return;
        hold();
        set({ ready: false, connecting: true });
        _relay.syncReplay(sessionId);
      },
    };
  },
);

export function useReplaySelector<T>(
  selector: (state: ReplayConnectionState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(replayConnectionStore, selector, equality);
}
