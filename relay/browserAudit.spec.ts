import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { BrowserAudit, browserIdentity } from "./browserAudit";

function request(headers: IncomingMessage["headers"] = {}): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: "::ffff:192.0.2.10", remotePort: 50000 },
  } as IncomingMessage;
}

const context = { role: "watcher", serverAddress: "192.0.2.1:28000" } as const;

function captureAudit() {
  const entries: Record<string, any>[] = [];
  const logger = pino(
    { level: "silent" },
    {
      write(line) {
        entries.push(JSON.parse(line));
      },
    },
  );
  return { entries, audit: new BrowserAudit(request(), false, logger) };
}

describe("browser identity", () => {
  it("ignores forwarded headers on direct connections and creates unique IDs", () => {
    const req = request({
      "fly-client-ip": "198.51.100.23",
      "x-forwarded-for": "203.0.113.99",
    });
    const first = browserIdentity(req, false);
    expect(first).toMatchObject({
      clientIp: "192.0.2.10",
      peerIp: "192.0.2.10",
      peerPort: 50000,
      ipSource: "socket",
    });
    expect(first.connectionId).not.toBe(
      browserIdentity(req, false).connectionId,
    );
  });

  it.each(["198.51.100.23", "2001:db8::23"])(
    "uses the trusted Fly header (%s) while keeping the direct peer IP",
    (ip) => {
      expect(
        browserIdentity(request({ "fly-client-ip": ip }), true),
      ).toMatchObject({
        clientIp: ip,
        peerIp: "192.0.2.10",
        ipSource: "fly-client-ip",
      });
    },
  );

  it.each([
    undefined,
    "invalid",
    "198.51.100.23, 203.0.113.99",
    ["198.51.100.23"],
  ])(
    "falls back to the socket when Fly's header is absent or invalid (%j)",
    (header) => {
      expect(
        browserIdentity(
          request({
            "fly-client-ip": header,
            "x-forwarded-for": "203.0.113.99",
          }),
          true,
        ),
      ).toMatchObject({ clientIp: "192.0.2.10", ipSource: "socket" });
    },
  );
});

describe("browser input audit", () => {
  it("logs each input at info even with diagnostics silenced, without accepting forged identity", () => {
    const { entries, audit } = captureAudit();
    const input = {
      type: "sendCommand",
      command: "messageSent",
      args: ["hello\nworld"],
      clientIp: "forged",
      connectionId: "forged",
      inputSeq: 999,
      event: "forged",
    };
    const received = audit.receive(
      Buffer.from(JSON.stringify(input)),
      false,
      context,
    );
    expect(received.message).toEqual(input);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      ...audit.identity,
      ...context,
      level: 30,
      event: "browser_input",
      inputSeq: 1,
      frameType: "text",
      validJson: true,
      inputType: "sendCommand",
      input,
    });
    expect(entries[0].connectionId).not.toBe("forged");
  });

  it("records malformed, binary, and control messages with consecutive sequence numbers", () => {
    const { entries, audit } = captureAudit();
    expect(
      audit.receive(Buffer.from("{bad json"), false, context).validJson,
    ).toBe(false);
    audit.receive([Buffer.from([0]), Buffer.from([255])], true, context);
    audit.receive(new Uint8Array([1, 2]).buffer, true, context);
    audit.control("ping", Buffer.from("ping"), context);
    audit.control("pong", Buffer.alloc(0), context);
    expect(entries.map((e) => e.inputSeq)).toEqual([1, 2, 3, 4, 5]);
    expect(entries.map((e) => e.frameType)).toEqual([
      "text",
      "binary",
      "binary",
      "ping",
      "pong",
    ]);
    expect(entries[0]).toMatchObject({
      validJson: false,
      payload: "{bad json",
    });
    expect(entries[1]).toMatchObject({
      bytes: 2,
      payload: "AP8=",
      payloadEncoding: "base64",
    });
    for (const entry of entries) expect(entry).toMatchObject(audit.identity);
  });

  it.each([null, [], 42, "message"])(
    "audits valid JSON outside the expected schema (%j)",
    (input) => {
      const { entries, audit } = captureAudit();
      const result = audit.receive(
        Buffer.from(JSON.stringify(input)),
        false,
        context,
      );
      expect(result).toMatchObject({ validJson: true, message: input });
      expect(entries[0]).toMatchObject({ ...audit.identity, input });
    },
  );

  it.each([false, true])(
    "bounds large payloads without skipping attribution (binary=%s)",
    (binary) => {
      const { entries, audit } = captureAudit();
      const input = { type: "sendCommand", args: ["x".repeat(20 * 1024)] };
      const buffer = Buffer.from(JSON.stringify(input));
      const result = audit.receive(buffer, binary, context);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        ...audit.identity,
        inputSeq: 1,
        bytes: buffer.length,
        payloadTruncated: true,
        payloadSha256: createHash("sha256").update(buffer).digest("hex"),
      });
      expect(entries[0]).not.toHaveProperty("input");
      if (binary) {
        expect(Buffer.from(entries[0].payload, "base64")).toHaveLength(
          16 * 1024,
        );
      } else {
        expect(entries[0].payloadPreview).toHaveLength(16 * 1024);
        expect(result.message).toEqual(input);
      }
    },
  );
});
