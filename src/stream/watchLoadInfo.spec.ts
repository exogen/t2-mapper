import { describe, expect, it } from "vitest";
import {
  command,
  netString,
  watchRelaySource,
} from "../../relay/serverPacketFixtures";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";

const viewer = () =>
  new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
const begin = ["MsgLoadInfo", "", "Katabatic", "Katabatic", "CTF"];
const done = ["MsgLoadInfoDone", ""];

function relay() {
  const source = watchRelaySource();
  source.send((seq) => netString(seq, 1, "ServerMessage"));
  return {
    ...source,
    message: (...messages: string[][]) =>
      source.send(
        ...messages.map((args) => (seq: number) => command(seq, 1, ...args)),
      ),
  };
}

describe("watch loading information", () => {
  it.each([false, true])(
    "resumes a partial burst without publishing it early (previous complete: %s)",
    (hasPrevious) => {
      const source = relay();
      if (hasPrevious)
        source.message(begin, ["MsgLoadQuoteLine", "", "Previous quote"], done);
      const early = viewer();
      early.hydrate(source.payload());
      const previous = early.getSnapshot().loadInfo;

      early.feedPacket(
        source.message(
          begin,
          ["MsgLoadQuoteLine", "", "First quote"],
          ["MsgLoadObjectiveLine", "", "First objective"],
          ["MsgLoadRulesLine", "", "First rule"],
        ),
      );
      const payload = source.payload();
      expect(payload.hudState.pendingLoadInfo).toEqual({
        quoteLines: ["First quote"],
        objectiveLines: ["First objective"],
        rulesLines: ["First rule"],
      });
      const late = viewer();
      late.hydrate(payload);
      expect(early.getSnapshot().loadInfo).toEqual(previous);
      expect(late.getSnapshot().loadInfo).toEqual(previous);

      const more = source.message(
        ["MsgLoadQuoteLine", "", "Second quote"],
        ["MsgLoadObjectiveLine", "", "Second objective"],
        ["MsgLoadRulesLine", "", "Second rule"],
      );
      early.feedPacket(more);
      late.feedPacket(more);
      expect(late.getSnapshot().loadInfo).toEqual(previous);
      expect(payload.hudState.pendingLoadInfo?.quoteLines).toEqual([
        "First quote",
      ]);

      const end = source.message(done);
      early.feedPacket(end);
      late.feedPacket(end);
      expect(late.getSnapshot().loadInfo).toEqual({
        quoteLines: ["First quote", "Second quote"],
        objectiveLines: ["First objective", "Second objective"],
        rulesLines: ["First rule", "Second rule"],
      });
      expect(late.getSnapshot().loadInfo).toEqual(early.getSnapshot().loadInfo);
      expect(source.payload().hudState.pendingLoadInfo).toBeUndefined();
    },
  );

  it("restores an empty pending burst so Done clears the previous text", () => {
    const source = relay();
    source.message(begin, ["MsgLoadQuoteLine", "", "Previous quote"], done);
    source.message(begin);
    const late = viewer();
    late.hydrate(source.payload());
    expect(late.getSnapshot().loadInfo?.quoteLines).toEqual(["Previous quote"]);
    late.feedPacket(source.message(done));
    expect(late.getSnapshot().loadInfo).toBeNull();
  });

  it("clears a pending burst when rehydrating a payload without one", () => {
    const source = relay();
    source.message(begin, ["MsgLoadQuoteLine", "", "Previous quote"], done);
    source.message(begin, ["MsgLoadQuoteLine", "", "Partial quote"]);
    const late = viewer();
    late.hydrate(source.payload());
    const payload = source.payload();
    delete payload.hudState.pendingLoadInfo;
    late.hydrate(payload);
    late.feedPacket(source.message(done));
    expect(late.getSnapshot().loadInfo?.quoteLines).toEqual(["Previous quote"]);

    late.feedPacket(
      source.message(begin, ["MsgLoadQuoteLine", "", "New quote"], done),
    );
    expect(late.getSnapshot().loadInfo?.quoteLines).toEqual(["New quote"]);
  });
});
