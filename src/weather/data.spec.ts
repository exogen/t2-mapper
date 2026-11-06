import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../torqueScript/runtime";
import {
  precipitationPercentage,
  resolveMissionLightning,
  resolveMissionPrecipitation,
  resolveStreamLightning,
  resolveStreamPrecipitation,
} from "./data";

describe("retail weather data adapters", () => {
  it("normalizes the decoder's type and sound labels using registered retail offsets", () => {
    const blocks: Record<number, Record<string, unknown>> = {
      1: { filename: "impact.wav", description: 4 },
      2: { filename: "thunder.wav", description: 4 },
      3: { filename: "rain.wav", description: 5 },
      4: { is3D: true, referenceDistance: 100, maxDistance: 6400 },
      5: { is3D: false, isLooping: true, volume: 0.5 },
    };
    const get = (id: number) => blocks[id];
    const rain = resolveStreamPrecipitation(
      { numDrops: 0, soundProfile: 3 },
      { maxDrops: 2000, maxRadius: 80 },
      get,
      0,
    );
    const snow = resolveStreamPrecipitation(
      { numDrops: 1 },
      { maxRadius: -1 },
      get,
      0,
    );
    expect(rain).toMatchObject({
      type: 0,
      maxDrops: 2000,
      minVelocity: 1.25,
      maxVelocity: 4,
      colors: [[0.6, 0.6, 0.6, 1]],
      sound: {
        filename: "rain.wav",
        isLooping: true,
        is3D: false,
        volume: 0.5,
      },
    });
    expect(snow).toMatchObject({
      type: 1,
      maxDrops: 2000,
      maxRadius: 125,
      minVelocity: 0.25,
      maxVelocity: 1.5,
    });
    const lightning = resolveStreamLightning(
      {
        strikeSounds: [2],
        thunderSound: 1,
        strikeTextures: ["special/skyLightning"],
      },
      { scale: { x: 624, y: 688, z: 500 } },
      get,
    );
    expect(lightning.strikeSound?.filename).toBe("impact.wav");
    expect(lightning.thunderSounds.map((s) => s.filename)).toEqual([
      "thunder.wav",
    ]);
    expect(lightning.scale).toEqual([624, 688, 500]);
    expect(
      resolveStreamLightning({ strikeTextures: ["", "unused"] }, {}, get)
        .strikeTextures,
    ).toEqual(["", "unused"]);
  });

  it("keeps sparse masks, interprets target/duration in native order, and interpolates native seconds", () => {
    const get = () => undefined;
    const start = resolveStreamPrecipitation(
      { numDrops: 1 },
      {
        percentage: 1,
        maxDrops: 1500,
        colors: [{ r: 0.5, g: 0.6, b: 0.7, a: 1 }],
      },
      get,
      10,
    );
    const fade = resolveStreamPrecipitation(
      { numDrops: 1 },
      { stormUpdate: { endPercentage: 0, durationSeconds: 2 } },
      get,
      10,
      start,
    );
    expect(fade.storm).toEqual({
      startTime: 10,
      duration: 2.048,
      startPercentage: 1,
      endPercentage: 0,
    });
    expect(precipitationPercentage(fade, 11.024)).toBeCloseTo(0.5);
    const sparse = resolveStreamPrecipitation(
      { numDrops: 1 },
      {},
      get,
      11.024,
      fade,
    );
    expect(sparse.maxDrops).toBe(1500);
    expect(sparse.colors).toEqual(start.colors);
    expect(precipitationPercentage(sparse, 12.048)).toBeCloseTo(0);
    const direct = resolveStreamPrecipitation(
      { numDrops: 1 },
      { percentageUpdate: 0.75 },
      get,
      11.024,
      fade,
    );
    expect(precipitationPercentage(direct, 11.024)).toBeCloseTo(0.75);
    expect(precipitationPercentage(direct, 12.048)).toBeCloseTo(0.25);
    const hidden = resolveStreamPrecipitation(
      { numDrops: 1 },
      { stormPrecipitationOn: false },
      get,
      11.024,
      fade,
    );
    expect(hidden.enabled).toBe(false);
    expect(precipitationPercentage(hidden, 11.024)).toBe(0);
  });

  it("caches native wind speed before ghost tuning masks but after mission instance fields", async () => {
    const get = () => undefined;
    const ghost = resolveStreamPrecipitation(
      { numDrops: 0 },
      { minVelocity: 10, maxVelocity: 20 },
      get,
      0,
    );
    expect(ghost).toMatchObject({ minVelocity: 10, maxVelocity: 20 });
    expect(ghost.averageSpeed).toBeCloseTo(((1.25 + 4) / 2) * 0.65);
    const updated = resolveStreamPrecipitation(
      { numDrops: 0 },
      { minVelocity: 20, maxVelocity: 30 },
      get,
      1,
      ghost,
    );
    expect(updated.averageSpeed).toBe(ghost.averageSpeed);
    const runtime = createRuntime();
    try {
      (
        await runtime.loadFromSource(`
          datablock PrecipitationData(TestWeather) { type = 0; };
          new Precipitation(TestRain) {
            dataBlock = TestWeather;
            minVelocity = 10;
            maxVelocity = 20;
          };
        `)
      ).execute();
      const rain = runtime.getObjectByName("TestRain")!;
      expect(
        resolveMissionPrecipitation(rain, runtime)?.averageSpeed,
      ).toBeCloseTo(((10 + 20) / 2) * 0.65);
    } finally {
      runtime.destroy();
    }
  });

  it("reproduces the retail initial fading-out catch-up sign", () => {
    const config = resolveStreamPrecipitation(
      { numDrops: 0 },
      {
        percentage: 0.5,
        stormInitial: {
          elapsedTicks: 32,
          endPercentage: 0,
          durationSeconds: 2,
        },
      },
      () => undefined,
      20,
    );
    expect(config.percentage).toBe(0.75);
    expect(config.storm?.duration).toBe(3.072);
    expect(precipitationPercentage(config, 21.024)).toBeCloseTo(0.5);
    expect(config.drawCount).toBe(1500);
    expect(config.spawnCount).toBe(1500);
  });

  it("recomputes the storm slope between the initial and direct percentage masks", () => {
    const config = resolveStreamPrecipitation(
      { numDrops: 1 },
      {
        percentage: 0.5,
        stormInitial: {
          elapsedTicks: 32,
          endPercentage: 1,
          durationSeconds: 2,
        },
        stormPrecipitationOn: true,
        stormUpdate: { endPercentage: 1, durationSeconds: 2 },
        percentageUpdate: 0.5,
      },
      () => undefined,
      10,
    );
    expect(config.storm?.duration).toBeCloseTo(4.096);
    expect(precipitationPercentage(config, 12.048)).toBeCloseTo(0.75);
    expect(precipitationPercentage(config, 14.096)).toBe(1);
    expect(config).toMatchObject({ drawCount: 1000, spawnCount: 1000 });
  });

  it("retargets an active fade without changing its slope on a zero-duration mask", () => {
    const get = () => undefined;
    const start = resolveStreamPrecipitation(
      {},
      { stormUpdate: { endPercentage: 0, durationSeconds: 4 } },
      get,
      0,
    );
    const updated = resolveStreamPrecipitation(
      {},
      { stormUpdate: { endPercentage: 0.5, durationSeconds: 0 } },
      get,
      1.024,
      start,
    );
    expect(precipitationPercentage(updated, 1.536)).toBeCloseTo(0.625);
    expect(precipitationPercentage(updated, 3.072)).toBe(0.5);
  });

  it("retires completed storms before direct density and visibility changes", () => {
    const get = () => undefined;
    const initial = resolveStreamPrecipitation(
      { numDrops: 0 },
      { percentage: 0.5, maxDrops: 1000 },
      get,
      0,
    );
    const fading = resolveStreamPrecipitation(
      { numDrops: 0 },
      { stormUpdate: { endPercentage: 1, durationSeconds: 1 } },
      get,
      0,
      initial,
    );
    const direct = resolveStreamPrecipitation(
      { numDrops: 0 },
      { percentageUpdate: 0.25 },
      get,
      2,
      fading,
    );
    expect(direct.storm).toBeUndefined();
    expect(direct.spawnCount).toBe(1000);
    expect(precipitationPercentage(direct, 5)).toBe(0.25);
    const hidden = resolveStreamPrecipitation(
      { numDrops: 0 },
      { stormPrecipitationOn: false },
      get,
      2,
      fading,
    );
    const shown = resolveStreamPrecipitation(
      { numDrops: 0 },
      { stormPrecipitationOn: true },
      get,
      3,
      hidden,
    );
    expect(shown.storm).toBeUndefined();
    expect(shown.spawnCount).toBe(1000);
    expect(precipitationPercentage(shown, 5)).toBe(0);
  });

  it("uses the stored density when a new storm arrives while hidden", () => {
    const get = () => undefined;
    const fade = resolveStreamPrecipitation(
      {},
      {
        percentage: 0.25,
        stormUpdate: { endPercentage: 1, durationSeconds: 2 },
      },
      get,
      0,
    );
    const hidden = resolveStreamPrecipitation(
      {},
      { stormPrecipitationOn: false },
      get,
      1.024,
      fade,
    );
    const next = resolveStreamPrecipitation(
      {},
      { stormUpdate: { endPercentage: 0.5, durationSeconds: 2 } },
      get,
      10,
      hidden,
    );
    expect(next.enabled).toBe(true);
    expect(precipitationPercentage(next, 10)).toBe(0);
    expect(precipitationPercentage(next, 11.024)).toBeCloseTo(0.25);
  });

  it("preserves the native draw bound and respawn threshold across show and direct-density masks", () => {
    const get = () => undefined;
    const initial = resolveStreamPrecipitation(
      { numDrops: 0 },
      { percentage: 0.5, maxDrops: 2000 },
      get,
      0,
    );
    expect(initial).toMatchObject({ drawCount: 1000, spawnCount: 1000 });
    const hidden = resolveStreamPrecipitation(
      { numDrops: 0 },
      { stormPrecipitationOn: false },
      get,
      1,
      initial,
    );
    expect(hidden).toMatchObject({
      percentage: 0,
      enabled: false,
      drawCount: 1000,
      spawnCount: 1000,
    });
    const shown = resolveStreamPrecipitation(
      { numDrops: 0 },
      { stormPrecipitationOn: true },
      get,
      2,
      hidden,
    );
    expect(shown).toMatchObject({
      percentage: 0,
      enabled: true,
      drawCount: 1000,
      spawnCount: 1000,
    });
    const direct = resolveStreamPrecipitation(
      { numDrops: 0 },
      { percentageUpdate: 0.2 },
      get,
      3,
      shown,
    );
    expect(direct).toMatchObject({
      percentage: 0.2,
      drawCount: 400,
      spawnCount: 1000,
    });
    const fading = resolveStreamPrecipitation(
      { numDrops: 0 },
      { stormUpdate: { endPercentage: 1, durationSeconds: 2 } },
      get,
      4,
      direct,
    );
    expect(fading.drawCount).toBe(400);
    expect(fading.spawnCount).toBe(1000);
    const zero = resolveStreamPrecipitation(
      { numDrops: 0 },
      { percentage: 0 },
      get,
      0,
    );
    const zeroFade = resolveStreamPrecipitation(
      { numDrops: 0 },
      { stormUpdate: { endPercentage: 1, durationSeconds: 1 } },
      get,
      1,
      zero,
    );
    expect(zeroFade.drawCount).toBe(0);
  });

  it("resolves stock mission snow, rain, and storm data from authored fields", async () => {
    const runtime = createRuntime();
    try {
      for (const file of ["scripts/weather.cs", "scripts/lightning.cs"])
        (
          await runtime.loadFromSource(
            fs.readFileSync(`docs/base/@vl2/scripts.vl2/${file}`, "utf8"),
          )
        ).execute();
      (
        await runtime.loadFromSource(
          fs.readFileSync(
            "docs/base/@vl2/missions.vl2/missions/Katabatic.mis",
            "utf8",
          ),
        )
      ).execute();
      const snow = [...runtime.state.objectsById.values()].find(
        (o) => o._className === "Precipitation",
      )!;
      expect(resolveMissionPrecipitation(snow, runtime)).toMatchObject({
        type: 1,
        maxDrops: 2000,
        maxRadius: 125,
        materialList: "snowflakes.dml",
      });
      (
        await runtime.loadFromSource(
          fs.readFileSync(
            "docs/base/@vl2/missions.vl2/missions/Casern_Cavite.mis",
            "utf8",
          ),
        )
      ).execute();
      const rain = runtime.getObjectByName("Precipitation")!;
      const storm = [...runtime.state.objectsById.values()].find(
        (o) => o._className === "Lightning",
      )!;
      expect(resolveMissionPrecipitation(rain, runtime)).toMatchObject({
        type: 0,
        maxRadius: 80,
        colors: [[0.42, 0.45, 0.48, 1]],
        sound: { filename: "fx/environment/rain_light_1.wav" },
      });
      const lightning = resolveMissionLightning(storm, runtime)!;
      expect(lightning).toMatchObject({
        position: [-8, 88, 250],
        scale: [624, 688, 500],
        strikesPerMinute: 5,
        strikeSound: { filename: "fx/misc/lightning_impact.wav" },
      });
      expect(lightning.strikeTextures).toEqual([
        "special/skyLightning",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    } finally {
      runtime.destroy();
    }
  });
});
