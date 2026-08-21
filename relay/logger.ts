import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  // Level is controlled solely by LOG_LEVEL; NODE_ENV only picks the
  // output format (pretty for dev, JSON for deploys).
  level: process.env.LOG_LEVEL || "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, singleLine: true },
    },
  }),
});

/** Relay server (WebSocket + dispatch). */
export const relayLog = logger.child({ module: "relay" });

/** UDP game connection handshake and protocol. */
export const connLog = logger.child({ module: "conn" });

/** Master server / server list queries. */
export const masterLog = logger.child({ module: "master" });

/** T2csri authentication. */
export const authLog = logger.child({ module: "auth" });

/** Game-file CRC computation (CRCChallengeEvent responses). */
export const crcLog = logger.child({ module: "crc" });

/** Demo (.rec) recording and upload. */
export const demoLog = logger.child({ module: "demo" });
