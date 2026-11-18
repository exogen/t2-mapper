import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  blendPlayerRenderAim,
  getPlayerHeadAngles,
  getPlayerRenderAim,
  getPlayerViewAngles,
  playerBodyYawCorrection,
  playerLookPitchPosition,
} from "./playerView";
import {
  MAX_PITCH,
  orbitPullbackDir,
  playerYawToQuaternion,
  yawPitchToQuaternion,
} from "./streamHelpers";

it("fades the first-person aim correction without wrapping the body yaw", () => {
  const orbit = { yaw: Math.PI - 0.1, pitch: 0.2, headYaw: 0.1 };
  const eye = { yaw: -Math.PI + 0.1, pitch: 0.4, headYaw: 0.3 };
  blendPlayerRenderAim(orbit, eye, 0.5);
  expect(eye.yaw).toBeCloseTo(Math.PI);
  expect(eye.pitch).toBeCloseTo(0.3);
  expect(eye.headYaw).toBeCloseTo(0.2);
});

it("samples the retail arm and head pitch range and clamps at ±80°", () => {
  for (const [degrees, phase] of [
    [-86, 0],
    [-80, 0],
    [-60, 0.125],
    [0, 0.5],
    [60, 0.875],
    [80, 1],
    [86, 1],
  ])
    expect(playerLookPitchPosition((degrees * Math.PI) / 180)).toBeCloseTo(
      phase,
    );
});

