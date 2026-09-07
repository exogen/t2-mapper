import { describe, expect, it } from "vitest";
import { WeaponImageStateMachine } from "./weaponStateMachine";
import type { WeaponImageDataBlockState, WeaponImageState } from "./types";

const NONE = -1;

function state(
  overrides: Partial<WeaponImageDataBlockState> & { name: string },
): WeaponImageDataBlockState {
  return {
    transitionOnLoaded: NONE,
    transitionOnNotLoaded: NONE,
    transitionOnAmmo: NONE,
    transitionOnNoAmmo: NONE,
    transitionOnTarget: NONE,
    transitionOnNoTarget: NONE,
    transitionOnWet: NONE,
    transitionOnNotWet: NONE,
    transitionOnTriggerUp: NONE,
    transitionOnTriggerDown: NONE,
    transitionOnTimeout: NONE,
    waitForTimeout: true,
    fire: false,
    flashSequence: false,
    spin: 0,
    direction: true,
    scaleAnimation: false,
    loaded: 0,
    soundDataBlockId: -1,
    ...overrides,
  };
}

/** The plasma turret barrel's table: Ready → Fire → Reload → Ready. */
const READY = 0;
const FIRE = 1;
const RELOAD = 2;
const states: WeaponImageDataBlockState[] = [
  state({ name: "Ready", transitionOnTriggerDown: FIRE }),
  state({
    name: "Fire",
    fire: true,
    sequence: 1,
    timeoutValue: 0.3,
    transitionOnTimeout: RELOAD,
    soundDataBlockId: 77,
  }),
  state({ name: "Reload", timeoutValue: 0.8, transitionOnTimeout: READY }),
];
const seqNames = ["deploy", "fire"];

function flags(over: Partial<WeaponImageState>): WeaponImageState {
  return {
    dataBlockId: 1,
    triggerDown: false,
    ammo: true,
    loaded: true,
    target: false,
    wet: false,
    fireCount: 0,
    ...over,
  };
}

describe("WeaponImageStateMachine fire entry", () => {
  it("does not enter the fire state on a trigger alone", () => {
    const sm = new WeaponImageStateMachine(states, seqNames);
    sm.tick(0.032, flags({}));
    const out = sm.tick(0.032, flags({ triggerDown: true }));
    expect(sm.stateIndex).toBe(READY);
    expect(out.transitioned).toBe(false);
    expect(out.sequenceName).toBeNull();
  });

  it("enters the fire state on the server's fire notification", () => {
    const sm = new WeaponImageStateMachine(states, seqNames);
    sm.tick(0.032, flags({}));
    const out = sm.tick(0.032, flags({ triggerDown: true, fireCount: 1 }));
    expect(sm.stateIndex).toBe(FIRE);
    expect(out.transitioned).toBe(true);
    expect(out.isFiring).toBe(true);
    expect(out.sequenceName).toBe("fire");
    expect(out.soundDataBlockIds).toEqual([77]);
  });

  it("re-enters the fire state when another shot lands mid-fire", () => {
    const sm = new WeaponImageStateMachine(states, seqNames);
    sm.tick(0.032, flags({}));
    sm.tick(0.032, flags({ fireCount: 1 }));
    sm.tick(0.2, flags({ fireCount: 1 }));
    const out = sm.tick(0.032, flags({ fireCount: 2 }));
    expect(sm.stateIndex).toBe(FIRE);
    expect(out.transitioned).toBe(true);
    expect(out.soundDataBlockIds).toEqual([77]);
    // The timeout restarted: 0.3 s more before Reload.
    sm.tick(0.2, flags({ fireCount: 2 }));
    expect(sm.stateIndex).toBe(FIRE);
    sm.tick(0.15, flags({ fireCount: 2 }));
    expect(sm.stateIndex).toBe(RELOAD);
  });

  it("flags a timeout back into the same state as a self-transition", () => {
    const burst: WeaponImageDataBlockState[] = [
      state({ name: "Ready", transitionOnTriggerDown: 1 }),
      state({
        name: "Fire",
        fire: true,
        sequence: 0,
        flashSequence: true,
        sequenceVis: 1,
        timeoutValue: 0.15,
        transitionOnTimeout: 1,
        transitionOnTriggerUp: 0,
        soundDataBlockId: 5,
      }),
    ];
    const sm = new WeaponImageStateMachine(burst, ["fire", "fire_vis"]);
    sm.tick(0.032, flags({}));
    const first = sm.tick(0.032, flags({ triggerDown: true, fireCount: 1 }));
    expect(first.entered).toBe(true);
    expect(first.flashSequence).toBe(true);
    expect(first.visSequenceName).toBe("fire_vis");
    const again = sm.tick(0.2, flags({ triggerDown: true, fireCount: 1 }));
    expect(sm.stateIndex).toBe(1);
    expect(again.transitioned).toBe(true);
    expect(again.entered).toBe(false);
    expect(again.soundDataBlockIds).toEqual([]);
  });

  it("times out through reload back to ready", () => {
    const sm = new WeaponImageStateMachine(states, seqNames);
    sm.tick(0.032, flags({}));
    sm.tick(0.032, flags({ fireCount: 1 }));
    sm.tick(0.35, flags({ fireCount: 1 }));
    expect(sm.stateIndex).toBe(RELOAD);
    const out = sm.tick(0.85, flags({ fireCount: 1 }));
    expect(sm.stateIndex).toBe(READY);
    // Ready has no sequence: the thread is left alone.
    expect(out.sequenceName).toBeNull();
  });
});

describe("WeaponImageStateMachine fast-forward", () => {
  it("lands in the resting state a long-mounted image would be in", () => {
    // The plasma barrel's chain: Activate → ActivateReady (1 s) → Ready.
    const chain: WeaponImageDataBlockState[] = [
      state({ name: "Activate", transitionOnLoaded: 1 }),
      state({
        name: "ActivateReady",
        sequence: 0,
        timeoutValue: 1,
        transitionOnTimeout: 2,
        soundDataBlockId: 9,
      }),
      state({ name: "Ready", transitionOnTriggerDown: 3 }),
      state({ name: "Fire", fire: true, timeoutValue: 0.3 }),
    ];
    const sm = new WeaponImageStateMachine(chain, ["activate", "fire"]);
    sm.fastForward(30, flags({}));
    expect(sm.stateIndex).toBe(2);
    const snap = sm.snapshot();
    expect(snap.entered).toBe(true);
    expect(snap.transitioned).toBe(false);
    expect(snap.soundDataBlockIds).toEqual([]);
    expect(snap.sequenceName).toBeNull();
  });

  it("a fresh image's snapshot carries its first state's entry sound", () => {
    const fresh = new WeaponImageStateMachine(
      [state({ name: "Activate", sequence: 0, soundDataBlockId: 4 })],
      ["activate"],
    );
    const snap = fresh.snapshot(true);
    expect(snap.soundDataBlockIds).toEqual([4]);
    expect(snap.sequenceName).toBe("activate");
    expect(fresh.snapshot().soundDataBlockIds).toEqual([]);
  });
});
