import type { ClientMoveData } from "./protocol.js";

/**
 * TickMs: the client collects one move per simulation tick.
 */
export const MOVE_TICK_MS = 32;
/**
 * MaxMoveCount: the most moves one packet carries (moveWritePacket) and
 * the unacked depth at which isBacklogged (FUN_00601e50) stalls the
 * real client's ticks. The server's move credit caps at the same 30.
 */
export const MAX_MOVE_COUNT = 30;
/**
 * getNextMove (FUN_006019b0) refuses new moves above this many queued.
 */
export const MAX_MOVE_QUEUE_SIZE = 45;
/**
 * moveWritePacket skips moves sent this many times (keeping the newest).
 */
const MAX_MOVE_PACKET_SENDS = 4;

/**
 * No input: an idle observer's move.
 */
export const NEUTRAL_MOVE: ClientMoveData = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  freeLook: false,
  trigger: [false, false, false, false, false, false],
};

interface QueuedMove {
  move: ClientMoveData;
  sendCount: number;
}

/**
 * The client half of the V12 move protocol (GameConnection::mMoveList),
 * binary-verified against Tribes2.exe: moves are queued with consecutive
 * indices, data packets resend the unacknowledged ones, and the server's
 * lastMoveAck pops them. The server dedupes by start index
 * (moveReadPacket, FUN_00601f30) and jumps its ack over any gap.
 */
export class ClientMoveList {
  /**
   * mFirstMoveIndex: the oldest unacknowledged move's index.
   */
  private firstIndex = 0;
  private moves: QueuedMove[] = [];
  private readonly maxSends: number;

  /**
   * `maxSends` is how many packets carry a move before moveWritePacket
   * skips it: the engine's 4 by default. Infinity resends every move
   * until it is acked, so no burst of lost packets can drop one.
   */
  constructor(options: { maxSends?: number } = {}) {
    this.maxSends = options.maxSends ?? MAX_MOVE_PACKET_SENDS;
  }

  /**
   * Unacknowledged moves.
   */
  get size(): number {
    return this.moves.length;
  }

  /**
   * The index the next queued move receives.
   */
  get nextIndex(): number {
    return this.firstIndex + this.moves.length;
  }

  /**
   * A queued move has never been sent.
   */
  get hasUnsent(): boolean {
    return this.moves.at(-1)?.sendCount === 0;
  }

  /**
   * pushMove, refused past the queue limit like getNextMove.
   */
  push(move: ClientMoveData): boolean {
    if (this.moves.length > MAX_MOVE_QUEUE_SIZE) return false;
    this.moves.push({ move, sendCount: 0 });
    return true;
  }

  /**
   * Queue moves indexed by their producer (the browser, which predicts
   * them). Indices already queued or acknowledged are skipped. A gap (a
   * producer that started over) restarts the list at the new index; the
   * server jumps its ack over a gap the same way.
   */
  merge(startIndex: number, moves: readonly ClientMoveData[]): void {
    for (let i = 0; i < moves.length; i++) {
      const index = startIndex + i;
      if (index < this.nextIndex) continue;
      if (index > this.nextIndex) {
        this.moves = [];
        this.firstIndex = index;
      }
      if (!this.push(moves[i])) return;
    }
  }

  /**
   * GameConnection::readPacket (FUN_005fb9f0): pop every move the
   * server's lastMoveAck covers. An ack past the queue still advances
   * the first index, as the engine's pop loop does.
   */
  acknowledge(ack: number): void {
    if (ack <= this.firstIndex) return;
    this.moves.splice(0, ack - this.firstIndex);
    this.firstIndex = ack;
  }

  /**
   * moveWritePacket (FUN_00601e90): from the oldest move sent fewer than
   * `maxSends` times (always at least the newest), up to MaxMoveCount
   * moves. Counts every move as sent, whether or not the packet arrives.
   */
  takePacketMoves(): { start: number; moves: ClientMoveData[] } {
    let offset = this.moves.findIndex((m) => m.sendCount < this.maxSends);
    if (offset < 0) offset = Math.max(0, this.moves.length - 1);
    const taken = this.moves.slice(offset, offset + MAX_MOVE_COUNT);
    for (const entry of taken) entry.sendCount++;
    return {
      start: this.firstIndex + offset,
      moves: taken.map((entry) => entry.move),
    };
  }
}

/**
 * Validate a browser's move batch, which arrives as untrusted JSON. The
 * start index must be a 32-bit move index; each move's fields fall back
 * to neutral values, and a batch never exceeds what the list can queue.
 */
export function parseMoveBatch(
  moves: unknown,
  startIndex: unknown,
): { moves: ClientMoveData[]; startIndex: number } | null {
  if (
    !Array.isArray(moves) ||
    typeof startIndex !== "number" ||
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    startIndex > 0xffffffff
  ) {
    return null;
  }
  return {
    moves: moves.slice(0, MAX_MOVE_QUEUE_SIZE + 1).map(parseMove),
    startIndex,
  };
}

function parseMove(value: unknown): ClientMoveData {
  const move = (value ?? {}) as Partial<Record<keyof ClientMoveData, unknown>>;
  const finite = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const trigger = Array.isArray(move.trigger) ? move.trigger : [];
  return {
    x: finite(move.x),
    y: finite(move.y),
    z: finite(move.z),
    yaw: finite(move.yaw),
    pitch: finite(move.pitch),
    roll: finite(move.roll),
    freeLook: move.freeLook === true,
    trigger: Array.from({ length: 6 }, (_, i) => trigger[i] === true),
  };
}
