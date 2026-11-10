import type { IncomingMessage, ServerResponse } from "node:http";

/** Private, uncacheable JSON for account-scoped endpoints. */
export function json(
  res: ServerResponse,
  status: number,
  value: unknown,
): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

/** Close the connection after rejecting a request instead of reading its body. */
export function closeRejectedRequest(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (req.complete) return;
  res.setHeader("Connection", "close");
  res.once("finish", () => req.destroy());
}

/**
 * Credentialed CORS for the app's trusted origins. Returns true when it has
 * answered the request (a rejected origin or a preflight).
 */
export function handleAccountCors(
  req: IncomingMessage,
  res: ServerResponse,
  trustedOrigins: readonly string[],
  methods: string,
): boolean {
  res.setHeader("Vary", "Origin");
  const origin = req.headers.origin;
  if (origin) {
    if (!trustedOrigins.includes(origin)) {
      closeRejectedRequest(req, res);
      json(res, 403, { error: "Origin is not allowed" });
      return true;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method !== "OPTIONS") return false;
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.writeHead(204);
  res.end();
  return true;
}
