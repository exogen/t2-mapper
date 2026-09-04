import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh } from "three";
import {
  getWorldColliderCounts,
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";
import {
  setTerrainCollisionData,
  terrainHeightAt,
} from "../collision/terrainCollision";
import {
  createCollisionState,
  runInCollisionWorld,
} from "./nodeCollisionContext";

const mesh = () => {
  const m = new Mesh(new BoxGeometry(10, 10, 10));
  m.updateWorldMatrix(true, false);
  return m;
};

/** Yield to the event loop, so a test actually crosses an await
 *  boundary — the thing AsyncLocalStorage has to survive. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("collision world isolation", () => {
  it("keeps two worlds' colliders apart", async () => {
    const a = createCollisionState();
    const b = createCollisionState();

    await runInCollisionWorld(a, () => {
      registerInteriorCollider("only-in-a", [mesh()]);
    });
    await runInCollisionWorld(b, () => {
      registerInteriorCollider("only-in-b1", [mesh()]);
      registerInteriorCollider("only-in-b2", [mesh()]);
    });

    expect(
      await runInCollisionWorld(a, () => getWorldColliderCounts().interiors),
    ).toBe(1);
    expect(
      await runInCollisionWorld(b, () => getWorldColliderCounts().interiors),
    ).toBe(2);
  });

  it("survives await boundaries, so concurrent pipelines stay separate", async () => {
    // The real hazard: two interleaved async flows. A plain "current
    // world" variable would have one clobber the other here.
    const a = createCollisionState();
    const b = createCollisionState();

    const work = (state: ReturnType<typeof createCollisionState>, n: number) =>
      runInCollisionWorld(state, async () => {
        for (let i = 0; i < n; i++) {
          await tick();
          registerInteriorCollider(`m${i}`, [mesh()]);
        }
        return getWorldColliderCounts().interiors;
      });

    const [countA, countB] = await Promise.all([work(a, 3), work(b, 7)]);
    expect(countA).toBe(3);
    expect(countB).toBe(7);
  });

  it("does not leak into the default world", async () => {
    const before = getWorldColliderCounts().interiors;
    await runInCollisionWorld(createCollisionState(), () => {
      registerInteriorCollider("scoped", [mesh()]);
    });
    expect(getWorldColliderCounts().interiors).toBe(before);
  });

  it("falls back to the default world outside any scope", () => {
    // The browser never scopes a world; it must keep working unchanged.
    registerInteriorCollider("unscoped", [mesh()]);
    expect(getWorldColliderCounts().interiors).toBeGreaterThan(0);
    unregisterInteriorCollider("unscoped");
  });

  it("clears one world without touching another", async () => {
    const a = createCollisionState();
    const b = createCollisionState();
    await runInCollisionWorld(a, () => registerInteriorCollider("x", [mesh()]));
    await runInCollisionWorld(b, () => registerInteriorCollider("y", [mesh()]));

    a.interiors.clear();

    expect(
      await runInCollisionWorld(a, () => getWorldColliderCounts().interiors),
    ).toBe(0);
    expect(
      await runInCollisionWorld(b, () => getWorldColliderCounts().interiors),
    ).toBe(1);
  });

  it("scopes the terrain too, not just colliders", async () => {
    const a = createCollisionState();
    const b = createCollisionState();
    await runInCollisionWorld(a, () => {
      setTerrainCollisionData({
        heightMap: new Uint16Array(256 * 256).fill(
          Math.round((100 / 2048) * 65535),
        ),
        squareSize: 8,
      });
    });
    expect(
      await runInCollisionWorld(a, () => terrainHeightAt(0, 0)),
    ).toBeCloseTo(100, 1);
    expect(
      await runInCollisionWorld(b, () => terrainHeightAt(0, 0)),
    ).toBeNull();
  });
});
