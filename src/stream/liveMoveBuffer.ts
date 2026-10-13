import { MAX_MOVE_COUNT } from "../../relay/moveList";

/**
 * A live move kept for prediction replay until the server acknowledges it.
 */
export interface PendingMove {
  moveIndex: number;
}

/**
 * Drop the moves the server's lastMoveAck covers from the front of a
 * prediction buffer.
 */
export function pruneAcknowledgedMoves(
  buffer: PendingMove[],
  ack: number,
): void {
  while (buffer.length > 0 && buffer[0].moveIndex < ack) buffer.shift();
}

/**
 * The index for this tick's move, after pruning acknowledged moves, or
 * null while backlogged: with MaxMoveCount moves unacked, isBacklogged
 * (Tribes2.exe FUN_00601e50) stops collecting until the server catches
 * up, and the server's move credit holds no more anyway. An index the
 * server has acknowledged is never reused — the server would discard the
 * move as already received — so a stale `nextIndex` jumps to the ack.
 */
export function claimMoveIndex(
  buffer: PendingMove[],
  ack: number,
  nextIndex: number,
): number | null {
  pruneAcknowledgedMoves(buffer, ack);
  if (buffer.length >= MAX_MOVE_COUNT) return null;
  return Math.max(nextIndex, ack);
}
