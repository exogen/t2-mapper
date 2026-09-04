import { describe, expect, it } from "vitest";
import {
  cueDurationSec,
  cuesAt,
  type CommentaryTrack,
} from "./commentaryTrack";

const track: CommentaryTrack = {
  audioStartSec: 0,
  cues: [
    { atSec: 10, speaker: "rip", text: "Irvin's got the flag off the stand!" },
    { atSec: 11.5, speaker: "doc", text: "And nobody home to stop him." },
    { atSec: 40, speaker: "rip", text: "He scores." },
  ],
};

describe("commentary subtitles", () => {
  it("keeps a line up for about as long as it takes to say", () => {
    // Seven words at ~2.6 words a second, plus a moment to read.
    const d = cueDurationSec(track.cues[0]);
    expect(d).toBeGreaterThan(2.5);
    expect(d).toBeLessThan(4);
    // Two words still get a readable minimum.
    expect(cueDurationSec(track.cues[2])).toBe(1.5);
  });

  it("shows the lines on air at a moment, oldest first", () => {
    expect(cuesAt(track, 9.9)).toEqual([]);
    expect(cuesAt(track, 10.2).map((c) => c.speaker)).toEqual(["rip"]);
    // Doc has come in on the back of Rip's call: both are up.
    expect(cuesAt(track, 12).map((c) => c.speaker)).toEqual(["rip", "doc"]);
    expect(cuesAt(track, 20)).toEqual([]);
    expect(cuesAt(track, 41).map((c) => c.text)).toEqual(["He scores."]);
  });
});
