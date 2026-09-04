import { describe, expect, it } from "vitest";
import { BitStream } from "t2-demo-parser";
import {
  ConnectionProtocol,
  PING_RETRY_COUNT,
  PING_TIMEOUT_MS,
  PingTimeout,
  buildClientGamePacket,
  buildGhostingMessageEvent,
} from "./protocol.js";

/** Read back the guaranteed-event section of a client game packet. */
function readGuaranteedEventSeqs(packet: Uint8Array): number[] {
  const bs = new BitStream(packet);
  bs.readFlag(); // gameFlag
  bs.readInt(1); // connectSeqBit
  bs.readInt(9); // seqNumber
  bs.readInt(9); // highestAck
  bs.readInt(2); // packetType
  const ackByteCount = bs.readInt(3);
  if (ackByteCount > 0) bs.readInt(ackByteCount * 8);
  bs.readFlag(); // mCurRate.changed
  bs.readFlag(); // mMaxRate.changed (no maxRate passed in these tests)
  bs.readFlag(); // firstPerson
  bs.readU32(); // control object checksum
  bs.readU32(); // moveStartIndex
  expect(bs.readInt(5)).toBe(0); // move count
  bs.readFlag(); // FOV change
  expect(bs.readFlag()).toBe(false); // end of unguaranteed events

  const seqs: number[] = [];
  let prevSeq = -1;
  while (bs.readFlag()) {
    const sequential = bs.readFlag();
    const seq = sequential ? prevSeq + 1 : bs.readInt(7);
    prevSeq = seq;
    seqs.push(seq);
    bs.readInt(6); // classId - NetEventClassFirst
    // GhostingMessageEvent payload: U32 sequence + 3-bit message + 11-bit count
    bs.readU32();
    bs.readInt(3);
    bs.readInt(11);
  }
  return seqs;
}

describe("buildClientGamePacket guaranteed events", () => {
  it("stamps each event with its own sequence number", () => {
    const protocol = new ConnectionProtocol();
    const ev = () => buildGhostingMessageEvent(1, 1, 0);
    // Post-loss shape: retransmitted events 5,6 re-queued at the head
    // share a packet with newer event 9 — seqs are NOT contiguous, and
    // deriving them by incrementing from the first would mislabel 9 as 7.
    const packet = buildClientGamePacket(protocol, {
      events: [
        { seq: 5, event: ev() },
        { seq: 6, event: ev() },
        { seq: 9, event: ev() },
      ],
    });
    expect(readGuaranteedEventSeqs(packet)).toEqual([5, 6, 9]);
  });

  it("wraps sequence numbers to 7 bits on the wire", () => {
    const protocol = new ConnectionProtocol();
    const packet = buildClientGamePacket(protocol, {
      events: [{ seq: 130, event: buildGhostingMessageEvent(1, 1, 0) }],
    });
    expect(readGuaranteedEventSeqs(packet)).toEqual([130 & 0x7f]);
  });
});

describe("ConnectionProtocol packet types", () => {
  /** Read the sequence number and packet type from a dnet header. */
  function readHeader(packet: Uint8Array): { seq: number; type: number } {
    const bs = new BitStream(packet);
    bs.readFlag(); // gameFlag
    bs.readInt(1); // connectSeqBit
    const seq = bs.readInt(9);
    bs.readInt(9); // highestAck
    const type = bs.readInt(2);
    return { seq, type };
  }

  it("gives only data packets a new sequence number", () => {
    const protocol = new ConnectionProtocol();
    const data1 = readHeader(protocol.buildDataPacket(() => {}));
    const ping = readHeader(protocol.buildPingPacket());
    const ack = readHeader(protocol.buildAckPacket());
    const data2 = readHeader(protocol.buildDataPacket(() => {}));

    expect(data1).toEqual({ seq: 1, type: 0 });
    // Pings and acks reuse the current sequence (FUN_0043d2d0 only
    // increments for data), so the peer never sees them as lost packets.
    expect(ping).toEqual({ seq: 1, type: 1 });
    expect(ack).toEqual({ seq: 1, type: 2 });
    expect(data2).toEqual({ seq: 2, type: 0 });
    expect(protocol.lastSendSeq).toBe(2);
  });
});

describe("PingTimeout", () => {
  it("pings after the silence threshold and times out after the retries", () => {
    const t = new PingTimeout(0);
    expect(t.check(PING_TIMEOUT_MS)).toBeNull();
    expect(t.check(PING_TIMEOUT_MS + 1)).toBe("ping");
    // Not again until another full interval has passed.
    expect(t.check(PING_TIMEOUT_MS + 2)).toBeNull();
    let now = PING_TIMEOUT_MS + 1;
    for (let i = 1; i < PING_RETRY_COUNT; i++) {
      now += PING_TIMEOUT_MS + 1;
      expect(t.check(now)).toBe("ping");
    }
    now += PING_TIMEOUT_MS + 1;
    expect(t.check(now)).toBe("timeout");
  });

  it("restarts the clock on any received packet", () => {
    const t = new PingTimeout(0);
    expect(t.check(PING_TIMEOUT_MS + 1)).toBe("ping");
    t.keepAlive(PING_TIMEOUT_MS + 100);
    expect(t.check(2 * PING_TIMEOUT_MS + 50)).toBeNull();
    expect(t.check(2 * PING_TIMEOUT_MS + 101)).toBe("ping");
  });
});
