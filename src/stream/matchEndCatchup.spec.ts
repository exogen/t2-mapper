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

it.each(["MissionEnd", "MsgClearDebrief", "MsgDebriefResult"])(
  "holds the relay catch-up clock at %s and resumes on the next mission",
  (signal) => {
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const state = new WatchStateAccumulator();
    state.applyPacket(message("MsgSystemClock", "", "20", "1200000"));
    vi.advanceTimersByTime(5000);
    state.applyPacket(
      signal === "MissionEnd" ? command(signal, "1") : message(signal, ""),
    );
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
  },
);
