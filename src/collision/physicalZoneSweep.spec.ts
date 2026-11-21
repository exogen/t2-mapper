import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { IDENTITY_MATRIX } from "../scene/types";
import { PhysicalZoneSweep, type PhysicalZone } from "./physicalZoneSweep";

const size = new Vector3(1, 1, 2);
const clear = () => false;
function zone(x = 1, velocityMod = 0.1, active = true): PhysicalZone {
  const elements = [...IDENTITY_MATRIX.elements];
  elements[3] = x;
  return {
    transform: { elements, position: { x, y: 0, z: 0 } },
    scale: { x: 0.2, y: 6, z: 6 },
    points: [],
    velocityMod,
    active,
  };
}

describe("PhysicalZone movement sweep", () => {
  it("hits the front surface rather than continually slowing a player inside", () => {
    const sweep = new PhysicalZoneSweep();
    const field = zone();
    expect(
      sweep.getVelocityScale(
        [field],
        new Vector3(),
        size,
        new Vector3(0.6, 0, 0),
        clear,
      ),
    ).toBeCloseTo(0.1);
    expect(
      sweep.getVelocityScale(
        [field],
        new Vector3(0.8, 0, 0),
        size,
        new Vector3(0.5, 0, 0),
        clear,
      ),
    ).toBe(1);
  });

  it("uses the transformed local box around the transmitted points", () => {
    const sweep = new PhysicalZoneSweep();
    const rotated = {
      ...zone(),
      // Rotate a thin gate about Z. The resulting footprint is x=1..7, y=2..2.2.
      transform: {
        elements: [0, 1, 0, 1, -1, 0, 0, 2.2, 0, 0, 1, -1, 0, 0, 0, 1],
        position: { x: 1, y: 2.2, z: -1 },
      },
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
      ],
    };
    expect(
      sweep.getVelocityScale(
        [rotated],
        new Vector3(4, 1, 0),
        size,
        new Vector3(0, 0.6, 0),
        clear,
      ),
    ).toBeCloseTo(0.1);
    expect(
      sweep.getVelocityScale(
        [rotated],
        new Vector3(4, -1, 0),
        size,
        new Vector3(0, -0.6, 0),
        clear,
      ),
    ).toBe(1);
  });

  it("multiplies tied hits once per face and skips inactive hits after selection", () => {
    const sweep = new PhysicalZoneSweep();
    const start = new Vector3();
    const travel = new Vector3(2, 0, 0);
    expect(
      sweep.getVelocityScale(
        [zone(1.5, 0.2), zone(1, 0.1), zone(1, 0.5)],
        start,
        size,
        travel,
        clear,
      ),
    ).toBeCloseTo(0.05);
    expect(
      sweep.getVelocityScale(
        [zone(1, 0.1, false), zone(1.5, 0.2)],
        start,
        size,
        travel,
        clear,
      ),
    ).toBe(1);
  });

  it("only counts a near-end face on a short move if the destination is occupied", () => {
    const sweep = new PhysicalZoneSweep();
    const field = [zone(1.005)];
    const start = new Vector3();
    const travel = new Vector3(0.4, 0, 0);
    expect(sweep.getVelocityScale(field, start, size, travel, clear)).toBe(1);
    expect(
      sweep.getVelocityScale(field, start, size, travel, () => true),
    ).toBeCloseTo(0.1);
  });

  it("misses a gate just outside the player's leading face", () => {
    const sweep = new PhysicalZoneSweep();
    const field = zone();
    field.transform.position.y = field.transform.elements[7] = 3.505;
    expect(
      sweep.getVelocityScale(
        [field],
        new Vector3(),
        size,
        new Vector3(1.5, 0, 0),
        clear,
      ),
    ).toBe(1);
  });
});
