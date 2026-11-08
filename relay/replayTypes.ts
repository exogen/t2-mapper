import type { Move } from "t2-demo-parser";
import type { PublishedGame } from "./gamePresentation.js";

/** Session-only uploads never enter the published demo library. */
export const REPLAY_UPLOAD_PATH = "/replay-upload";
export const MAX_REPLAY_UPLOAD_BYTES = 150_000_000;
export const REPLAY_UPLOAD_TIMEOUT_MS = 2 * 60_000;
export const REPLAY_CLIENT_ID_HEADER = "X-Replay-Client-Id";

/** Private browser-session identity; this never belongs in a shared URL. */
export function isReplayCreatorId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{48}$/.test(value);
}

export interface ReplayUploadResponse {
  sessionId: string;
  ownerToken: string;
}

/** Replay control is independent of the spectator's entirely local camera. */
export type ReplayStatus =
  "preparing" | "seeking" | "paused" | "playing" | "ended";

export interface ReplayState {
  sessionId: string;
  demo: string;
  /** Immutable recording-header metadata, shared by creators and invitees. */
  recorderName?: string | null;
  recordingDate?: string | null;
  tick: number;
  durationTicks: number;
  status: ReplayStatus;
  epoch: number;
  revision: number;
  watcherCount: number;
  isOwner: boolean;
  /** Explicitly ended by the creator; natural EOF remains seekable. */
  closed?: boolean;
  /** Returned privately to the creator; never included in invitation links. */
  ownerToken?: string;
  error?: string;
}

export type ReplayClientMessage =
  | {
      type: "watchReplayUpload";
      uploadId: string;
      totalBytes: number;
      creatorId: string;
    }
  | { type: "createReplay"; demo: string; creatorId: string; tick?: number }
  | { type: "joinReplay"; sessionId: string; ownerToken?: string }
  | { type: "leaveReplay" }
  | { type: "syncReplay"; sessionId: string }
  | {
      type: "controlReplay";
      sessionId: string;
      revision: number;
      action: "play" | "pause" | "seek" | "end";
      tick?: number;
    };

export type ReplayServerMessage =
  | {
      type: "replayGamePresentation";
      sessionId: string;
      epoch: number;
      game: PublishedGame | null;
    }
  | {
      type: "replayUploadProgress";
      uploadId: string;
      receivedBytes: number;
      totalBytes: number;
    }
  | ({ type: "replayState" } & ReplayState)
  | { type: "replayError"; message: string; sessionId?: string }
  | {
      type: "replayInfo";
      sessionId: string;
      epoch: number;
      firstPerson: boolean;
    }
  | {
      type: "replayTick";
      sessionId: string;
      epoch: number;
      tick: number;
      move: Move;
      /** Recorded view mode changes how the recorder's freelook input is simulated. */
      firstPerson: boolean;
    };

/** Additional seed for a live-style catchup at an absolute recording tick. */
export interface ReplayCatchupState {
  sessionId: string;
  epoch: number;
  tick: number;
  status: "paused" | "playing" | "ended";
  pendingMoves: Array<{ id: number; move: Move; firstPerson: boolean }>;
  nextMoveId: number;
  lastClientMoveId: number;
  /** First queued input absent from the saved control pose. */
  controlMoveReplayStartId: number;
  lastMoveAck: number;
  controlMovesAvailable: boolean;
  firstPerson: boolean;
  fov: number;
  absoluteYaw: number;
  absolutePitch: number;
}
