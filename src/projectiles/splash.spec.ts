import { Texture } from "three";
import { expect, it } from "vitest";
import { createSplashRings } from "./splash";

it("skips ring geometry for particle-only splash frequencies", () => {
  const rings = createSplashRings(
    { ejectionFreq: 0.0001, ringLifetime: 0.5 },
    new Texture(),
  );
  expect(rings).toBeNull();
});

it("connects two living rings with a closed, wrapped strip", () => {
  const rings = createSplashRings(
    {
      numSegments: 4,
      ejectionFreq: 10,
      ringLifetime: 0.4,
      startRadius: 0.25,
      velocity: 3,
      ejectionAngle: 90,
      texWrap: 5,
      texFactor: 2,
      colors: [
        { r: 0, g: 0, b: 0, a: 0 },
        { r: 1, g: 1, b: 1, a: 0 },
      ],
      times: [0, 1],
    },
    new Texture(),
  )!;
  const geometry = rings.root.geometry;

  rings.update(0.05, 0.4);
  expect(rings.root.visible).toBe(false);
  rings.update(0.15, 0.4);
  expect(rings.root.visible).toBe(true);
  // Splash::createRing uses numSegments + 1 points, plus one seam vertex.
  expect(geometry.drawRange.count).toBe(5 * 6);

  const position = geometry.getAttribute("position");
  expect(position.getX(0)).toBeCloseTo(0.45);
  expect(position.getY(0)).toBeCloseTo(-0.11025);
  expect(position.getZ(0)).toBeCloseTo(-0.25);
  expect(position.getX(5)).toBe(position.getX(0));
  expect(position.getZ(5)).toBe(position.getZ(0));
  expect(position.getX(6)).toBeCloseTo(0.15);

  const color = geometry.getAttribute("vertexColor");
  expect(color.getX(0)).toBeCloseTo(0.375);
  expect(color.getW(0)).toBeCloseTo(0.75);
  expect(color.getW(6)).toBeCloseTo(0.25);
  const texCoord = geometry.getAttribute("texCoord");
  expect(texCoord.getX(5)).toBe(5);
  expect(texCoord.getY(6)).toBeCloseTo(0.2);
  rings.dispose();
});

it("rebuilds the same rings when seeking into their decay", () => {
  const rings = createSplashRings(
    { ejectionFreq: 5, acceleration: -3, ringLifetime: 1 },
    new Texture(),
  )!;
  const geometry = rings.root.geometry;
  const position = geometry.getAttribute("position");

  rings.update(0.7, 0.4);
  const decayPositions = Array.from(position.array);
  expect(geometry.drawRange.count).toBe(11 * 6);
  rings.update(0.25, 0.4);
  expect(Array.from(position.array)).not.toEqual(decayPositions);
  rings.update(0.7, 0.4);
  expect(Array.from(position.array)).toEqual(decayPositions);
  rings.update(1.4, 0.4);
  expect(rings.root.visible).toBe(false);
  rings.dispose();
});
