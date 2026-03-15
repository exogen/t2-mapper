import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
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