describe("player view direction", () => {
  describe("demo first-person tick endpoints", () => {
    const previous = {
      rotation: playerYawToQuaternion(0),
      headPitch: 0,
      headYaw: 0,
      viewQuantized: true,
    };
    const current = {
      rotation: playerYawToQuaternion(0.05),
      headPitch: 0.04,
      headYaw: 0.02,
      viewQuantized: true,
      playerDelta: {
        posVec: [10, 20, 30] as [number, number, number],
        rot: 0.05,
        rotVec: 0,
        head: [0.06, 0.03] as [number, number],
        headVec: [0, 0] as [number, number],
        maxLookAngle: 1.5,
      },
    };
    const body = new Quaternion().fromArray(current.rotation);

    it("interpolates a packet correction even when movement deltas are zero", () => {
      const before = structuredClone({ previous, current });
      const bodyBefore = body.clone();
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const view = getPlayerViewAngles(
          body,
          current,
          t,
          { yaw: 0, pitch: 0 },
          false,
          previous,
        );
        expect(view.yaw).toBeCloseTo(0.08 * t, 12);
        expect(view.pitch).toBeCloseTo(0.06 * t, 12);
      }
      expect({ previous, current }).toEqual(before);
      expect(body).toEqual(bodyBefore);
    });

    it.each([1, -1])(
      "takes the short path through yaw wraparound (%s)",
      (sign) => {
        const from = {
          ...previous,
          rotation: playerYawToQuaternion((sign * 179 * Math.PI) / 180),
        };
        const to = {
          ...previous,
          rotation: playerYawToQuaternion((-sign * 179 * Math.PI) / 180),
        };
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const view = getPlayerViewAngles(
            body,
            to,
            t,
            { yaw: 0, pitch: 0 },
            false,
            from,
          );
          expect(view.yaw).toBeCloseTo(
            (sign * (179 + 2 * t) * Math.PI) / 180,
            12,
          );
        }
      },
    );

    it("takes the shortest path between the combined body and head headings", () => {
      const radians = Math.PI / 180;
      const from = { ...previous, headYaw: (80 * radians) / 1.5 };
      const to = {
        ...previous,
        rotation: playerYawToQuaternion(-179 * radians),
        headYaw: (-80 * radians) / 1.5,
      };
      const view = getPlayerViewAngles(
        body,
        to,
        0.5,
        { yaw: 0, pitch: 0 },
        false,
        from,
      );
      expect(view.yaw / radians).toBeCloseTo(90.5, 12);
    });

    it("preserves half-step aim correction and endpoint pitch limits", () => {
      const level = (31 / 63) * 2 - 1;
      const from = { ...previous, headPitch: -1, headYaw: level };
      const to = { ...previous, headPitch: 1, headYaw: level };
      for (const t of [0, 0.5, 1]) {
        const view = getPlayerViewAngles(
          body,
          to,
          t,
          { yaw: 0, pitch: 0 },
          true,
          from,
        );
        expect(view.yaw).toBeCloseTo(Math.PI / 127, 12);
        expect(view.pitch).toBeCloseTo(-1.5 + 3 * t, 12);
      }
    });

    it("interpolates reconstructed endpoints within a single packed angle step", () => {
      const from = {
        ...previous,
        reconstructedAim: { bodyYaw: 0.02, pitch: 0.004, headYaw: 0 },
      };
      const to = {
        ...from,
        reconstructedAim: { bodyYaw: 0.03, pitch: 0.02, headYaw: 0 },
      };
      const view = getPlayerViewAngles(
        body,
        to,
        0.5,
        { yaw: 0, pitch: 0 },
        true,
        from,
      );
      expect(view.yaw).toBeCloseTo(0.025, 12);
      expect(view.pitch).toBeCloseTo(0.012, 12);

      const fitted = {
        previous: { bodyYaw: 0.01, pitch: 0.02, headYaw: 0 },
        current: { bodyYaw: 0.02, pitch: 0.04, headYaw: 0 },
      };
      const fittedView = getPlayerViewAngles(
        body,
        to,
        0.5,
        { yaw: 0, pitch: 0 },
        true,
        from,
        fitted,
      );
      expect(fittedView.yaw).toBeCloseTo(0.015, 12);
      expect(fittedView.pitch).toBeCloseTo(0.03, 12);
    });

    it("shares one fitted aim for the body, head, and first-person camera", () => {
      const previousAim = {
        bodyYaw: 3.1,
        headYaw: 0.2,
        pitch: -0.3,
      };
      const currentAim = {
        bodyYaw: 3.2 - 2 * Math.PI,
        headYaw: 0.3,
        pitch: 0.1,
      };
      const aim = getPlayerRenderAim(
        body,
        current,
        0.5,
        { yaw: 0, pitch: 0, headYaw: 0 },
        true,
        previous,
        { previous: previousAim, current: currentAim },
      );
      expect(aim.pitch).toBeCloseTo(-0.1);
      expect(aim.headYaw).toBeCloseTo(0.25);
      expect(aim.yaw - aim.headYaw).toBeCloseTo(3.15);
      expect(aim.yaw).toBeCloseTo(3.4);
    });

    it("keeps the mount's rendered heading and interpolates only the player's head", () => {
      const mount = { mountObjectId: "vehicle:1", mountNode: 0 };
      const from = {
        ...previous,
        ...mount,
        rotation: playerYawToQuaternion(2),
      };
      const to = { ...current, ...mount };
      const vehicle = new Quaternion().fromArray(playerYawToQuaternion(0.7));
      const view = getPlayerViewAngles(
        vehicle,
        to,
        0.5,
        { yaw: 0, pitch: 0 },
        false,
        from,
      );
      expect(view.yaw).toBeCloseTo(0.7 + 0.015, 12);
      expect(view.pitch).toBeCloseTo(0.03, 12);
    });

    it.each([
      {
        name: "full-precision view",
        player: { ...current, viewQuantized: false },
        previous,
      },
      {
        name: "first quantized tick",
        player: current,
        previous: { ...previous, viewQuantized: false },
      },
      { name: "new player lifetime", player: current, previous: undefined },
      {
        name: "mount change",
        player: { ...current, mountObjectId: "vehicle:2" },
        previous: { ...previous, mountObjectId: "vehicle:1" },
      },
      {
        name: "seat change",
        player: { ...current, mountObjectId: "vehicle:1", mountNode: 1 },
        previous: { ...previous, mountObjectId: "vehicle:1", mountNode: 0 },
      },
    ])("keeps the existing view for $name", ({ player, previous }) => {
      expect(
        getPlayerViewAngles(
          body,
          player,
          0.5,
          { yaw: 0, pitch: 0 },
          true,
          previous,
        ),
      ).toEqual(
        getPlayerViewAngles(body, player, 0.5, { yaw: 0, pitch: 0 }, true),
      );
    });
  });

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
