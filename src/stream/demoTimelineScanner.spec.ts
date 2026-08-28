import { describe, it, expect } from "vitest";
import { isRealMatchStart } from "./demoTimelineScanner";

describe("isRealMatchStart", () => {
  // The real kickoff bodies (DefaultGame::startMatch, SiegeGame) — only
  // these mean play has begun.
  it("accepts the real match-start bodies", () => {
    expect(isRealMatchStart("\x02Match started!")).toBe(true); // \c2 → control byte
    expect(isRealMatchStart("Match started")).toBe(true); // Siege
  });

  // An admin force only STARTS A COUNTDOWN (voteMatchStart calls
  // startTourneyCountdown), and that countdown can still be cancelled.
  // A tournament demo had forces at 821s and 1029s with the kickoff not
  // until 1059s, so treating a force as the start was four minutes off.
  it("rejects a forced start, which only begins a cancellable countdown", () => {
    expect(
      isRealMatchStart("\x02The admin has forced the match to start."),
    ).toBe(false);
    expect(
      isRealMatchStart("\x02The match has been started by vote: 75 percent."),
    ).toBe(false);
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
