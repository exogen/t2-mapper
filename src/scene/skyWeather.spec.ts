import { describe, expect, it } from "vitest";
import {
  skyCloudStormFrame,
  skyFogPercentage,
  updateSkyWeather,
} from "./skyWeather";

describe("Sky weather masks", () => {
  it("reconstructs initial fog elapsed time and animates bands in native order", () => {
    const incoming = updateSkyWeather(
      undefined,
      {
        stormCurrent: -1,
        stormInit: {
          startPct: 0,
          duration: 2,
          indexOrMode: 1,
          startTime: 512,
          targetPct: 1,
        },
      },
      10,
      2,
    );
    expect(skyFogPercentage(incoming, 0, 2, 10)).toBeCloseTo(0.5);
    expect(skyFogPercentage(incoming, 1, 2, 10)).toBe(0);
    expect(skyFogPercentage(incoming, 1, 2, 11.024)).toBeCloseTo(0.5);

    const outgoing = updateSkyWeather(
      incoming,
      {
        stormTimeline: { startPct: 0, duration: 2, indexOrMode: -1 },
      },
      11,
      2,
    );
    expect(skyFogPercentage(outgoing, 0, 2, 11.512)).toBe(1);
    expect(skyFogPercentage(outgoing, 1, 2, 11.512)).toBeCloseTo(0.5);
    expect(skyFogPercentage(outgoing, 0, 2, 12.536)).toBeCloseTo(0.5);
  });

  it("applies show before storm masks and supports targeting a single volume", () => {
    const weather = updateSkyWeather(
      undefined,
      {
        stormFogOn: false,
        stormTimeline: { startPct: 1, duration: 2, indexOrMode: 1 },
        stormCloudsOn: false,
        stormType: 1,
        stormMagnitude: 3,
      },
      5,
      2,
    );
    expect(skyFogPercentage(weather, 0, 2, 6)).toBe(0);
    expect(skyFogPercentage(weather, 1, 2, 5.512)).toBeCloseTo(0.5);
    expect(weather).toMatchObject({
      cloudsOn: true,
      cloudStorm: { state: 1, duration: 3.072 },
    });
    const hidden = updateSkyWeather(
      weather,
      { stormFogOn: false, stormCloudsOn: false },
      7,
      2,
    );
    expect(skyFogPercentage(hidden, 1, 2, 8)).toBe(0);
    expect(hidden?.cloudsOn).toBe(false);
  });

  it("animates real fog only when enabled and retains density when stopped", () => {
    const profile = { enabled: 1, value0: 0.75, value1: 0.25, value2: 0.125 };
    const disabled = updateSkyWeather(
      undefined,
      { stormCloudProfile: profile },
      0,
      2,
    );
    expect(skyFogPercentage(disabled, 0, 2, 1)).toBe(1);
    const enabled = updateSkyWeather(disabled, { stormFogOn: true }, 1, 2);
    expect(skyFogPercentage(enabled, 0, 2, 1.065)).toBe(0.75);
    expect(skyFogPercentage(enabled, 1, 2, 1.065)).toBe(0.25);
    const stopped = updateSkyWeather(
      enabled,
      { stormCloudProfile: { ...profile, enabled: 0 } },
      1.065,
      2,
    );
    expect(skyFogPercentage(stopped, 0, 2, 5)).toBe(0.75);
  });

  it("sweeps each cloud layer inward and reverses the order on departure", () => {
    const incoming = { state: 1, startTime: 0, duration: 6 } as const;
    expect(skyCloudStormFrame(incoming, 0, 2, 1)).toEqual({
      visible: true,
      center: 1,
      fade: 0,
    });
    expect(skyCloudStormFrame(incoming, 1, 2, 1)?.visible).toBe(false);
    expect(skyCloudStormFrame(incoming, 0, 2, 2.5)).toEqual({
      visible: true,
      center: 0,
      fade: 0.5,
    });
    expect(skyCloudStormFrame(incoming, 1, 2, 6)).toBeUndefined();

    const outgoing = { ...incoming, state: 2 } as const;
    expect(skyCloudStormFrame(outgoing, 0, 2, 1)).toBeUndefined();
    expect(skyCloudStormFrame(outgoing, 1, 2, 2)).toEqual({
      visible: true,
      center: 1,
      fade: 0,
    });
    expect(skyCloudStormFrame(outgoing, 1, 2, 4)?.visible).toBe(false);
  });
});
