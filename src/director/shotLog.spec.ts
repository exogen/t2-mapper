import { describe, expect, it } from "vitest";
import { demoClock, describeShot } from "./shotLog";

describe("demoClock", () => {
  it("matches the seek bar's mm:ss form", () => {
    expect(demoClock(1121.64)).toBe("18:41.6");
    expect(demoClock(65)).toBe("1:05.0");
    expect(demoClock(0)).toBe("0:00.0");
  });
});

describe("describeShot", () => {
  it("renders a quotable one-liner for a fixed shot", () => {
    expect(
      describeShot(
        {
          kind: "fixedOrbit",
          center: [-459.4, -446.2, 128.1],
          radius: 12,
          angularSpeed: 0,
          lookSubject: { type: "flag", slot: 1 },
          startSec: 1121.6,
          endSec: 1133.5,
          transitionIn: "cut",
          reason: "Storm flag held inside the base",
        },
        141,
        256,
      ),
    ).toBe(
      "#142/256 18:41.6→18:53.5 fixedOrbit at [-459, -446, 128] r=12 " +
        'static panning on flag 1 — "Storm flag held inside the base"',
    );
  });

  it("describes a follow shot's aim", () => {
    expect(
      describeShot(
        {
          kind: "followFlag",
          slot: 2,
          distance: 15,
          aim: { mode: "toward", target: [800, 0, 100] },
          startSec: 60,
          endSec: 72,
          transitionIn: "cut",
          reason: "Inferno flag carried",
        },
        0,
        10,
      ),
    ).toBe(
      "#1/10 1:00.0→1:12.0 followFlag following flag 2 @15m, " +
        'aim toward [800, 0, 100] — "Inferno flag carried"',
    );
  });
});
