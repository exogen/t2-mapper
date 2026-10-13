import { describe, expect, it } from "vitest";
import {
  claimMoveIndex,
  pruneAcknowledgedMoves,
  type PendingMove,
} from "./liveMoveBuffer";

const pending = (...indices: number[]): PendingMove[] =>
  indices.map((moveIndex) => ({ moveIndex }));

describe("pruneAcknowledgedMoves", () => {
  it("drops only the moves below the ack", () => {
    const buffer = pending(4, 5, 6);
    pruneAcknowledgedMoves(buffer, 6);
    expect(buffer).toEqual(pending(6));
  });
});

describe("claimMoveIndex", () => {
  it("continues from the next index once acked moves are pruned", () => {
    const buffer = pending(10, 11, 12);
    expect(claimMoveIndex(buffer, 11, 13)).toBe(13);
    expect(buffer).toEqual(pending(11, 12));
  });

  it("ignores a stale or reset ack", () => {
    // The adapter zeroes its copy of the ack at MissionStartPhase1.
    const buffer = pending(5000, 5001);
    expect(claimMoveIndex(buffer, 0, 5002)).toBe(5002);
    expect(buffer).toHaveLength(2);
  });

  it("jumps an index the server has already acknowledged", () => {
    // A restarted index would be discarded as already received.
    expect(claimMoveIndex([], 5000, 0)).toBe(5000);
  });

  it("pauses at 30 unacked moves until an ack arrives", () => {
    const buffer = pending(...Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(claimMoveIndex(buffer, 100, 130)).toBeNull();
    expect(claimMoveIndex(buffer, 101, 130)).toBe(130);
    expect(buffer).toHaveLength(29);
  });
});
