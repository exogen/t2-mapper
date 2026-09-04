import { describe, expect, it } from "vitest";
import { DIRECTOR_INTRO_LEAD_SEC, directorStartSec } from "./directorStart";

describe("directorStartSec", () => {
  it("starts a beat before the commentary's first line when a track is loaded", () => {
    // A new cast: the hosts come on at 41s, the plan's own skip mark
    // sits deep in the pre-match at 498s. The intro wins.
    expect(directorStartSec({ nowSec: 0, introSec: 41, skipToSec: 498 })).toBe(
      41 - DIRECTOR_INTRO_LEAD_SEC,
    );
    // A legacy cast: commentary rendered against a plan that skips the
    // dead air, opening just before the roster block.
    expect(directorStartSec({ nowSec: 0, introSec: 676, skipToSec: 904 })).toBe(
      676 - DIRECTOR_INTRO_LEAD_SEC,
    );
  });

  it("falls back to the plan's skip mark without a track, on any cast", () => {
    expect(
      directorStartSec({ nowSec: 0, introSec: null, skipToSec: 904 }),
    ).toBe(904);
    expect(
      directorStartSec({ nowSec: 0, introSec: null, skipToSec: 498 }),
    ).toBe(498);
  });

  it("stays put with nothing to skip to", () => {
    expect(
      directorStartSec({ nowSec: 0, introSec: null, skipToSec: null }),
    ).toBe(null);
  });

  it("only ever skips forward", () => {
    // Already seeked into the match: never dragged back.
    expect(
      directorStartSec({ nowSec: 1200, introSec: 676, skipToSec: 904 }),
    ).toBe(null);
    expect(
      directorStartSec({ nowSec: 700, introSec: null, skipToSec: 498 }),
    ).toBe(null);
  });

  it("never seeks before the start of the recording", () => {
    expect(directorStartSec({ nowSec: 0, introSec: 3, skipToSec: null })).toBe(
      null,
    );
  });
});
