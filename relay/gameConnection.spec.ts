import { describe, expect, it, vi } from "vitest";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { createLiveParser } from "t2-demo-parser";
import { GameConnection } from "./gameConnection";
import { BitStreamWriter } from "./BitStreamWriter";
import type { ConnectionProtocol } from "./protocol";
import { GAME_PROTOCOL_VERSION } from "./shared";

describe("GameConnection protocol negotiation", () => {
  function handshake() {
    const conn = new GameConnection("1.2.3.4:28000");
    const inner = conn as unknown as {
      _status: string;
      clientConnectSequence: number;
      serverConnectSequence: number;
      handleChallengeResponse(msg: Buffer): void;
      handleConnectAccept(msg: Buffer): void;
      sendRaw(data: Uint8Array): void;
      startKeepalive(): void;
      startOobPing(): void;
      enforceObserver(): void;
    };
    inner._status = "challenging";
    inner.clientConnectSequence = 123;
    const send = vi.spyOn(inner, "sendRaw").mockImplementation(() => {});
    const keepalive = vi
      .spyOn(inner, "startKeepalive")
      .mockImplementation(() => {});
    vi.spyOn(inner, "startOobPing").mockImplementation(() => {});
    vi.spyOn(inner, "enforceObserver").mockImplementation(() => {});
    return { conn, inner, send, keepalive };
  }

  function challenge(protocol = 51, client = 123, server = 456) {
    const msg = Buffer.alloc(14);
    msg[0] = 30;
    msg.writeUInt32LE(protocol, 1);
    msg.writeUInt32LE(server, 5);
    msg.writeUInt32LE(client, 9);
    return msg;
  }

  function accept(protocol = 51, client = 123, server = 456) {
    const msg = Buffer.alloc(17);
    msg[0] = 36;
    msg.writeUInt32LE(server, 1);
    msg.writeUInt32LE(client, 5);
    msg.writeUInt32LE(protocol, 9);
    msg.writeUInt32LE(1000, 13);
    return msg;
  }

  it.each([51, 52])(
    "negotiates retail layout with a protocol %i server",
    (version) => {
      const { conn, inner, send, keepalive } = handshake();
      inner.handleChallengeResponse(challenge(version));
      expect(Buffer.from(send.mock.calls[0][0]).readUInt32LE(9)).toBe(
        GAME_PROTOCOL_VERSION,
      );
      inner.handleConnectAccept(accept());
      expect(conn.status).toBe("connected");
      expect(conn.connectSequence).toBe(123 ^ 456);
      expect(keepalive).toHaveBeenCalledTimes(1);
      inner.handleConnectAccept(accept());
      expect(keepalive).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["truncated", accept().subarray(0, 16)],
    ["stale client", accept(51, 122)],
    ["stale server", accept(51, 123, 455)],
    ["older protocol", accept(50)],
    ["unrequested QoL protocol", accept(52)],
  ])(
    "ignores %s accepts and can still connect afterwards",
    (_label, packet) => {
      const { conn, inner, keepalive } = handshake();
      inner.handleChallengeResponse(challenge(52));
      inner.handleConnectAccept(packet as Buffer);
      expect(conn.status).toBe("challenging");
      expect(keepalive).not.toHaveBeenCalled();
      inner.handleConnectAccept(accept());
      expect(conn.status).toBe("connected");
      expect(keepalive).toHaveBeenCalledTimes(1);
    },
  );

  it("ignores accepts before a valid challenge and stale challenges without mutating state", () => {
    const { conn, inner, send, keepalive } = handshake();
    inner.handleConnectAccept(accept(51, 123, 0));
    expect(keepalive).not.toHaveBeenCalled();
    inner.handleChallengeResponse(challenge().subarray(0, 13));
    inner.handleChallengeResponse(challenge(51, 999));
    expect(send).not.toHaveBeenCalled();
    expect(inner.serverConnectSequence).toBe(0);
    inner.handleChallengeResponse(challenge());
    inner.handleChallengeResponse(challenge(52, 999, 999));
    expect(inner.serverConnectSequence).toBe(456);
    inner.handleConnectAccept(accept());
    expect(conn.status).toBe("connected");
  });

  it("reports unsupported old servers without sending a connect request", () => {
    const { conn, inner, send } = handshake();
    const status = vi.fn();
    conn.on("status", status);
    inner.handleChallengeResponse(challenge(48));
    expect(status).toHaveBeenCalledWith(
      "disconnected",
      expect.stringContaining("Unsupported server protocol 48"),
    );
    expect(send).not.toHaveBeenCalled();
    expect(conn.status).toBe("disconnected");
  });
});

