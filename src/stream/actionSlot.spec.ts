import { describe, expect, it } from "vitest";
import {
  endActionPickHold,
  parkActionSlot,
  resolveActionSlot,
  setActionThread,
} from "./actionSlot";

describe("setActionThread", () => {
  it("takes a different action outright, even over a held one", () => {
    const seated = setActionThread(undefined, 29, { timeSec: 1, hold: true });
    expect(setActionThread(seated, "jump", { timeSec: 5 })).toEqual({
      action: "jump",
      calls: [{ timeSec: 5 }],
    });
  });

  it("keeps the same action's calls whose effect depends on its clip", () => {
    let cel = setActionThread(undefined, 30, { timeSec: 1 });
    cel = setActionThread(cel, 30, { timeSec: 1.5 });
    cel = setActionThread(cel, 30, { timeSec: 4 });
    expect(cel.calls.map((c) => c.timeSec)).toEqual([1, 1.5, 4]);
    // 2.3 s clip: the re-send at 1.5 s is ignored, the one at 4 s restarts.
    expect(resolveActionSlot(cel, 2.3, 3)).toMatchObject({ timeSec: 1 });
    expect(resolveActionSlot(cel, 2.3, 4.5)).toMatchObject({ timeSec: 4 });
  });

  it("drops calls that are certainly ignored", () => {
    // A held action stays: re-sends change nothing but the first snap.
    const seated = setActionThread(undefined, 29, { timeSec: 1, hold: true });
    const snapped = setActionThread(seated, 29, {
      timeSec: 1.3,
      hold: true,
      atEnd: true,
    });
    expect(snapped.calls).toHaveLength(2);
    expect(setActionThread(snapped, 29, { timeSec: 2, atEnd: true })).toBe(
      snapped,
    );
    expect(setActionThread(seated, 29, { timeSec: 2 })).toBe(seated);
    // Ski hops inside the pick hold extend it instead of adding a call.
    const ski = setActionThread(undefined, "ski", {
      timeSec: 1,
      pickHeldUntilSec: 1.7,
    });
    expect(
      setActionThread(ski, "ski", { timeSec: 1.5, pickHeldUntilSec: 2.2 }),
    ).toEqual({
      action: "ski",
      calls: [{ timeSec: 1, pickHeldUntilSec: 2.2 }],
    });
  });
});

describe("pick hold and parking", () => {
  it("cuts the hold short when a hop zeroes it, leaving a lapsed one alone", () => {
    const ski = setActionThread(undefined, "ski", {
      timeSec: 1,
      pickHeldUntilSec: 1.7,
    });
    expect(endActionPickHold(ski, 1.2)?.calls[0]).toEqual({
      timeSec: 1,
      pickHeldUntilSec: 1.2,
    });
    expect(endActionPickHold(ski, 3)).toBe(ski);
  });

  it("parks only once", () => {
    const pda = setActionThread(undefined, 18, { timeSec: 1 });
    const parked = parkActionSlot(pda, 2, "mount");
    expect(parked?.parkedSec).toBe(2);
    expect(parkActionSlot(parked, 3, "death")).toBe(parked);
    expect(resolveActionSlot(parked!, 1, 10).endSec).toBe(2);
    expect(resolveActionSlot(parked!, 2, 10).endSec).toBe(Infinity);
  });

  it("lets a jump end when the player mounts, but not when it dies", () => {
    // A mounted pickActionAnimation turns table JumpAnim into root.
    const jump = setActionThread(undefined, "jump", { timeSec: 1 });
    expect(parkActionSlot(jump, 1.5, "mount")).toBe(jump);
    expect(parkActionSlot(jump, 1.5, "death")?.parkedSec).toBe(1.5);
    const ski = setActionThread(undefined, "ski", { timeSec: 1 });
    expect(parkActionSlot(ski, 1.5, "mount")?.parkedSec).toBe(1.5);
  });
});
