/**
 * The grid decides where a camera may stand. These pin the two rules
 * that geometry alone does not express.
 */
import { describe, expect, it, vi } from "vitest";
import type { DirectorDataset, DirectorVec3 } from "./types";

/** A flat world: solid below z=0, open above, and a pool whose surface
 *  sits at z=60 over the x/y region the assets occupy. */
const water = vi.hoisted(() => ({ surfaceZ: 60, on: true }));

vi.mock("../collision/worldCollision", () => ({
  pointObstructed: (p: number[], radius: number) => p[2] - radius < 0,
  castWorldRay: () => null,
}));

vi.mock("../collision/waterLevel", () => ({
  isPointSubmerged: (_x: number, _y: number, z: number) =>
    water.on && z < water.surfaceZ,
}));

const {
  buildFreeSpace,
  cameraSpotFor,
  createFreeSpaceBuild,
  eyesRoomy,
  isFree,
  roomAt,
} = await import("./freeSpace");

function datasetWith(positions: DirectorVec3[]): DirectorDataset {
  return {
    flagStands: positions.map((pos, i) => ({ slot: i, pos })),
    structureInventory: [],
  } as unknown as DirectorDataset;
}

describe("roomAt", () => {
  // Ground at z=0 and a one-unit grid, so the two clearance tiers land
  // on different rows: z=3 clears the roomy 3, z=2 only the tight 1.5.
  water.on = false;
  const grid = buildFreeSpace(
    datasetWith([
      [0, 0, 30],
      [10, 0, 30],
    ]),
    0,
    { step: 1, assetRadius: 40 },
  )!;

  it("tells roomy, tight and solid cells apart", () => {
    expect(roomAt(grid, [0, 0, 3])).toBe("roomy");
    expect(roomAt(grid, [0, 0, 2])).toBe("tight");
    expect(roomAt(grid, [0, 0, 1])).toBe("solid");
  });

  it("does not mistake an unexamined cell for a solid one", () => {
    // Inside the built box (padded 60 wide) but beyond the assets'
    // 40-unit reach: never tested.
    expect(roomAt(grid, [-55, 0, 3])).toBe("unknown");
    // Outside the box altogether.
    expect(roomAt(grid, [500, 0, 3])).toBe("unknown");
  });

  it("vetoes a path on what the grid knows, and only that", () => {
    expect(
      eyesRoomy(grid, [
        [0, 0, 3],
        [500, 0, 3],
      ]),
    ).toBe(true);
    expect(
      eyesRoomy(grid, [
        [0, 0, 3],
        [0, 0, 2],
      ]),
    ).toBe(false);
    expect(eyesRoomy(grid, [[0, 0, 1]])).toBe(false);
  });
});

describe("buildFreeSpace", () => {
  const dataset = datasetWith([
    [0, 0, 30],
    [60, 0, 30],
  ]);

  it("never offers a camera position under a liquid surface", () => {
    water.on = true;
    const grid = buildFreeSpace(dataset, 0)!;
    expect(grid).not.toBeNull();
    // Well clear of the floor, so only the water can be rejecting it.
    expect(isFree(grid, [0, 0, 40])).toBe(false);
    expect(isFree(grid, [0, 0, 70])).toBe(true);
  });

  it("keeps those same cells when the pool is gone", () => {
    // Guards the test above: without this, a grid that rejected
    // everything would pass it for the wrong reason.
    water.on = false;
    const grid = buildFreeSpace(dataset, 0)!;
    expect(isFree(grid, [0, 0, 40])).toBe(true);
  });

  it("keeps a camera clear of the waterline, not just out of the water", () => {
    water.on = true;
    const grid = buildFreeSpace(dataset, 0)!;
    const spot = cameraSpotFor(grid, [0, 0, 30], { wantDist: 20 });
    expect(spot).not.toBeNull();
    expect(spot![2]).toBeGreaterThan(water.surfaceZ);
  });
});

