import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { encodeDemoMoment, parseDemoMoment } from "./demoMoment";

describe("demo moment links", () => {
  it("carries a free-fly pose as the coordinates hash, at whole seconds", () => {
    const { t, hash } = encodeDemoMoment({
      timeSec: 1234.9,
      camera: {
        kind: "fly",
        position: new Vector3(1.23456, -2, 300),
        quaternion: new Quaternion(0, 0.7071, 0, 0.7071),
      },
    });
    expect(t).toBe(1234);
    expect(hash).toBe("#c1.235,-2,300~0,0.707,0,0.707");
    const back = parseDemoMoment(t, hash)!;
    expect(back.timeSec).toBe(1234);
    expect(back.camera.kind).toBe("fly");
    if (back.camera.kind === "fly") {
      expect(back.camera.position.x).toBeCloseTo(1.235);
      expect(back.camera.quaternion?.w).toBeCloseTo(0.707);
    }
  });

  it("round-trips a follow with its orbit", () => {
    const { t, hash } = encodeDemoMoment({
      timeSec: 60,
      camera: {
        kind: "follow",
        targetId: 43,
        yaw: 1.23456,
        pitch: -0.2,
        distance: 12.34,
      },
    });
    expect(hash).toBe("#f43~1.235,-0.2,12.3");
    expect(parseDemoMoment(t, hash)).toEqual({
      timeSec: 60,
      camera: {
        kind: "follow",
        targetId: 43,
        yaw: 1.235,
        pitch: -0.2,
        distance: 12.3,
      },
    });
  });

  it("keeps first-person and flag follows apart by their letter", () => {
    const fp = encodeDemoMoment({
      timeSec: 5,
      camera: { kind: "fp", targetId: 7, yaw: 0, pitch: 0, distance: 8 },
    });
    expect(fp.hash).toBe("#p7~0,0,8");
    expect(parseDemoMoment(5, fp.hash)?.camera.kind).toBe("fp");
    const flag = encodeDemoMoment({
      timeSec: 5,
      camera: { kind: "flag", slot: 2, yaw: 0, pitch: 0, distance: 8 },
    });
    expect(flag.hash).toBe("#g2~0,0,8");
    expect(parseDemoMoment(5, flag.hash)?.camera).toMatchObject({
      kind: "flag",
      slot: 2,
    });
  });

  it("has no hash for the recorded view", () => {
    expect(
      encodeDemoMoment({ timeSec: 9, camera: { kind: "original" } }),
    ).toEqual({ t: 9, hash: "" });
    expect(parseDemoMoment(9, "")).toEqual({
      timeSec: 9,
      camera: { kind: "original" },
    });
  });

  it("falls back rather than fail on a bad link", () => {
    expect(parseDemoMoment(null, "#c1,2,3~0,0,0,1")).toBeNull();
    expect(parseDemoMoment(-3, "")).toBeNull();
    // A mangled camera still seeks, in the recorded view.
    expect(parseDemoMoment(10, "#cjunk")).toEqual({
      timeSec: 10,
      camera: { kind: "original" },
    });
    expect(parseDemoMoment(10, "#fnope")).toEqual({
      timeSec: 10,
      camera: { kind: "original" },
    });
    expect(parseDemoMoment(10, "#zzz")).toEqual({
      timeSec: 10,
      camera: { kind: "original" },
    });
  });
});
