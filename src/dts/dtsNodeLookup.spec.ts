import { describe, expect, it } from "vitest";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { getDTSNodeLookup } from "./dtsNodeLookup";
import { collectOwnNodes, findOwnNode, getMountNode } from "../sceneNodes";
import { createDTSRigidTestShape } from "./dtsTestFixtures";
import type { DTSShape } from "./dtsModel";

function fixture() {
  const data = createDTSRigidTestShape();
  const nameIndex = data.names.push("Mount7") - 1;
  // DFS visits node 3 before node 2; TSShape::findNode chooses index 2.
  data.nodes.push({ nameIndex, parentIndex: 0 }, { nameIndex, parentIndex: 1 });
  data.defaultTranslations = new Float32Array(12);
  data.defaultRotations = new Int16Array(16);
  for (let i = 0; i < 4; i++) data.defaultRotations[i * 4 + 3] = 32767;
  data.subShapes[0].numNodes = 4;
  return data;
}

describe("engine node lookup", () => {
  it("uses name-table and node-table order even when the hierarchy differs", () => {
    const { scene } = buildDTS(fixture());
    scene.getNode(3);
    expect(scene.getNodeByName("MOUNT7")).toBe(scene.getNode(2));
    expect(findOwnNode(scene, "mount7")).toBe(scene.getNode(2));
    expect(collectOwnNodes(scene).get("mount7")).toBe(scene.getNode(2));
    expect(scene.getObjectByName("Mount7")).toBe(scene.getNode(2));
    expect(getMountNode(scene, 7)).toBe(scene.getNode(2));
  });

  it("does not substitute a later duplicate name when the first has no node", () => {
    const data = fixture();
    const first = data.names.push("EmptyName") - 1;
    const later = data.names.push("emptyname") - 1;
    data.nodes[2].nameIndex = later;
    const { scene } = buildDTS(data);
    expect(data.names[first].toLowerCase()).toBe("emptyname");
    expect(findOwnNode(scene, "EMPTYNAME")).toBeNull();
    expect(collectOwnNodes(scene).has("emptyname")).toBe(false);
  });

  it("shares asset lookup tables while returning instance-owned nodes", () => {
    const model = buildDTS(fixture());
    const a = clone(model.scene) as DTSShape,
      b = clone(model.scene) as DTSShape;
    expect(getDTSNodeLookup(a.data)).toBe(getDTSNodeLookup(b.data));
    const node = getMountNode(a, 7);
    expect(getMountNode(a, 7)).toBe(node);
    expect(getMountNode(b, 7)).not.toBe(node);
    expect(getMountNode(a, 5)).toBe(a);
    expect(getMountNode(a, 32)).toBe(a);
    expect(getMountNode(a, -1)).toBe(a);
    a.getNode(0)!.add(b);
    expect(findOwnNode(a, "missing")).toBeNull();
  });

  it("uses AIRepairNode for the last slot, even if mount31 exists", () => {
    const data = fixture();
    data.nodes[2].nameIndex = data.names.push("mount31") - 1;
    data.nodes[3].nameIndex = data.names.push("AIRepairNode") - 1;
    const { scene } = buildDTS(data);
    expect(getMountNode(scene, 31)).toBe(scene.getNode(3));
    const absent = structuredClone(data);
    absent.nodes[3].nameIndex = 0;
    const other = buildDTS(absent).scene;
    expect(getMountNode(other, 31)).toBe(other);
  });
});
