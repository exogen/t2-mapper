import { describe, expect, it } from "vitest";
import { CAST_CONTRACT_VERSION } from "./castContract";
import {
  castSidecar,
  commentaryFromSidecar,
  planFromSidecar,
} from "./castSidecar";
import type { ShotPlan } from "./types";

const plan = (): ShotPlan => ({
  contractVersion: CAST_CONTRACT_VERSION,
  gameMode: "ctf",
  shots: [
    {
      kind: "fixedOrbit",
      center: [0, 0, 0],
      radius: 10,
      startSec: 0,
      endSec: 5,
      transitionIn: "cut",
      reason: "test",
    },
  ],
  coverage: [],
});

describe("cast sidecar", () => {
  it("reads back exactly what it writes", () => {
    const doc = JSON.parse(JSON.stringify(castSidecar(plan(), "x.rec")));
    expect(planFromSidecar(doc)?.shots).toHaveLength(1);
  });

  it("refuses a plan from another contract", () => {
    // The backfill, the browser and the headless script each carried
    // their own version number once, and disagreed: every sidecar was
    // rejected and the browser re-planned. The plan's own version is
    // the only one now.
    const p = plan();
    (p as { contractVersion: number }).contractVersion =
      CAST_CONTRACT_VERSION + 1;
    expect(planFromSidecar(castSidecar(p, "x.rec"))).toBeNull();
  });

  it("adopts the bucket's legacy envelopes, written before the contract", () => {
    // R2 holds casts with envelope version 1 or 2 and no contractVersion
    // on the plan; the commentary there was rendered against them. They
    // are adopted as they are. A plan that names a contract must name
    // this one, and an envelope version nobody wrote is still refused.
    const bare = { ...plan() } as Partial<ShotPlan>;
    delete bare.contractVersion;
    for (const version of [1, 2]) {
      const doc = {
        format: "castgenius-plan",
        version,
        demo: "x.rec",
        plan: bare,
      };
      expect(planFromSidecar(doc)?.shots, `envelope v${version}`).toHaveLength(
        1,
      );
    }
    expect(
      planFromSidecar({
        format: "castgenius-plan",
        version: 3,
        demo: "x.rec",
        plan: bare,
      }),
    ).toBeNull();
    expect(
      planFromSidecar({ format: "castgenius-plan", demo: "x.rec", plan: bare }),
    ).toBeNull();
  });

  it("carries the commentary track list, in order", () => {
    const tracks = [
      { label: "ChatGPT", suffix: "ChatGPT", model: "gpt-5.4-mini" },
      { label: "Gemini", suffix: "Gemini" },
    ];
    const doc = JSON.parse(
      JSON.stringify(castSidecar(plan(), "x.rec", tracks)),
    );
    expect(commentaryFromSidecar(doc)).toEqual(tracks);
    // A sidecar with no tracks lists none, and says nothing about it.
    expect("commentary" in castSidecar(plan(), "x.rec")).toBe(false);
    expect(commentaryFromSidecar(castSidecar(plan(), "x.rec"))).toEqual([]);
  });

  it("drops junk from the track list rather than the whole list", () => {
    const doc = {
      ...castSidecar(plan(), "x.rec"),
      commentary: [null, 3, { label: "Gemini" }],
    };
    expect(commentaryFromSidecar(doc)).toEqual([{ label: "Gemini" }]);
    expect(commentaryFromSidecar({ commentary: [{ label: "x" }] })).toEqual([]);
  });

  it("refuses the wrong envelope, an empty plan, and junk", () => {
    expect(planFromSidecar({ plan: plan() })).toBeNull();
    expect(
      planFromSidecar(castSidecar({ ...plan(), shots: [] }, "x.rec")),
    ).toBeNull();
    expect(planFromSidecar(null)).toBeNull();
    expect(planFromSidecar("nope")).toBeNull();
  });
});
