import { describe, expect, it } from "vitest";
import {
  ClientMoveList,
  MAX_MOVE_COUNT,
  MAX_MOVE_QUEUE_SIZE,
  NEUTRAL_MOVE,
  parseMoveBatch,
} from "./moveList.js";
import type { ClientMoveData } from "./protocol.js";

function move(yaw: number): ClientMoveData {
  return { ...NEUTRAL_MOVE, yaw };
}

describe("ClientMoveList", () => {
  it("resends unacked moves until acknowledged, then starts after the ack", () => {
    const list = new ClientMoveList();
    list.push(move(0));
    expect(list.hasUnsent).toBe(true);
    expect(list.takePacketMoves()).toEqual({ start: 0, moves: [move(0)] });
    expect(list.hasUnsent).toBe(false);

    list.push(move(1));
    expect(list.takePacketMoves()).toEqual({
      start: 0,
      moves: [move(0), move(1)],
    });

    list.acknowledge(1);
    expect(list.size).toBe(1);
    expect(list.takePacketMoves()).toEqual({ start: 1, moves: [move(1)] });
  });

  it("skips moves sent four times but always keeps the newest", () => {
    const list = new ClientMoveList();
    list.push(move(0));
    list.push(move(1));
    for (let i = 0; i < 4; i++) list.takePacketMoves();
    // Both have been sent four times: only the newest is still resent.
    expect(list.takePacketMoves()).toEqual({ start: 1, moves: [move(1)] });

    list.push(move(2));
    expect(list.takePacketMoves()).toEqual({ start: 2, moves: [move(2)] });
  });

  it("can resend every move until acknowledged", () => {
    const list = new ClientMoveList({ maxSends: Infinity });
    list.push(move(0));
    list.push(move(1));
    for (let i = 0; i < 4; i++) list.takePacketMoves();
    expect(list.takePacketMoves()).toEqual({
      start: 0,
      moves: [move(0), move(1)],
    });
  });

  it("sends at most MaxMoveCount moves per packet, oldest first", () => {
    const list = new ClientMoveList();
    for (let i = 0; i < MAX_MOVE_COUNT + 5; i++) list.push(move(i));
    const packet = list.takePacketMoves();
    expect(packet.start).toBe(0);
    expect(packet.moves).toHaveLength(MAX_MOVE_COUNT);
    expect(packet.moves.at(-1)).toEqual(move(MAX_MOVE_COUNT - 1));
  });

  it("refuses moves past the queue limit like getNextMove", () => {
    const list = new ClientMoveList();
    for (let i = 0; i <= MAX_MOVE_QUEUE_SIZE; i++) {
      expect(list.push(move(i))).toBe(true);
    }
    expect(list.push(move(99))).toBe(false);
    expect(list.size).toBe(MAX_MOVE_QUEUE_SIZE + 1);
  });

  it("advances past an ack beyond the queue and ignores stale acks", () => {
    const list = new ClientMoveList();
    list.push(move(0));
    list.acknowledge(10);
    expect(list.size).toBe(0);
    expect(list.nextIndex).toBe(10);
    list.acknowledge(4);
    expect(list.nextIndex).toBe(10);
    list.push(move(10));
    expect(list.takePacketMoves().start).toBe(10);
  });

  it("appends one-move batches at consecutive indices", () => {
    const list = new ClientMoveList();
    list.merge(0, [move(0)]);
    list.merge(1, [move(1)]);
    expect(list.takePacketMoves()).toEqual({
      start: 0,
      moves: [move(0), move(1)],
    });
  });

  it("merges producer batches by index, skipping resent moves", () => {
    const list = new ClientMoveList();
    list.merge(0, [move(0), move(1)]);
    list.merge(0, [move(0), move(1), move(2)]);
    expect(list.takePacketMoves()).toEqual({
      start: 0,
      moves: [move(0), move(1), move(2)],
    });
    list.acknowledge(2);
    list.merge(1, [move(1)]);
    expect(list.size).toBe(1);
  });

  it("restarts at a producer's index gap, as the server's ack jumps", () => {
    const list = new ClientMoveList();
    list.merge(0, [move(0), move(1)]);
    list.merge(5000, [move(5000)]);
    expect(list.takePacketMoves()).toEqual({
      start: 5000,
      moves: [move(5000)],
    });
  });
});

describe("parseMoveBatch", () => {
  it("passes well-formed moves through", () => {
    const moves = [move(0.5), { ...move(0), trigger: [true, true] }];
    expect(parseMoveBatch(moves, 12)).toEqual({
      startIndex: 12,
      moves: [
        move(0.5),
        { ...move(0), trigger: [true, true, false, false, false, false] },
      ],
    });
  });

  it("neutralizes malformed fields instead of queuing them", () => {
    const parsed = parseMoveBatch(
      [null, { x: "1", yaw: NaN, trigger: "nope", freeLook: 1 }],
      0,
    );
    expect(parsed?.moves).toEqual([NEUTRAL_MOVE, NEUTRAL_MOVE]);
  });

  it.each([
    ["a missing array", undefined, 0],
    ["a negative index", [], -1],
    ["a fractional index", [], 1.5],
    ["an index past 32 bits", [], 2 ** 32],
    ["a string index", [], "3"],
  ])("rejects %s", (_label, moves, startIndex) => {
    expect(parseMoveBatch(moves, startIndex)).toBeNull();
  });

  it("keeps no more of a batch than the list can queue", () => {
    const parsed = parseMoveBatch(Array(1000).fill(NEUTRAL_MOVE), 0);
    expect(parsed?.moves).toHaveLength(MAX_MOVE_QUEUE_SIZE + 1);
  });
});
