import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { carrierFramingFor } from "./carrierFraming";
import { buildFlagTracks } from "./dataset";
import { directorDataset } from "./directorTestFixtures";
import type { DirectorFlagSample, Shot } from "./types";

const carrierOrbit = {
  kind: "followFlag",
  slot: 2,
  startSec: 10,
  endSec: 17,
  reason: "Flag chase",
  transitionIn: "cut",
} satisfies Shot;

const flagSamples: DirectorFlagSample[] = [
  { timeSec: 10, slot: 2, pos: [0, 0, 0], carrierTargetId: 9, status: "held" },
  { timeSec: 13, slot: 2, pos: [0, 12, 0], carrierTargetId: 9, status: "held" },
  {
    timeSec: 13.5,
    slot: 2,
    pos: [3, 12, 2],
    carrierTargetId: null,
    status: "field",
  },
  {
    timeSec: 14,
    slot: 2,
    pos: [12, 12, 2],
    carrierTargetId: null,
    status: "field",
  },
];

describe("carrier orbit framing", () => {
  it("looks over the carrier toward the outgoing flag", () => {
    const dataset = directorDataset({ flagSamples });
    const framing = carrierFramingFor(
      carrierOrbit,
      dataset,
      buildFlagTracks(dataset),
    )!;
    const aim = new Vector3(0, 1, 0);
    const behind = new Vector3(0, 2, -20);
    const ahead = new Vector3(0, 2, 20);

    expect(framing.hasThrow).toBe(true);
    expect(framing.candidateYaws[0]).toBeCloseTo(Math.PI / 2);
    expect(framing.scoreAt(10, behind, aim)).toBeGreaterThan(
      framing.scoreAt(10, ahead, aim),
    );
  });

  it("uses only throw evidence inside the available lookahead", () => {
    const dataset = directorDataset({ flagSamples, durationSec: 13.5 });
    expect(
      carrierFramingFor(carrierOrbit, dataset, buildFlagTracks(dataset))
        ?.hasThrow,
    ).toBe(false);
  });

  it("looks toward a teammate when the pass never sampled loose", () => {
    const dataset = directorDataset({
      flagSamples: [
        ...flagSamples.slice(0, 2),
        {
          ...flagSamples[2],
          pos: [-12, 12, 0],
          status: "held",
          carrierTargetId: 4,
        },
      ],
      playerSamples: [
        { timeSec: 13, targetId: 9, teamId: 1, pos: [0, 12, 0] },
        { timeSec: 13, targetId: 4, teamId: 1, pos: [-12, 12, 0] },
      ],
    });
    const framing = carrierFramingFor(
      carrierOrbit,
      dataset,
      buildFlagTracks(dataset),
    );
    expect(framing?.hasThrow).toBe(true);
    expect(framing?.candidateYaws[0]).toBeCloseTo(-Math.PI / 2);
  });

  it.each([
    { timeSec: 13.4, hasThrow: false },
    { timeSec: 13.6, hasThrow: true },
  ])(
    "handles a carrier death at $timeSec relative to release",
    ({ timeSec, hasThrow }) => {
      const dataset = directorDataset({
        flagSamples,
        deaths: [
          {
            timeSec,
            targetId: 9,
            teamId: 1,
            pos: [0, 12, 0],
            killerTargetId: 7,
          },
        ],
      });
      expect(
        carrierFramingFor(carrierOrbit, dataset, buildFlagTracks(dataset))
          ?.hasThrow,
      ).toBe(hasThrow);
    },
  );

  it("prefers showing nearby support and pressure when there is no imminent throw", () => {
    const dataset = directorDataset({
      flagSamples: flagSamples.slice(0, 1),
      playerSamples: [
        { timeSec: 10, targetId: 9, teamId: 1, heading: 0, pos: [0, 0, 0] },
        { timeSec: 10, targetId: 4, teamId: 1, pos: [4, -28, 0] },
        { timeSec: 10, targetId: 5, teamId: 2, pos: [-4, -27, 0] },
      ],
    });
    const framing = carrierFramingFor(
      carrierOrbit,
      dataset,
      buildFlagTracks(dataset),
    )!;
    const aim = new Vector3(0, 1, 0);
    const looksTowardThePlayers = new Vector3(20, 2, 0);
    const looksAwayFromThePlayers = new Vector3(-20, 2, 0);

    expect(framing.scoreAt(10, looksTowardThePlayers, aim)).toBeGreaterThan(
      framing.scoreAt(10, looksAwayFromThePlayers, aim),
    );
    expect(
      framing.scoreAt(10, looksTowardThePlayers, aim, () => false),
    ).toBeLessThan(framing.scoreAt(10, looksAwayFromThePlayers, aim));
  });
});
