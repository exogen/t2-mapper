/**
 * A roster pass has to be able to try a DIFFERENT framing.
 *
 * It used to compute one — a fixed standoff on the rank's front side —
 * and emit it regardless. A line standing against a wall has no room
 * there, and 9 of the 16 unwatchable shots the planner produced on a
 * measured demo came from exactly that: no retry, so the audit deleted
 * them downstream instead of the planner framing them differently.
 */
import { describe, expect, it } from "vitest";
import { rosterCloseUp } from "./lineup";
import type { DirectorVec3, Shot } from "./types";

/** A rank of four, strung out along +x, all facing +y. */
function squad(): { targetId: number; pos: DirectorVec3; heading?: number }[] {
  return [0, 1, 2, 3].map((i) => ({
    targetId: i + 1,
    pos: [i * 8, 0, 50] as DirectorVec3,
    heading: 0,
  }));
}

function pass(framing = {}): Extract<Shot, { kind: "sweep" }> | null {
  const shot = rosterCloseUp(0, 12, squad(), "Storm", new Set(), framing);
  return shot?.kind === "sweep" ? shot : null;
}

describe("rosterCloseUp framings", () => {
  it("films the rank from a standoff by default", () => {
    const a = pass();
    expect(a).not.toBeNull();
    expect(Math.abs(a!.from[1])).toBeGreaterThan(1);
  });

  it("mirrors to the other side of the rank when asked", () => {
    const front = pass()!;
    const behind = pass({ mirror: true })!;
    // Same rank, opposite sides of it.
    expect(Math.sign(front.from[1])).toBe(-Math.sign(behind.from[1]));
  });

  it("moves closer and further on request", () => {
    const near = pass({ standoffScale: 0.5 })!;
    const far = pass({ standoffScale: 2 })!;
    expect(Math.abs(near.from[1])).toBeLessThan(Math.abs(far.from[1]));
  });

  it("lifts the whole pass without changing where it looks", () => {
    const low = pass()!;
    const high = pass({ lift: 5 })!;
    expect(high.from[2] - low.from[2]).toBeCloseTo(5, 5);
    expect(high.target[2]).toBeCloseTo(low.target[2], 5);
  });

  it("still refuses when there is no group to pan across", () => {
    // One player is not a rank; the caller falls back to a portrait.
    const alone = rosterCloseUp(
      0,
      12,
      [{ targetId: 1, pos: [0, 0, 50], heading: 0 }],
      "Storm",
      new Set(),
    );
    expect(alone).toBeNull();
  });
});
