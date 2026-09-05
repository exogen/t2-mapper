import { describe, expect, it, vi } from "vitest";
import { GameConnection } from "./gameConnection";

/** A connection past ConnectAccept, waiting on T2csri; no socket behind it. */
function authenticating(): GameConnection {
  const conn = new GameConnection("1.2.3.4:28000");
  (conn as any)._status = "authenticating";
  vi.spyOn(conn, "sendCommand").mockImplementation(() => {});
  return conn;
}

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