/** A connection past ConnectAccept, waiting on T2csri; no socket behind it. */
function authenticating(): GameConnection {
  const conn = new GameConnection("1.2.3.4:28000");
  (conn as any)._status = "authenticating";
  vi.spyOn(conn, "sendCommand").mockImplementation(() => {});
  return conn;
}

interface ReceiveInternals {
  handleMessage(msg: Buffer): void;
  handleOOBPacket(msg: Buffer): void;
  sendRaw(data: Uint8Array): void;
  protocol: ConnectionProtocol;
}

/** Ping header with overrides for rejection tests and padding for size limits. */
function pingDatagram(
  seq: number,
  size: number,
  { connectSeqBit = 0, highestAck = 0, ackByteCount = 0 } = {},
): Buffer {
  const bs = new BitStreamWriter(16);
  bs.writeFlag(true);
  bs.writeInt(connectSeqBit, 1);
  bs.writeInt(seq, 9);
  bs.writeInt(highestAck, 9);
  bs.writeInt(1, 2);
  bs.writeInt(ackByteCount, 3);
  const datagram = Buffer.alloc(size);
  datagram.set(bs.getBuffer());
  return datagram;
}

describe("GameConnection ping validation", () => {
  it.each([
    ["wrong connection", 1, { connectSeqBit: 1 }],
    ["outside the receive window", 32, {}],
    ["acknowledges an unsent packet", 1, { highestAck: 1 }],
    ["five acknowledgement bytes", 1, { ackByteCount: 5 }],
    ["six acknowledgement bytes", 1, { ackByteCount: 6 }],
    ["seven acknowledgement bytes", 1, { ackByteCount: 7 }],
  ] as const)("ignores a rejected ping: %s", (_reason, seq, header) => {
    const conn = authenticating();
    const receiver = conn as unknown as ReceiveInternals;
    const { packetParser } = createLiveParser();
    const parse = vi.fn((data: Uint8Array) => packetParser.parsePacket(data));
    conn.on("packet", parse);
    const send = vi.spyOn(receiver, "sendRaw").mockImplementation(() => {});
    const notify = vi.fn();
    receiver.protocol.onNotify = notify;

    expect(() =>
      receiver.handleMessage(pingDatagram(seq, 11, header)),
    ).not.toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(receiver.protocol.lastSeqRecvd).toBe(0);
    expect(receiver.protocol.highestAckedSeq).toBe(0);
    expect(packetParser.protocolRejected).toBe(1);
    expect(parse.mock.results[0].value.parseFault).toBeUndefined();

    receiver.handleMessage(pingDatagram(1, 4));
    expect(send).toHaveBeenCalledTimes(1);
    expect(receiver.protocol.lastSeqRecvd).toBe(1);
  });

  it("answers duplicate accepted pings, including the largest valid ack mask", () => {
    const conn = authenticating();
    const receiver = conn as unknown as ReceiveInternals;
    const send = vi.spyOn(receiver, "sendRaw").mockImplementation(() => {});
    const ping = pingDatagram(1, 8, { ackByteCount: 4 });

    receiver.handleMessage(ping);
    receiver.handleMessage(ping);

    expect(send).toHaveBeenCalledTimes(2);
    expect(receiver.protocol.lastSeqRecvd).toBe(1);
    expect(receiver.protocol.lastSendSeq).toBe(0);
  });
});