describe("the grid's clearance rule", () => {
  it("refuses cells with no room for a camera", () => {
    // The floor is solid below z=0 in this world, so a cell one unit up
    // has less than the clearance a lens needs and must be rejected —
    // this is the check that stops the grid handing back points inside
    // the ground.
    water.on = false;
    const grid = buildFreeSpace(
      datasetWith([
        [0, 0, 30],
        [60, 0, 30],
      ]),
      0,
    )!;
    expect(isFree(grid, [0, 0, 1])).toBe(false);
    expect(isFree(grid, [0, 0, 40])).toBe(true);
  });

  it("keeps a cell that clears the floor by more than the clearance", () => {
    // The control: without it, a grid that rejected everything would
    // pass the test above.
    water.on = false;
    const grid = buildFreeSpace(
      datasetWith([
        [0, 0, 30],
        [60, 0, 30],
      ]),
      0,
    )!;
    let free = 0;
    for (let z = 10; z < 120; z += 8) if (isFree(grid, [0, 0, z])) free++;
    expect(free).toBeGreaterThan(5);
  });
});

describe("building the grid a slice at a time", () => {
  // This is the path the director actually uses: half a second of
  // raycasting in one go is a frozen picture, so the build is pumped a
  // few milliseconds per tick. A cursor that skipped or repeated cells
  // would go unnoticed by any test of the all-at-once builder.
  const ds = () =>
    datasetWith([
      [0, 0, 30],
      [60, 0, 30],
    ]);

  it("reaches the identical grid however finely it is stepped", () => {
    water.on = true;
    const once = buildFreeSpace(ds(), 0)!;
    const build = createFreeSpaceBuild(ds(), 0)!;
    let steps = 0;
    // One chunk at a time: the most resumptions the cursor can be asked
    // to survive.
    while (!build.step(1)) {
      if (++steps > 100000) throw new Error("build never finished");
    }
    const stepped = build.grid!;
    expect(steps).toBeGreaterThan(1);
    expect(stepped.usable).toBe(once.usable);
    expect(stepped.total).toBe(once.total);
    expect([...stepped.free]).toEqual([...once.free]);
  });

  it("reports unfinished until it is done, and the grid stays null", () => {
    water.on = true;
    const build = createFreeSpaceBuild(ds(), 0)!;
    expect(build.step(1)).toBe(false);
    expect(build.grid).toBeNull();
    while (!build.step(1));
    expect(build.grid).not.toBeNull();
    // Idempotent once finished: the director keeps calling it.
    expect(build.step(1)).toBe(true);
  });

  it("makes no progress when asked for no work", () => {
    // Guards the loop above: `step(0)` must not silently do a chunk,
    // and must not spin forever either.
    water.on = true;
    const build = createFreeSpaceBuild(ds(), 0)!;
    expect(build.step(0)).toBe(false);
    expect(build.grid).toBeNull();
  });

  it("records what it was built around, with a reason each", () => {
    const dataset = {
      teams: [{ teamId: 1, name: "Storm" }],
      flagStands: [{ slot: 0, teamId: 1, pos: [0, 0, 30] }],
      structureInventory: [
        { firstSeenSec: 3.5, name: "generator", teamId: 1, pos: [20, 0, 30] },
        // Placed later than the build: not an anchor.
        {
          firstSeenSec: 90,
          name: "spider clamp turret",
          teamId: 1,
          pos: [400, 0, 30],
        },
      ],
    } as unknown as DirectorDataset;
    const grid = buildFreeSpace(dataset, 10)!;
    expect(grid.anchors.map((a) => a.label)).toEqual([
      "Storm flag stand",
      "Storm generator (seen 3.5s)",
    ]);
  });

  it("has nothing to build when the map has no anchors", () => {
    expect(createFreeSpaceBuild(datasetWith([]), 0)).toBeNull();
  });
});
