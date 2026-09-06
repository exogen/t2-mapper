import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  orientationAlongDirection,
  parseColorSegments,
  playerYawToQuaternion,
} from "./streamHelpers";

describe("parseColorSegments", () => {
  it("chat default: a pushed span inherits the line color (T2 chat HUD)", () => {
    // A chat line embedding a tagged name: the name is NOT recolored.
    const raw = "\x04Gabe: \x10\x0b\x08yeaunome\x11 says hi";
    expect(parseColorSegments(raw)).toEqual([
      { text: "Gabe: yeaunome says hi", colorCode: 2 },
    ]);
  });

  it("taggedColors: keeps color switches inside a pushed span", () => {
    // server.cs: "\cp\c7" @ tag @ "\c6" @ name @ "\co" — c7=0x0b, c6=0x08.
    const raw = "\x10\x0b=TAG=\x08Player\x11";
    expect(parseColorSegments(raw, { taggedColors: true })).toEqual([
      { text: "=TAG=", colorCode: 7 },
      { text: "Player", colorCode: 6 },
    ]);
  });

  it("taggedColors: restores the pre-push color after pop", () => {
    const raw = "\x02before \x10\x0cSmurf\x11 after";
    expect(parseColorSegments(raw, { taggedColors: true })).toEqual([
      { text: "before ", colorCode: 0 },
      { text: "Smurf", colorCode: 8 },
      { text: " after", colorCode: 0 },
    ]);
  });
});

describe("orientationAlongDirection", () => {
  const rotate = (q: number[], v: [number, number, number]) => {
    const out = new Vector3(...v).applyQuaternion(
      new Quaternion(q[0], q[1], q[2], q[3]),
    );
    return [out.x, out.y, out.z].map((n) => +n.toFixed(6));
  };

  it("is the identity for the shape's own forward (+y Torque, +X Three)", () => {
    expect(orientationAlongDirection([0, 5, 0])!.map((n) => n + 0)).toEqual([
      0, 0, 0, 1,
    ]);
  });

  it("matches the yaw rule for level directions", () => {
    const q = orientationAlongDirection([1, 0, 0])!;
    expect(q.map((n) => +n.toFixed(6))).toEqual(
      playerYawToQuaternion(Math.atan2(1, 0)).map((n) => +n.toFixed(6)),
    );
  });

  it("pitches the forward axis along a climbing path", () => {
    // Torque (0, 1, 1) is Three (1, 1, 0): forward (Three X) must land there.
    const q = orientationAlongDirection([0, 1, 1])!;
    expect(rotate(q, [1, 0, 0])).toEqual([0.707107, 0.707107, 0]);
    // and the shape's up (Three Y) stays as upright as the path allows.
    expect(rotate(q, [0, 1, 0])).toEqual([-0.707107, 0.707107, 0]);
  });

  it("uses the vertical fallback and rejects a zero vector", () => {
    const q = orientationAlongDirection([0, 0, -1])!;
    expect(rotate(q, [1, 0, 0])).toEqual([0, -1, 0]);
    expect(orientationAlongDirection([0, 0, 0])).toBeNull();
  });
});