describe("GameConnection UDP receive limit", () => {
  it.each([450, 1191, 1500])("accepts a %i-byte datagram intact", (size) => {
    const conn = authenticating();
    const receiver = conn as unknown as ReceiveInternals;
    const packet = vi.fn();
    conn.on("packet", packet);
    const send = vi.spyOn(receiver, "sendRaw").mockImplementation(() => {});
    const data = pingDatagram(1, size);

    receiver.handleMessage(data);

    expect(packet).toHaveBeenCalledExactlyOnceWith(new Uint8Array(data));
    expect(receiver.protocol.lastSeqRecvd).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([1501, 4095, 4096, 5000])(
    "discards a %i-byte datagram before delivery or acknowledgements, then continues",
    (size) => {
      const conn = authenticating();
      const receiver = conn as unknown as ReceiveInternals;
      const packet = vi.fn();
      conn.on("packet", packet);
      const send = vi.spyOn(receiver, "sendRaw").mockImplementation(() => {});

      receiver.handleMessage(pingDatagram(1, size));

      expect(packet).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(receiver.protocol.lastSeqRecvd).toBe(0);
      expect(conn.status).toBe("authenticating");

      const next = pingDatagram(1, 4);
      receiver.handleMessage(next);
      expect(packet).toHaveBeenCalledExactlyOnceWith(new Uint8Array(next));
      expect(receiver.protocol.lastSeqRecvd).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("applies the same boundary before out-of-band handshake dispatch", () => {
    const conn = authenticating();
    const receiver = conn as unknown as ReceiveInternals;
    const oob = vi
      .spyOn(receiver, "handleOOBPacket")
      .mockImplementation(() => {});

    receiver.handleMessage(Buffer.alloc(1501));
    expect(oob).not.toHaveBeenCalled();

    const validSize = Buffer.alloc(1500);
    receiver.handleMessage(validSize);
    expect(oob).toHaveBeenCalledExactlyOnceWith(validSize);
  });

  it("ignores oversized responses on the separate ping-probe socket", () => {
    const socket = Object.assign(new EventEmitter(), {
      connect: vi.fn(),
      close: vi.fn(),
    });
    const createSocket = vi
      .spyOn(dgram, "createSocket")
      .mockReturnValue(socket as unknown as dgram.Socket);
    const conn = authenticating();
    const probe = conn as unknown as {
      startOobPing(): void;
      stopOobPing(): void;
      oobPingOutstanding: boolean;
    };
    const ping = vi.fn();
    conn.on("ping", ping);
    try {
      probe.startOobPing();
      probe.oobPingOutstanding = true;
      socket.emit("message", Buffer.alloc(1501, 16));
      expect(probe.oobPingOutstanding).toBe(true);
      expect(ping).not.toHaveBeenCalled();

      socket.emit("message", Buffer.alloc(1500, 16));
      expect(probe.oobPingOutstanding).toBe(false);
      expect(ping).toHaveBeenCalledTimes(1);
    } finally {
      probe.stopOobPing();
      createSocket.mockRestore();
    }
  });
});

describe("GameConnection.missionStartedWithoutAuth", () => {
  it("promotes an unpoked connection to connected and enforces observer", () => {
    const conn = authenticating();
    const statuses: string[] = [];
    conn.on("status", (status) => statuses.push(status));

    conn.missionStartedWithoutAuth();

    expect(conn.status).toBe("connected");
    expect(statuses).toEqual(["connected"]);
    expect(conn.sendCommand).toHaveBeenCalledWith("setPlayerTeam", "0");
  });

  it("leaves a poked connection to finish the T2csri handshake", () => {
    const conn = authenticating();
    (conn as any).authPoked = true;

    conn.missionStartedWithoutAuth();

    expect(conn.status).toBe("authenticating");
    expect(conn.sendCommand).not.toHaveBeenCalled();
  });

  it("does nothing once already connected", () => {
    const conn = authenticating();
    conn.missionStartedWithoutAuth();
    vi.mocked(conn.sendCommand).mockClear();

    conn.missionStartedWithoutAuth();

    expect(conn.sendCommand).not.toHaveBeenCalled();
  });
});
