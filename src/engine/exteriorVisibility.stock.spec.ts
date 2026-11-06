import fs from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { Group, PerspectiveCamera, Vector3 } from "three";
import {
  createDIFModel,
  disposeDIFModel,
  type DIFModel,
} from "../dif/difLoader";
import { interiorFromMis } from "../scene/misToScene";
import type { TorqueObject } from "../torqueScript/types";
import { interiorPlacement } from "../world/placement";
import { interiorColliderMeshes } from "../world/colliderPolicy";
import {
  clearWorldColliders,
  registerInteriorCollider,
} from "../collision/worldCollision";
import { exteriorViewRect } from "./exteriorVisibility";

const sbunk2File = new URL(
  "../../docs/base/@vl2/interiors.vl2/interiors/sbunk2.dif",
  import.meta.url,
);
type Point = [number, number, number];
const vector = ([x, y, z]: Point) => new Vector3(y, z, x);

describe.skipIf(!fs.existsSync(sbunk2File))(
  "Katabatic native exterior visibility",
  () => {
    let model: DIFModel;
    let building: Group;

    beforeAll(() => {
      const bytes = fs.readFileSync(sbunk2File);
      model = createDIFModel(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
    });
    beforeEach(() => {
      // Actual MainBase1Buildings sbunk2 instance from Katabatic.mis.
      const scene = interiorFromMis({
        _id: 1,
        _class: "interiorinstance",
        _className: "InteriorInstance",
        interiorfile: "sbunk2.dif",
        position: "347.539 -170.518 93.036",
        rotation: "0 0 1 89.9544",
        scale: "1 1 1",
      } satisfies TorqueObject);
      const placement = interiorPlacement(scene);
      building = new Group();
      building.position.fromArray(placement.position);
      building.quaternion.copy(placement.quaternion);
      building.scale.fromArray(placement.scale);
      registerInteriorCollider(
        "Katabatic:MainBase1",
        interiorColliderMeshes(building, model),
      );
    });
    afterEach(clearWorldColliders);
    afterAll(() => disposeDIFModel(model));

    function cameraAt(
      position: Point,
      target: Point,
      near = 0.1,
    ): PerspectiveCamera {
      const camera = new PerspectiveCamera(90, 16 / 9, near, 500);
      camera.position.copy(vector(position));
      camera.lookAt(vector(target));
      return camera;
    }
    function zone(position: Point): number {
      return model.collision.zoneForPoint(
        building.worldToLocal(vector(position)),
      );
    }

    it("hides snow in the real generator room and lower base hall for every horizontal heading", () => {
      for (const [position, expectedZone] of [
        [[345.283, -197.479, 73.0291], 20],
        [[326.888, -168.521, 76.8106], 5],
      ] as [Point, number][]) {
        expect(zone(position)).toBe(expectedZone);
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ]) {
          const camera = cameraAt(position, [
            position[0] + dx,
            position[1] + dy,
            position[2],
          ]);
          expect(exteriorViewRect(camera)).toBeNull();
        }
      }
    });

    it("shows only the doorway's exterior bounds, and hides them when looking back into the base", () => {
      const position: Point = [347.556210689937, -192.14299315126254, 99.4735];
      const portal: Point = [347.55939417015657, -196.14299188444406, 99.4735];
      expect(zone(position)).toBe(23);
      const rect = exteriorViewRect(cameraAt(position, portal));
      expect(rect).not.toBeNull();
      for (const [index, expected] of [
        -0.580078125, -0.890625, 0.580078125, 0.890625,
      ].entries()) {
        expect(rect![index]).toBeCloseTo(expected, 8);
      }
      const away = position.map(
        (value, index) => 2 * value - portal[index],
      ) as Point;
      expect(exteriorViewRect(cameraAt(position, away))).toBeNull();
      // Retail clips portal fans against far + four side planes, not near.
      expect(exteriorViewRect(cameraAt(position, portal, 10))).toEqual(rect);
    });

    it("leaves the exterior roof view unrestricted", () => {
      const position: Point = [323.373, -173.553, 98.6452];
      expect(zone(position)).toBe(0);
      expect(
        exteriorViewRect(cameraAt(position, [324.373, -173.553, 98.6452])),
      ).toEqual([-1, -1, 1, 1]);
    });

    it("keeps the full view while crossing within the native portal-plane tolerance", () => {
      const position: Point = [347.559392578, -196.140991885, 99.4735];
      expect(zone(position)).toBe(23);
      expect(
        exteriorViewRect(
          cameraAt(position, [347.5625776503761, -200.14299061762557, 99.4735]),
        ),
      ).toEqual([-1, -1, 1, 1]);
    });
  },
);
