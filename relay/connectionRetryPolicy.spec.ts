import { describe, expect, it } from "vitest";
import {
  connectionErrorReason,
  getConnectionRetryPolicy,
} from "./connectionRetryPolicy";
import {
  getReconnectDelayMs,
  isRetryableDisconnect,
  shouldRetryDisconnect,
  MAX_RETRIES,
  retryStatusMessage,
} from "./shared";

// Tribes2.exe 25034, string at 0x00798c2c (including the double space).
const missionCyclingReason =
  "Server is cycling missions.  Please try to connect in a moment.";

describe("connection retry policies", () => {
  it.each([
    missionCyclingReason,
    missionCyclingReason.toUpperCase(),
    retryStatusMessage(missionCyclingReason, 1),
  ])("retries mission-cycle rejection %s after 5s", (reason) => {
    expect(getReconnectDelayMs(reason)).toBe(5_000);
    expect(shouldRetryDisconnect(reason, 0)).toBe(true);
    expect(shouldRetryDisconnect(reason, MAX_RETRIES)).toBe(false);
  });

  it.each([
    "Connection timed out",
    "  CONNECTION TIMED OUT  ",
    "Connect failed: getaddrinfo ENOTFOUND server.example",
    "ECONNREFUSED: connect failed",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EAI_AGAIN",
  ])("allows manual retry of %s after 10s", (reason) => {
    expect(getReconnectDelayMs(reason)).toBe(10_000);
    expect(isRetryableDisconnect(reason)).toBe(false);
  });

  it.each(["Connection stalled", retryStatusMessage("Connection stalled", 1)])(
    "retains the 30s cooldown and retry limit for %s",
    (reason) => {
      expect(getReconnectDelayMs(reason)).toBe(30_000);
      expect(shouldRetryDisconnect(reason, MAX_RETRIES - 1)).toBe(true);
      expect(shouldRetryDisconnect(reason, MAX_RETRIES)).toBe(false);
    },
  );

  it.each([
    undefined,
    "",
    // Server-sent codes verified in Tribes2.exe 25034's challenge/connect handlers.
    "PASSWORD",
    "CHR_PROTOCOL",
    "CHR_INVALID_CHALLENGE_PACKET",
    "CR_INVALID_PROTOCOL_VERSION",
    "CR_INVALID_CONNECT_PACKET",
    "CR_AUTHENTICATION_FAILED",
    "CR_YOUAREBANNED",
    "CR_SERVERFULL",
    // Active disconnect reasons in TacoServer Stable, commit 854a5e2.
    "You are banned from this server.",
    "You are not allowed to play on this server.",
    "Server is locked, please message admin or wait for approval",
    "You joined the server with a blank name and/or GUID. Try rejoining.",
    "You have been kicked from the server.",
    "You have been kicked out of the game.",
    "Observer Timeout",
    "Clearing server for Tournament.",
    // Relay authentication failure.
    "Authentication failed",
    // Unknown, incomplete, and altered messages must keep the default policy.
    "Server is cycling mission",
    "Server is cycling missions.",
    `${missionCyclingReason} Extra text`,
    "Mission is cycling, try again in a moment",
    "Can't establish connection to a given IP address",
    "Cannot establish a connection to 192.0.2.1",
    "Connection stalled while loading",
    "Previous connection stalled",
    "Connection timed out while loading",
    "Unknown failure",
    "NOT_EHOSTUNREACH",
  ])("falls back to 30s without automatic retry for %s", (reason) => {
    expect(getConnectionRetryPolicy(reason)).toEqual({
      cooldownMs: 30_000,
      autoRetry: false,
    });
  });

  it("preserves an error code when the human-readable message omits it", () => {
    const error = Object.assign(new Error("Destination unavailable"), {
      code: "EHOSTUNREACH",
    });
    expect(getReconnectDelayMs(connectionErrorReason(error))).toBe(10_000);
    expect(connectionErrorReason(error)).toBe(
      "EHOSTUNREACH: Destination unavailable",
    );
    error.message = "connect EHOSTUNREACH 192.0.2.1";
    expect(connectionErrorReason(error)).toBe(error.message);
    expect(connectionErrorReason(new Error("Unknown failure"))).toBe(
      "Unknown failure",
    );
    expect(connectionErrorReason("Unknown failure")).toBe("Unknown failure");
  });
});
