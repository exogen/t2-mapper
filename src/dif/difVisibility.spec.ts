import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { parseDIF, type DIFInterior } from "./dif";
import { createDIFTestBuffer } from "./difTestFixtures";
import {
  outsideZoneRect,
  roundZoneViewport,
  type DIFVisibilityRect,
} from "./difVisibility";

function fixture(zoneCount = 2) {
  const interior = parseDIF(createDIFTestBuffer().buffer).interiors[0];
  interior.points = [];
  interior.normals = [];
  interior.planes = [];
  interior.windings = [];
  interior.windingIndices = [];
  interior.portals = [];
  interior.zones = Array.from({ length: zoneCount }, () => ({
    portalStart: 0,
    portalCount: 0,
    surfaceStart: 0,
    surfaceCount: 0,
    flags: 0,
  }));
  const zonePortals: number[][] = Array.from({ length: zoneCount }, () => []);
  const fan = (points: DIFInterior["points"]) => {
    const windingStart = interior.windings.length;
    for (const point of points) {
      interior.windings.push(interior.points.length);
      interior.points.push(point);
    }
    interior.windingIndices.push({ windingStart, windingCount: points.length });
  };
  const portal = (
    front: number,
    back: number,
    rect: DIFVisibilityRect = [-0.5, -0.5, 0.5, 0.5],
    depth = 10,
  ) => {
    const index = interior.portals.length;
    const planeIndex = interior.planes.length;
    interior.normals.push([0, 0, 1]);
    interior.planes.push({ normalIndex: planeIndex, distance: depth });
    interior.portals.push({
      planeIndex,
      zoneFront: front,
      zoneBack: back,
      triFanStart: interior.windingIndices.length,
      triFanCount: 1,
    });
    fan([
      [rect[0] * depth, rect[1] * depth, -depth],
      [rect[2] * depth, rect[1] * depth, -depth],
      [rect[2] * depth, rect[3] * depth, -depth],
      [rect[0] * depth, rect[3] * depth, -depth],
    ]);
    zonePortals[front].push(index);
    zonePortals[back].push(index);
    return index;
  };
  const finish = () => {
    interior.zonePortals = [];
    interior.zones.forEach((zone, i) => {
      zone.portalStart = interior.zonePortals.length;
      zone.portalCount = zonePortals[i].length;
      interior.zonePortals.push(...zonePortals[i]);
    });
    return interior;
  };
  return { interior, portal, finish };
}

// This synthetic camera looks down local Torque -Z, with +Y screen-up.
// The combined matrix can describe any real instance/view/swizzle as well.
function projection(near = 0.1, far = 100): Matrix4 {
  return new PerspectiveCamera(90, 1, near, far).projectionMatrix;
}

function close(actual: DIFVisibilityRect | null, expected: DIFVisibilityRect) {
  expect(actual).not.toBeNull();
  for (let i = 0; i < 4; i++) expect(actual![i]).toBeCloseTo(expected[i], 9);
}

