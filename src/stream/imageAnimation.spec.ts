import { expect, it } from "vitest";
import { ImageAnimation, imageThreadPosition } from "./imageAnimation";
import { parseWeaponImageStates } from "./streamHelpers";
import type { WeaponImageState } from "./types";
const flags: WeaponImageState = {
  dataBlockId: 1,
  loaded: true,
  ammo: true,
  target: false,
  wet: false,
  triggerDown: false,
  fireCount: 0,
};
const table = parseWeaponImageStates({
  states: [
    { name: "Ready", sequence: 0 },
    {
      name: "Fire",
      fire: true,
      sequence: 1,
      sequenceVis: 2,
      flashSequence: true,
      scaleAnimation: true,
      timeoutValue: 0.5,
      transitionOnTimeout: 1,
    },
  ],
})!;

it("honors the initial ghost's firing bit and reconstructs random flash poses deterministically", () => {
  const a = new ImageAnimation(table, 10, 42),
    b = new ImageAnimation(table, 10, 42);
  const first = a.advance(10, flags, true);
  expect(first.state.stateIndex).toBe(1);
  expect(b.advance(10, flags, true)).toEqual(first);
  expect(first.anim!.position).toBeGreaterThanOrEqual(0);
  expect(first.anim!.position).toBeLessThan(1);
  // Fire's 2-second main sequence scales to .5s. Its 1-second flash
  // must finish in .25s using that same time scale.
  expect(imageThreadPosition(first.flash!, 10.125, 1, false, 2)).toBe(0.5);
  expect(imageThreadPosition(first.flash!, 10.25, 1, false, 2)).toBe(1);
  const saved = structuredClone(first);
  a.advance(11, flags);
  expect(first).toEqual(saved);
});

it("retains a finishing one-shot through a no-sequence state but resets cyclic threads", () => {
  const states = parseWeaponImageStates({
    states: [
      {
        name: "Activate",
        sequence: 0,
        timeoutValue: 0.1,
        transitionOnTimeout: 2,
      },
      { name: "Ready" },
    ],
  })!;
  const image = new ImageAnimation(states, 5, 0);
  const finished = image.advance(6, flags);
  expect(finished.state.stateIndex).toBe(1);
  expect(imageThreadPosition(finished.anim!, 6, 2, false)).toBe(0.5);
  expect(imageThreadPosition(finished.anim!, 7, 2, false)).toBe(1);
  expect(imageThreadPosition(finished.anim!, 6, 2, true)).toBe(0);
});

it("restores the image timer, spin phase and random flash generator repeatedly", () => {
  const image = new ImageAnimation(table, 0, 42);
  image.advance(0, flags, true);
  image.advance(0.2, flags);
  const checkpoint = image.saveState();
  const before = structuredClone(checkpoint);
  const times = [0.4, 0.55, 0.72, 1.04, 1.51];
  const expected = times.map((t) => image.advance(t, flags, t === 0.72));
  for (let i = 0; i < 3; i++) {
    const restored = new ImageAnimation(table, 200, 123);
    restored.restoreState(checkpoint);
    expect(times.map((t) => restored.advance(t, flags, t === 0.72))).toEqual(
      expected,
    );
    expect(checkpoint).toEqual(before);
  }
});
