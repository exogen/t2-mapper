import { expect, it } from "vitest";
import { ImageAnimation, imageThreadPosition } from "./imageAnimation";
import { parseWeaponImageStates } from "./streamHelpers";
import type { WeaponImageState } from "./types";
import { TestLiveStream } from "./streamTestFixtures";
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
      ejectShell: true,
      sequence: 1,
      sequenceVis: 2,
      flashSequence: true,
      scaleAnimation: true,
      timeoutValue: 0.5,
      transitionOnTimeout: 1,
    },
  ],
})!;

it("counts repeated shell ejections between renders and carries the baseline through restore", () => {
  const image = new ImageAnimation(table, 0, 42);
  image.advance(0, flags);
  image.advance(0.032, { ...flags, fireCount: 1 });
  const twoShots = image.advance(0.064, { ...flags, fireCount: 2 });
  expect(twoShots.shellEjections).toBe(2);

  const restored = new ImageAnimation(table, 0, 42);
  restored.restoreState(image.saveState());
  expect(restored.advance(0.096, { ...flags, fireCount: 2 })).toBe(twoShots);
  expect(
    restored.advance(0.128, { ...flags, fireCount: 3 }).shellEjections,
  ).toBe(3);
});

it("repairs active image threads and ejection flags when restoring an older checkpoint", () => {
  const stream = new TestLiveStream("play", "Player");
  stream.getDataBlockData = (id) =>
    id === 2
      ? {
          shapeName: "weapon_chaingun.dts",
          casing: 3,
          states: [
            { name: "Ready" },
            {
              name: "Fire",
              fire: true,
              ejectShell: true,
              sequence: 1,
              sequenceVis: 2,
              flashSequence: true,
              scaleAnimation: true,
              direction: true,
              timeoutValue: 0.5,
            },
          ],
        }
      : undefined;
  stream.createGhost(0, 1, {
    dataBlockId: 1,
    position: { x: 1, y: 2, z: 3 },
    images: [{ index: 0, dataBlockId: 2, fireCount: 0 }],
  });
  stream.updateGhost(0, {
    images: [{ index: 0, dataBlockId: 2, fireCount: 1 }],
  });
  const old = structuredClone(stream.checkpoint());
  const [shared] = old.shared.values();
  const savedStates = shared.imageSlots![0]!.imageStates!;
  for (const state of savedStates) {
    delete state.ejectShell;
    delete state.shockwave;
  }
  const [images] = old.images.values();
  const saved = images[0]!.current;
  saved.state.reverse = saved.anim!.reverse = true;
  saved.state.scaleAnimation = false;
  delete saved.anim!.timeout;
  delete saved.flash!.timeout;
  delete saved.shellEjections;
  const before = structuredClone(old);

  stream.restore(old);
  expect(stream.entityAt(0)?.imageSlots?.[0]?.animation).toMatchObject({
    state: { reverse: false, scaleAnimation: true },
    anim: { ...saved.anim, reverse: false, timeout: 0.5 },
    flash: { ...saved.flash, timeout: 0.5 },
  });
  stream.updateGhost(0, {
    images: [{ index: 0, dataBlockId: 2, fireCount: 2 }],
  });
  expect(stream.entityAt(0)?.imageSlots?.[0]?.animation?.shellEjections).toBe(
    1,
  );
  expect(old).toEqual(before);
});

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

it("preserves an inherited image thread when repairing a legacy state", () => {
  const states = parseWeaponImageStates({
    states: [
      {
        name: "Activate",
        sequence: 0,
        timeoutValue: 0.1,
        transitionOnTimeout: 2,
      },
      { name: "Ready", direction: false },
    ],
  })!;
  const image = new ImageAnimation(states, 0, 42);
  const ready = image.advance(0.2, flags);
  const restored = new ImageAnimation(states, 0, 42);
  restored.restoreState(image.saveState(), true);
  expect(restored.current.anim).toBe(ready.anim);
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

it("follows original state slots through gaps in a mod's named image states", () => {
  const states = parseWeaponImageStates({
    states: [
      { index: 0, name: "Activate", sequence: 0, transitionOnLoaded: 4 },
      { index: 3, name: "Ready", sequence: 1, transitionOnTriggerDown: 10 },
      {
        index: 9,
        name: "Fire",
        sequence: 2,
        fire: true,
        timeoutValue: 0.1,
        transitionOnTimeout: 4,
      },
    ],
  })!;
  const image = new ImageAnimation(states, 0, 42);
  const ready = image.advance(0, flags);
  expect(ready.state.stateIndex).toBe(3);
  expect(ready.anim?.sequence).toBe(1);

  const firing = image.advance(0.032, {
    ...flags,
    triggerDown: true,
    fireCount: 1,
  });
  expect(firing.state.stateIndex).toBe(9);
  expect(firing.state.isFiring).toBe(true);
  expect(firing.anim?.sequence).toBe(2);
  const reloaded = image.advance(0.2, { ...flags, fireCount: 1 });
  expect(reloaded.state.stateIndex).toBe(3);
  expect(reloaded.anim?.sequence).toBe(1);
});

it.each([1, 30])(
  "enters a valid unnamed native image slot %i without losing the finishing pose",
  (target) => {
    const states = parseWeaponImageStates({
      states: [
        {
          index: 0,
          name: "Activate",
          sequence: 0,
          transitionOnLoaded: target + 1,
        },
        { index: 3, name: "UnusedReady" },
      ],
    })!;
    const image = new ImageAnimation(states, 0, 42);
    const blank = image.advance(0, flags);
    expect(blank.state.stateIndex).toBe(target);
    expect(blank.state.sequenceName).toBeNull();
    expect(blank.state.isFiring).toBe(false);
    expect(blank.state.soundDataBlockIds).toEqual([]);
    expect(blank.anim?.sequence).toBe(0);
    expect(image.advance(1, flags).state.stateIndex).toBe(target);
  },
);

it("starts at native slot zero when the first named image state is later", () => {
  const states = parseWeaponImageStates({
    states: [{ index: 3, name: "Fire", fire: true, sequence: 0 }],
  })!;
  const image = new ImageAnimation(states, 0, 42);
  const idle = image.advance(0, flags);
  expect(idle.state.stateIndex).toBe(0);
  expect(idle.state.sequenceName).toBeNull();
  expect(idle.state.isFiring).toBe(false);
  expect(idle.anim).toBeUndefined();
  const firing = image.advance(0.032, { ...flags, fireCount: 1 });
  expect(firing.state.stateIndex).toBe(3);
  expect(firing.state.isFiring).toBe(true);
  expect(firing.anim?.sequence).toBe(0);
});
