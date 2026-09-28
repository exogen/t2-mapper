import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import type { Logger } from "pino";
import type { RawData } from "ws";
import { relayLog } from "./logger.js";

const MAX_LOG_PAYLOAD_BYTES = 16 * 1024;

function normalizeIp(value: string | undefined): string | undefined {
  if (!value || !isIP(value)) return undefined;
  if (value.toLowerCase().startsWith("::ffff:") && isIP(value.slice(7)) === 4) {
    return value.slice(7);
  }
  return value;
}

/** Only a configured Fly ingress may supply the client IP via a header. */
export function browserIdentity(req: IncomingMessage, trustFlyProxy: boolean) {
  const peerIp = normalizeIp(req.socket.remoteAddress) ?? "unknown";
  const header = req.headers["fly-client-ip"];
  const flyIp =
    trustFlyProxy && typeof header === "string"
      ? normalizeIp(header.trim())
      : undefined;
  return Object.freeze({
    connectionId: randomUUID(),
    clientIp: flyIp ?? peerIp,
    peerIp,
    ipSource: flyIp ? "fly-client-ip" : "socket",
    peerPort: req.socket.remotePort,
  });
}

export interface BrowserContext {
  role: "idle" | "player" | "watcher";
  serverAddress: string | null;
}

/** One unsampled audit entry per input, before validation or policy filtering. */
export class BrowserAudit {
  readonly identity: ReturnType<typeof browserIdentity>;
  readonly log: Logger;
  private inputSeq = 0;

  constructor(req: IncomingMessage, trustFlyProxy: boolean, logger = relayLog) {
    this.identity = browserIdentity(req, trustFlyProxy);
    // Accountability must not disappear when ordinary diagnostics are set to
    // warn/error/silent. Keep the audit stream at info independently.
    this.log = logger.child(this.identity, { level: "info" });
  }

  receive(data: RawData, isBinary: boolean, context: BrowserContext) {
    const buffer = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
    if (isBinary) {
      const inputSeq = this.record(buffer, "binary", context, {
        payloadEncoding: "base64",
        payload: buffer.subarray(0, MAX_LOG_PAYLOAD_BYTES).toString("base64"),
      });
      return { inputSeq, message: undefined, validJson: false };
    }

    const text = buffer.toString("utf8");
    let message: unknown;
    let validJson = true;
    try {
      message = JSON.parse(text);
    } catch {
      validJson = false;
    }
    const inputType =
      message !== null &&
      typeof message === "object" &&
      "type" in message &&
      typeof message.type === "string"
        ? message.type.slice(0, 128)
        : undefined;
    const inputSeq = this.record(buffer, "text", context, {
      validJson,
      inputType,
      ...(buffer.length > MAX_LOG_PAYLOAD_BYTES
        ? {
            payloadPreview: buffer
              .subarray(0, MAX_LOG_PAYLOAD_BYTES)
              .toString("utf8"),
          }
        : validJson
          ? { input: message }
          : { payload: text }),
    });
    return { inputSeq, message, validJson };
  }

  control(kind: "ping" | "pong", data: Buffer, context: BrowserContext) {
    this.record(data, kind, context, {
      payloadEncoding: "base64",
      payload: data.toString("base64"),
    });
  }

  private record(
    buffer: Buffer,
    frameType: string,
    context: BrowserContext,
    detail: object,
  ): number {
    const inputSeq = ++this.inputSeq;
    this.log.info(
      {
        event: "browser_input",
        inputSeq,
        frameType,
        bytes: buffer.length,
        ...context,
        ...detail,
        ...(buffer.length > MAX_LOG_PAYLOAD_BYTES
          ? {
              payloadTruncated: true,
              payloadSha256: createHash("sha256").update(buffer).digest("hex"),
            }
          : {}),
      },
      "Browser input",
    );
    return inputSeq;
  }
}
