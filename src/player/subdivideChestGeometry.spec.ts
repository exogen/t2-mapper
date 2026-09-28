import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { subdivideChestGeometry } from "./subdivideChestGeometry";

describe("chest surface subdivision", () => {
  it("preserves the surface, winding, texture seams, bone ownership and material groups", () => {
    const source = new BufferGeometry();
    // A square with separate texture coordinates along its diagonal seam.
    source.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([
          0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
        ]),
        3,
      ),
    );
    source.setAttribute(
      "uv",
      new BufferAttribute(
        new Float32Array([0, 0, 1, 0, 1, 1, 2, 0, 3, 1, 2, 1]),
        2,
      ),
    );
    source.setAttribute(
      "skinIndex",
      new BufferAttribute(new Uint16Array(24).fill(3), 4),
    );
    source.setAttribute(
      "skinWeight",
      new BufferAttribute(
        new Float32Array(
          Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
        ),
        4,
      ),
    );
    source.setIndex([0, 1, 2, 3, 4, 5]);
    source.addGroup(0, 3, 0);
    source.addGroup(3, 3, 1);
    const { geometry } = subdivideChestGeometry(
      source,
      [{ start: 0, count: 6 }],
      () => true,
      3,
    );
    const positions = geometry.getAttribute("position"),
      uv = geometry.getAttribute("uv");
    const sides = [new Set<string>(), new Set<string>()];
    let area = 0;
    for (const group of geometry.groups) {
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const vertices = [0, 1, 2].map((j) =>
          new Vector3().fromBufferAttribute(
            positions,
            geometry.index!.getX(i + j),
          ),
        );
        const cross = vertices[1]
          .clone()
          .sub(vertices[0])
          .cross(vertices[2].clone().sub(vertices[0]));
        expect(cross.z).toBeGreaterThan(0);
        area += cross.z / 2;
        for (let j = 0; j < 3; j++) {
          const index = geometry.index!.getX(i + j),
            p = vertices[j];
          expect(p.z).toBe(0);
          expect(uv.getX(index)).toBeCloseTo(p.x + group.materialIndex! * 2);
          expect(uv.getY(index)).toBeCloseTo(p.y);
          expect(geometry.getAttribute("skinIndex").getX(index)).toBe(3);
          expect(geometry.getAttribute("skinWeight").getX(index)).toBe(1);
          if (p.x === p.y)
            sides[group.materialIndex!].add(p.toArray().join(","));
        }
      }
    }
    expect(area).toBeCloseTo(1);
    expect(sides[0].size).toBeGreaterThan(2);
    expect(sides[0]).toEqual(sides[1]);
    expect(source.index!.count).toBe(6);
    expect(positions.count).toBeGreaterThan(6);
    expect(geometry.groups.reduce((sum, group) => sum + group.count, 0)).toBe(
      geometry.index!.count,
    );
  });

  it("leaves unrelated parts and short edges untouched", () => {
    const source = new BufferGeometry();
    source.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
    );
    source.setIndex([0, 1, 2]);
    const { geometry } = subdivideChestGeometry(source, [], () => true, 3);
    expect(geometry.index!.array).toEqual(source.index!.array);
    expect(geometry.getAttribute("position").array).toEqual(
      source.getAttribute("position").array,
    );
  });

  it("bounds work before excessive subdivision and leaves the source intact", () => {
    const source = new BufferGeometry();
    source.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0, 0, 100, 0, 0, 0, 100, 0]), 3),
    );
    source.setIndex([0, 1, 2]);
    expect(() =>
      subdivideChestGeometry(source, [{ start: 0, count: 3 }], () => true, 10),
    ).toThrow(/budget/);
    expect(source.getAttribute("position").count).toBe(3);
    expect(source.index!.count).toBe(3);
  });
});
