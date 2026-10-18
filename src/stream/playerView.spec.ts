import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  getPlayerHeadAngles,
  getPlayerViewAngles,
  playerBodyYawCorrection,
} from "./playerView";
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

  describe("aim correction", () => {
    // writeSignedFloat chops toward zero: a level head packs as step 31.
    const level = (31 / 63) * 2 - 1;
    const body = new Quaternion().fromArray(playerYawToQuaternion(0.7));
    const view = (
      player: Parameters<typeof getPlayerViewAngles>[1],
      aimCorrection: boolean,
    ) =>
      getPlayerViewAngles(body, player, 1, { yaw: 0, pitch: 0 }, aimCorrection);
    const head = (player: Parameters<typeof getPlayerHeadAngles>[0]) =>
      getPlayerHeadAngles(player, 1, { pitch: 0, yaw: 0 }, true);

    it("reads a ghost's packed head angles at the middle of their step", () => {
      const ghost = { headPitch: level, headYaw: level, viewQuantized: true };
      expect(view(ghost, false).yaw).toBeCloseTo(0.7 - (1 / 63) * 1.5, 12);
      expect(view(ghost, false).pitch).toBeCloseTo(-(1 / 63) * 1.5, 12);
      // The rendered body carries its own half step.
      expect(view(ghost, true).yaw).toBeCloseTo(0.7, 12);
      expect(view(ghost, true).pitch).toBeCloseTo(0, 12);
    });

    it("corrects interpolated head angles by the same half step", () => {
      const ghost = {
        viewQuantized: true,
        playerDelta: {
          posVec: [0, 0, 0] as [number, number, number],
          rot: 0.7,
          rotVec: 0,
          head: [0.3, 0.15] as [number, number],
          headVec: [0.06, -0.03] as [number, number],
          maxLookAngle: 1.5,
        },
      };
      const raw = view(ghost, false);
      const corrected = view(ghost, true);
      expect(corrected.yaw - raw.yaw).toBeCloseTo((1 / 63) * 1.5, 12);
      expect(corrected.pitch - raw.pitch).toBeCloseTo((1 / 63) * 1.5, 12);
    });

    it("leaves the recording player's full-precision view as it is", () => {
      const own = { headPitch: 0.4, headYaw: 0, viewQuantized: false };
      expect(view(own, true)).toEqual(view(own, false));
      expect(playerBodyYawCorrection(own, true)).toBe(0);
    });

    it("keeps a pitch on either limit, where players pin against the clamp", () => {
      expect(head({ headPitch: -1, headYaw: 0, viewQuantized: true })).toEqual({
        pitch: -1,
        yaw: 1 / 63,
      });
      expect(
        head({ headPitch: 1, headYaw: 0, viewQuantized: true }).pitch,
      ).toBe(1);
      // The step just inside each limit still reads at its middle.
      expect(
        head({ headPitch: -1 + 2 / 63, viewQuantized: true }).pitch,
      ).toBeCloseTo(-1 + 3 / 63, 12);
      expect(
        head({ headPitch: (62 / 63) * 2 - 1, viewQuantized: true }).pitch,
      ).toBeCloseTo(62 / 63, 12);
    });

    it("reads head yaw at mid-step up to the end of its packed range", () => {
      expect(head({ headYaw: -1, viewQuantized: true }).yaw).toBe(-1 + 1 / 63);
      expect(head({ headYaw: 1, viewQuantized: true }).yaw).toBe(1);
    });

    it("turns a packed body by half a yaw step", () => {
      expect(playerBodyYawCorrection({ viewQuantized: true }, true)).toBe(
        Math.PI / 127,
      );
      expect(playerBodyYawCorrection({ viewQuantized: true }, false)).toBe(0);
      expect(playerBodyYawCorrection(undefined, true)).toBe(0);
    });
  });

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
