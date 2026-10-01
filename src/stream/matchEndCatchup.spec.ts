import { afterEach, expect, it, vi } from "vitest";
import { WatchStateAccumulator } from "../../relay/watchState";
import { LiveStreamAdapter } from "./liveStreaming";
import { buildCatchupPayload } from "../../relay/watchCatchup";
import { createLiveParser, GhostStateAccumulator } from "t2-demo-parser";
import type { RelayClient } from "./relayClient";

const command = (funcName: string, ...args: string[]) =>
  ({
    gameState: {},
    events: [{ parsedData: { type: "RemoteCommandEvent", funcName, args } }],
  }) as never;
const message = (...args: string[]) => command("ServerMessage", ...args);
afterEach(() => vi.useRealTimers());

it("holds the relay catch-up clock at MissionEnd and resumes on the next mission", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const state = new WatchStateAccumulator();
  state.applyPacket(message("MsgSystemClock", "", "20", "1200000"));
  vi.advanceTimersByTime(5000);
  state.applyPacket(command("MissionEnd", "1"));
  vi.advanceTimersByTime(60000);
  state.applyPacket(message("MsgDebriefResult", ""));
  expect(state.getHudState().clock).toEqual({
    durationMs: 1200000,
    elapsedMs: 5000,
  });

  // The normal relay payload also seeds an already-ended browser session.
  const { packetParser } = createLiveParser();
  const payload = buildCatchupPayload({
    packetParser,
    ghostState: new GhostStateAccumulator(),
    watchState: state,
    epoch: 1,
    serverAddress: "localhost:28000",
  });
  const viewer = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
  viewer.hydrate(payload);
  expect(viewer.stepToTime(30).matchClockMs).toBe(-1195000);
  expect(viewer.getSnapshot().matchEndedAtSec).toBe(0);

  state.applyPacket(message("MsgClientReady", "", "CTFGame"));
  state.applyPacket(message("MsgSystemClock", "", "0", "0"));
  vi.advanceTimersByTime(2000);
  expect(state.getHudState().matchEnded).toBe(false);
  expect(state.getHudState().clock).toEqual({
    durationMs: 0,
    elapsedMs: 2000,
  });
});

it("keeps a running relay clock and hydrated world active after welcome debrief messages", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const state = new WatchStateAccumulator();
  state.applyPacket(message("MsgClientReady", "", "CTFGame"));
  state.applyPacket(
    message("MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0"),
  );
  state.applyPacket(message("MsgTeamScoreIs", "", "1", "3"));
  state.applyPacket(message("MsgSystemClock", "", "30", "1180000"));
  vi.advanceTimersByTime(2000);
  state.applyPacket(message("MsgGameOver"));
  state.applyPacket(message("MsgClearDebrief"));
  state.applyPacket(
    message("MsgDebriefResult", "", "<font:Sui Generis:22>CLASSIC"),
  );
  vi.advanceTimersByTime(60000);
  expect(state.getHudState()).toMatchObject({
    matchStarted: true,
    matchEnded: false,
    clock: { durationMs: 1180000, elapsedMs: 62000 },
  });

  const { packetParser } = createLiveParser();
  const payload = buildCatchupPayload({
    packetParser,
    ghostState: new GhostStateAccumulator(),
    watchState: state,
    epoch: 1,
    serverAddress: "localhost:28000",
  });
  const viewer = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
  viewer.hydrate(payload);
  const snapshot = viewer.stepToTime(30);
  expect(snapshot.matchEnded).toBe(false);
  expect(snapshot.matchEndedAtSec).toBeNull();
  expect(snapshot.matchClockMs).toBeCloseTo(-1118000 + snapshot.timeSec * 1000);
});
