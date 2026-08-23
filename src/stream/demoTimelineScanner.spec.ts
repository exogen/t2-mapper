import { describe, it, expect } from "vitest";
import { isRealMatchStart } from "./demoTimelineScanner";

describe("isRealMatchStart", () => {
  // The real kickoff bodies (DefaultGame::startMatch, SiegeGame, and the
  // admin-force path) — these belong on the timeline.
  it("accepts the real match-start bodies", () => {
    expect(isRealMatchStart("\x02Match started!")).toBe(true); // \c2 → control byte
    expect(isRealMatchStart("Match started")).toBe(true); // Siege
    expect(
      isRealMatchStart("\x02The admin has forced the match to start."),
    ).toBe(true);
  });

  // The countdown ticks (notifyMatchStart) reuse MsgMissionStart but must
  // NOT be treated as the start — they are "starts", not "started".
  it("rejects the pre-match countdown ticks", () => {
    expect(
      isRealMatchStart("\x02Match starts in %1 seconds.~wfx/misc/hunters_%1.wav"),
    ).toBe(false);
    expect(
      isRealMatchStart(
        "\x02Match starts in 2 seconds.~wvoice/announcer/ann.match_begins.wav",
      ),
    ).toBe(false);
    expect(isRealMatchStart("\x02Match starts in 1 second.")).toBe(false);
  });

  it("rejects empty/unrelated bodies", () => {
    expect(isRealMatchStart("")).toBe(false);
    expect(isRealMatchStart("\x02You are in mission Katabatic (CTF).")).toBe(
      false,
    );
  });
});
