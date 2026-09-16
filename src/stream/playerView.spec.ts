import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { getPlayerViewAngles } from "./playerView";
import {
  MAX_PITCH,
  orbitPullbackDir,
  playerYawToQuaternion,
  yawPitchToQuaternion,
} from "./streamHelpers";

describe("player view direction", () => {
  it("tracks rendered body yaw plus interpolated head angles, not tick endpoints", () => {
    const body = new Quaternion().fromArray(playerYawToQuaternion(0.7));
    const player = {
      headPitch: -1,
      headYaw: -1,
      playerDelta: {
        posVec: [0, 0, 0] as [number, number, number],
        rot: 1.2,
        rotVec: -0.8,
        head: [0.6, 0.2] as [number, number],
        headVec: [-0.4, -0.1] as [number, number],
        maxLookAngle: 1.5,
      },
    };
    for (const interpT of [0, 0.25, 0.5, 1]) {
      const angles = getPlayerViewAngles(body, player, interpT, {
        yaw: 0,
        pitch: 0,
      });
      expect(angles.yaw).toBeCloseTo(0.7 + 0.2 - 0.1 * (1 - interpT));
      expect(angles.pitch).toBeCloseTo(0.6 - 0.4 * (1 - interpT));
    }
  });

  it.each([-Math.PI, -1, 0, 1, Math.PI])(
    "keeps the orbit exactly behind the first-person view at heading %s",
    (yaw) => {
      const body = new Quaternion().fromArray(playerYawToQuaternion(yaw));
      for (const headPitch of [-1, 0, 1]) {
        const view = getPlayerViewAngles(body, { headPitch, headYaw: 0.2 }, 1, {
          yaw: 0,
          pitch: 0,
        });
        const eyeDirection = new Vector3(0, 0, -1).applyQuaternion(
          new Quaternion().fromArray(
            yawPitchToQuaternion(view.yaw, view.pitch),
          ),
        );
        const pullback = orbitPullbackDir(view.yaw, view.pitch, new Vector3());
        expect(pullback.dot(eyeDirection)).toBeCloseTo(-1);
      }
    },
  );

  it("defaults missing head data to level and clamps pitch away from the poles", () => {
    const out = { yaw: 42, pitch: 42 };
    expect(getPlayerViewAngles(new Quaternion(), undefined, 0.5, out)).toBe(
      out,
    );
    expect(out).toEqual({ yaw: 0, pitch: 0 });
    getPlayerViewAngles(new Quaternion(), { headPitch: 2 }, 1, out);
    expect(out.pitch).toBe(MAX_PITCH);
  });
});