describe("retail DIF exterior visibility", () => {
  it("keeps outside/solid cameras fully visible and suppresses a sealed air zone", () => {
    const { finish } = fixture();
    const interior = finish();
    expect(outsideZoneRect(interior, [0, 0, 0], projection(), 0)).toEqual([
      -1, -1, 1, 1,
    ]);
    expect(outsideZoneRect(interior, [0, 0, 0], projection(), -1)).toEqual([
      -1, -1, 1, 1,
    ]);
    expect(outsideZoneRect(interior, [0, 0, 0], projection(), 1)).toBeNull();
  });

  it("clips exterior visibility to a facing portal and rejects a camera looking away", () => {
    const f = fixture();
    f.portal(1, 0, [-0.75, -0.4, 0.25, 0.6]);
    const interior = f.finish();
    close(
      outsideZoneRect(interior, [0, 0, 0], projection(), 1),
      [-0.75, -0.4, 0.25, 0.6],
    );
    const away = projection().multiply(new Matrix4().makeRotationY(Math.PI));
    expect(outsideZoneRect(interior, [0, 0, 0], away, 1)).toBeNull();
    // The same face, approached from its back-side room, is not traversable.
    expect(outsideZoneRect(interior, [0, 0, -20], projection(), 1)).toBeNull();
  });

  it("honors flipped portal planes and unions multiple exterior windows only at the end", () => {
    const f = fixture();
    const first = f.portal(0, 1, [-0.8, -0.5, -0.3, 0.5]);
    f.interior.portals[first].planeIndex |= 0x8000;
    f.portal(1, 0, [0.2, -0.25, 0.7, 0.75]);
    close(
      outsideZoneRect(f.finish(), [0, 0, 0], projection(), 1),
      [-0.8, -0.5, 0.7, 0.75],
    );
  });

  it("intersects every portal in multizone chains and does not expose gaps between paths", () => {
    const f = fixture(3);
    f.portal(1, 2, [-0.8, -0.8, -0.3, 0.8]);
    f.portal(1, 2, [0.3, -0.8, 0.8, 0.8]);
    f.portal(2, 0, [-0.2, -0.5, 0.2, 0.5]);
    expect(outsideZoneRect(f.finish(), [0, 0, 0], projection(), 1)).toBeNull();
    f.portal(2, 0, [0.5, -0.9, 0.9, 0.9]);
    close(
      outsideZoneRect(f.finish(), [0, 0, 0], projection(), 1),
      [0.5, -0.8, 0.8, 0.8],
    );
  });

  it("clips portal polygons through the five native planes, including far but excluding near", () => {
    const near = fixture();
    near.portal(1, 0, [-0.5, -0.5, 0.5, 0.5], 0.05);
    const interior = near.finish();
    close(
      outsideZoneRect(interior, [0, 0, 0], projection(0.1), 1),
      [-0.5, -0.5, 0.5, 0.5],
    );
    close(
      outsideZoneRect(interior, [0, 0, 0], projection(10), 1),
      [-0.5, -0.5, 0.5, 0.5],
    );
    const far = fixture();
    far.portal(1, 0, [-0.5, -0.5, 0.5, 0.5], 150);
    expect(
      outsideZoneRect(far.finish(), [0, 0, 0], projection(), 1),
    ).toBeNull();
    const large = fixture();
    large.portal(1, 0, [-2, -2, 2, 2]);
    close(
      outsideZoneRect(large.finish(), [0, 0, 0], projection(), 1),
      [-1, -1, 1, 1],
    );
  });

  it("handles a tilted portal crossing the eye plane without projecting points behind the camera", () => {
    const f = fixture();
    f.portal(1, 0);
    f.interior.points = [
      [-1, -1, -1],
      [1, -1, 0.1],
      [1, 1, 0.1],
      [-1, 1, -1],
    ];
    const length = Math.hypot(-1.1, 0, 2);
    f.interior.normals[0] = [-1.1 / length, 0, 2 / length];
    f.interior.planes[0].distance = 0.9 / length;
    close(
      outsideZoneRect(f.finish(), [0, 0, 0], projection(), 1),
      [-1, -1, 1, 1],
    );
  });

  it("preserves the native far-plane normal under a nonuniform instance transform", () => {
    const f = fixture();
    f.portal(1, 0, [-0.92, -0.02, -0.88, 0.02], 80);
    const localToView = new Matrix4()
      .makeRotationY(Math.PI / 4)
      .multiply(new Matrix4().makeScale(2, 1, 1));
    const inverse = localToView.clone().invert();
    f.interior.points = f.interior.points.map((point) =>
      new Vector3(...point).applyMatrix4(inverse).toArray(),
    );
    const normal = new Vector3(0, 0, 1).transformDirection(
      localToView.clone().transpose(),
    );
    const planeLength = Math.hypot(
      localToView.elements[2],
      localToView.elements[6],
      localToView.elements[10],
    );
    f.interior.normals[0] = normal.toArray();
    f.interior.planes[0].distance = 80 / planeLength;
    // The fan is inside the mathematical world far plane at 80<100.
    // Retail instead normalizes localCam-localFarCenter, which cuts off
    // this off-axis portal sooner after the nonuniform instance scale.
    expect(
      outsideZoneRect(
        f.finish(),
        [0, 0, 0],
        projection().multiply(localToView),
        1,
      ),
    ).toBeNull();
  });

  it("propagates the full input when the camera is on a portal's plane within native tolerance", () => {
    const f = fixture();
    f.portal(1, 0, [-0.2, -0.2, 0.2, 0.2], 10);
    const interior = f.finish();
    // On-plane traversal bypasses fan projection, even if the supplied
    // view faces away. This prevents singular w=0 behavior while crossing.
    const away = projection().multiply(new Matrix4().makeRotationY(Math.PI));
    expect(outsideZoneRect(interior, [0, 0, -10], away, 1)).toEqual([
      -1, -1, 1, 1,
    ]);
    expect(outsideZoneRect(interior, [0, 0, -10.004], away, 1)).toEqual([
      -1, -1, 1, 1,
    ]);
    expect(outsideZoneRect(interior, [0, 0, -10.006], away, 1)).toBeNull();
  });

  it("bounds dense cyclic authored graphs without losing narrower exterior paths", () => {
    const f = fixture(14);
    for (let front = 1; front < 14; front++)
      for (let back = 1; back < 14; back++)
        if (front !== back) f.portal(front, back, [-0.8, -0.8, 0.8, 0.8]);
    f.portal(13, 0, [-0.1, -0.2, 0.3, 0.4]);
    close(
      outsideZoneRect(f.finish(), [0, 0, 0], projection(), 1),
      [-0.1, -0.2, 0.3, 0.4],
    );
  });
});

describe("native exterior viewport pixel bounds", () => {
  it("rounds outward at physical resolution and preserves full viewport bounds", () => {
    expect(roundZoneViewport([-1, -1, 1, 1], 100, 200)).toEqual([
      0, 0, 100, 200,
    ]);
    expect(roundZoneViewport([-0.51, -0.51, 0.51, 0.51], 100, 100)).toEqual([
      24, 24, 76, 76,
    ]);
  });

  it("expands one-pixel spans at the middle and edges, clamping tiny viewports", () => {
    expect(roundZoneViewport([0, 0, 0.001, 0.001], 100, 100)).toEqual([
      49, 49, 52, 52,
    ]);
    expect(roundZoneViewport([-1, -1, -0.999, -0.999], 100, 100)).toEqual([
      0, 0, 3, 3,
    ]);
    expect(roundZoneViewport([0.999, 0.999, 1, 1], 100, 100)).toEqual([
      97, 97, 100, 100,
    ]);
    expect(roundZoneViewport([-1, -1, 1, 1], 1, 1)).toEqual([0, 0, 1, 1]);
  });
});
