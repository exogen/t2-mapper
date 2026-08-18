import { describe, it, expect } from "vitest";
import {
  serializeCatchupPayload,
  deserializeCatchupPayload,
} from "./watchSerialize";
import type { WatchCatchupPayload } from "./types";

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
});
