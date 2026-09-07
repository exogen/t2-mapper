import { describe, expect, it } from "vitest";
import { Group, Object3D } from "three";
import { collectOwnNodes, findOwnNode } from "./sceneNodes";

function shape(): { root: Group; pilotNozzle: Object3D } {
  const root = new Group();
  const mount = new Object3D();
  mount.name = "mount0";
  const nozzle = new Object3D();
  nozzle.name = "Jetnozzle0";
  root.add(mount, nozzle);
  // A pilot portaled into the seat, with his own jet nozzle.
  const portal = new Group();
  portal.userData.objectMount = true;
  const pilotNozzle = new Object3D();
  pilotNozzle.name = "Jetnozzle0";
  portal.add(pilotNozzle);
  mount.add(portal);
  return { root, pilotNozzle };
}

describe("sceneNodes", () => {
  it("matches node names case insensitively", () => {
    const { root } = shape();
    expect(findOwnNode(root, "Mount0")?.name).toBe("mount0");
    expect(collectOwnNodes(root).get("mount0")?.name).toBe("mount0");
  });

  it("never returns nodes inside mounted content", () => {
    const { root, pilotNozzle } = shape();
    const own = findOwnNode(root, "jetnozzle0");
    expect(own).not.toBe(pilotNozzle);
    expect(own?.parent).toBe(root);
    expect(collectOwnNodes(root).get("jetnozzle0")).toBe(own);
  });
});
