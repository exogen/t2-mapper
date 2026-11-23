import { expect, it, vi } from "vitest";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSSequence, createDTSTestShape } from "../dts/dtsTestFixtures";
import type { StreamingPlayback } from "../stream/types";
import * as playerActionMap from "../stream/playerActionMap";
import {
  clearGroundActionMaps,
  groundActionName,
  type GroundShape,
} from "./groundEffectAssets";

it("refreshes ground action aliases when late constructor metadata replaces its list", () => {
  const data = createDTSTestShape();
  const nameIndex = data.names.push("forward") - 1;
  data.sequences = [
    createDTSSequence({
      nameIndex,
      source: { name: "forward", sequenceName: "forward" },
    }),
  ];
  const model = buildDTS(data);
  const shape: GroundShape = {
    model,
    clips: new Map(model.animations.map((clip) => [clip.name, clip])),
  };
  let sequences = ["late_player_forward.dsq run"];
  const playback = {
    getShapeConstructorSequences: vi.fn(() => sequences),
  } as unknown as StreamingPlayback;
  const builds = vi.spyOn(playerActionMap, "buildActionAnimMap");
  try {
    expect(groundActionName(playback, shape, "late_player.dts", "run")).toBe(
      "forward",
    );
    // The stream replaces its cached list as constructor datablocks arrive.
    sequences = ["late_player_forward.dsq side"];
    expect(
      groundActionName(playback, shape, "late_player.dts", "run"),
    ).toBeUndefined();
    expect(groundActionName(playback, shape, "late_player.dts", "side")).toBe(
      "forward",
    );
    expect(groundActionName(playback, shape, "late_player.dts", 3)).toBe(
      "forward",
    );
    expect(builds).toHaveBeenCalledTimes(2);
  } finally {
    clearGroundActionMaps(playback);
    builds.mockRestore();
  }
});
