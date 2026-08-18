import { describe, expect, it } from "vitest";
import { BitStream } from "t2-demo-parser";
import {
  ConnectionProtocol,
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
