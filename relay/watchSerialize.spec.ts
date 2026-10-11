import { describe, it, expect, vi } from "vitest";
import { createLiveParser, GhostStateAccumulator } from "t2-demo-parser";
import {
  CatchupDataBlockCache,
  serializeCatchupPayload,
  deserializeCatchupPayload,
} from "./watchSerialize";
import type { WatchCatchupPayload } from "./types";
import { buildCatchupPayload } from "./watchCatchup";
import { WatchStateAccumulator } from "./watchState";

function emptyPayload(): WatchCatchupPayload {
  return buildCatchupPayload({
    packetParser: createLiveParser().packetParser,
    ghostState: new GhostStateAccumulator(),
    watchState: new WatchStateAccumulator(),
    epoch: 1,
    serverAddress: "test:28000",
  });
}

/** The previous wire codec, kept as an independent equivalence oracle. */
function originalSerialize(payload: WatchCatchupPayload): string {
  return JSON.stringify(payload, (_key, value) =>
    value instanceof Uint8Array
      ? { $u8: Buffer.from(value).toString("base64") }
      : value,
  );
}

describe("watchSerialize", () => {
  it("round-trips Uint8Array event data via base64", () => {
    const payload = {
      epoch: 3,
      serverAddress: "1.2.3.4:28000",
      taggedStrings: [[1, "hello"]],
      dataBlocks: [[161, { className: "PlayerData", data: { shape: "x" } }]],
      targetEntries: [{ targetId: 5, sensorGroup: 2 }],
      sensorGroupColors: [],
      connectionState: {
        lastSeqRecvdAtSend: new Array(32).fill(0),
        lastSeqRecvd: 7,
        highestAckedSeq: 0,
        lastSendSeq: 0x1fffffff,
        ackMask: 0,
        connectSequence: 1,
        lastRecvAckAck: 0,
        connectionEstablished: true,
      },
      nextRecvEventSeq: 42,
      initialGhosts: [],
      controlObjectGhostIndex: -1,
      missionName: "Katabatic",
      compressionPoint: { x: 1.5, y: -2, z: 100 },
      pendingGuaranteedEvents: [
        {
          absoluteSequenceNumber: 43,
          event: {
            classId: 20,
            guaranteed: true,
            dataBitsStart: 0,
            dataBitsEnd: 0,
            parsedData: {
              type: "SimVoiceStreamEvent",
              audioData: new Uint8Array([0, 1, 2, 250, 255]),
            },
          },
        },
      ],
      playerSensorGroup: 2,
      hudState: { playerRoster: [], teamScores: [] },
    } as unknown as WatchCatchupPayload;

    const restored = deserializeCatchupPayload(
      serializeCatchupPayload(payload),
    );
    const audio = restored.pendingGuaranteedEvents[0].event.parsedData
      ?.audioData as Uint8Array;
    expect(audio).toBeInstanceOf(Uint8Array);
    expect([...audio]).toEqual([0, 1, 2, 250, 255]);
    expect(restored.compressionPoint).toEqual({ x: 1.5, y: -2, z: 100 });
    expect(restored.connectionState.lastSendSeq).toBe(0x1fffffff);
    expect(restored.taggedStrings).toEqual([[1, "hello"]]);
  });

  it("preserves the original wire JSON, including optional fields and queued bytes", () => {
    const payload = emptyPayload();
    payload.missionName = 'quote" slash\\ newline\n 🚩 lone\ud800';
    payload.missionSequence = null;
    payload.controlObjectData = {
      omitted: undefined,
      values: [undefined, NaN, Infinity, -0, null],
    };
    payload.dataBlocks = [
      [
        7,
        {
          className: "UnknownData",
          data: {
            futureField: {
              text: '"dataBlocks":[]',
              numbers: [0.25, 1e30, -2],
            },
          },
        },
      ],
    ];
    payload.pendingGuaranteedEvents = [
      {
        absoluteSequenceNumber: 42,
        event: {
          classId: 20,
          guaranteed: true,
          dataBitsStart: 0,
          dataBitsEnd: 0,
          parsedData: {
            type: "SimVoiceStreamEvent",
            frames: [
              new Uint8Array(),
              new Uint8Array([9, 1, 128, 255, 9]).subarray(1, 4),
            ],
            audioData: new Uint8Array(65537).fill(217),
          },
        },
      },
    ];
    const expected = originalSerialize(payload);
    const cache = new CatchupDataBlockCache();
    expect(serializeCatchupPayload(payload)).toBe(expected);
    expect(serializeCatchupPayload(payload, cache)).toBe(expected);
    expect(serializeCatchupPayload(payload, cache)).toBe(expected);
    expect(originalSerialize(payload)).toBe(expected);
    expect(deserializeCatchupPayload(expected).pendingGuaranteedEvents).toEqual(
      payload.pendingGuaranteedEvents,
    );
  });

  it("reuses datablocks across newly built snapshots while updating other fields", () => {
    const payload = emptyPayload();
    const cache = new CatchupDataBlockCache();
    payload.dataBlocks = [
      [7, { className: "PlayerData", data: { mass: 100 } }],
    ];
    serializeCatchupPayload(payload, cache);
    payload.dataBlocks = payload.dataBlocks.map(([id, block]) => [
      id,
      { ...block },
    ]);
    payload.epoch++;
    payload.nextRecvEventSeq++;
    payload.hudState.clock = { durationMs: 1200000, elapsedMs: 1234 };
    const expected = originalSerialize(payload);
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      expect(serializeCatchupPayload(payload, cache)).toBe(expected);
      expect(
        stringify.mock.calls.some(([value]) => value === payload.dataBlocks),
      ).toBe(false);
    } finally {
      stringify.mockRestore();
    }
  });

  it("refreshes cached tables for replacements, class names, membership and ordering", () => {
    const payload = emptyPayload();
    const cache = new CatchupDataBlockCache();
    const check = () => {
      const expected = originalSerialize(payload);
      expect(serializeCatchupPayload(payload, cache)).toBe(expected);
      expect(serializeCatchupPayload(payload, cache)).toBe(expected);
    };
    check();
    payload.dataBlocks = [
      [7, { className: "PlayerData", data: { mass: 100 } }],
    ];
    check();
    // Same ID/count/class: SimDataBlockEvent replaces the immutable value.
    payload.dataBlocks[0][1].data = { mass: 200 };
    check();
    payload.dataBlocks[0][1].className = "VehicleData";
    check();
    payload.dataBlocks.push([9, { className: "ItemData", data: { mass: 10 } }]);
    check();
    payload.dataBlocks.reverse();
    check();
    payload.dataBlocks[0][0] = 10;
    check();
    payload.dataBlocks.pop();
    check();
    payload.dataBlocks = [];
    check();
  });

  it("does not cache a failed serialization", () => {
    const payload = emptyPayload();
    const cache = new CatchupDataBlockCache();
    serializeCatchupPayload(payload, cache);
    payload.dataBlocks = [[1, { className: "BadData", data: { invalid: 1n } }]];
    expect(() => serializeCatchupPayload(payload, cache)).toThrow(TypeError);
    payload.dataBlocks[0][1].data = { valid: 1 };
    expect(serializeCatchupPayload(payload, cache)).toBe(
      originalSerialize(payload),
    );
  });
});
