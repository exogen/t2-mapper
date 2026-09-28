import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Texture,
  Vector3,
} from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { createChestDeformation } from "../player/chestDeformation";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import type { ShockLanceEntity } from "../state/gameEntityTypes";
import {
  createTourHighlightMesh,
  removeTourHighlightMeshes,
} from "./commandCircuitTourFlash";
import { createShockLanceView } from "./projectiles/shockLance";

afterEach(() => {
  streamPlaybackStore.setState({ root: null });
  streamClock.time = 0;
});

describe("live mesh overlays", () => {
  it.each([
    ["tour", false],
    ["tour", true],
    ["zap", false],
    ["zap", true],
  ] as const)(
    "keeps %s geometry and morph state current without another update (batched=%s)",
    (kind, batched) => {
      const data = createDTSRigidTestShape();
      data.names[data.objects[0].nameIndex] = "Submesh_torso";
      const shape = buildDTS(data).scene;
      if (batched) batchDTSRigidMeshes(shape);
      const chest = createChestDeformation(shape, "light_female.dts")!;
      const camera = new PerspectiveCamera();
      shape.update(camera);
      const sources: Mesh[] = [];
      shape.traverse((node) => {
        if (node instanceof Mesh) sources.push(node);
      });
      const target = new Group();
      target.name = "target";
      target.add(shape);
      const root = new Group();
      root.add(target);
      root.updateMatrixWorld(true);
      let overlays: Mesh[];
      let dispose: () => void;
      if (kind === "tour") {
        overlays = sources.map((source) => {
          const overlay = createTourHighlightMesh(
            source,
            new MeshBasicMaterial(),
          );
          source.add(overlay);
          return overlay;
        });
        dispose = () => removeTourHighlightMeshes(overlays);
      } else {
        const entity: ShockLanceEntity = {
          id: "zap",
          className: "ShockLanceProjectile",
          renderType: "ShockLance",
          beamStart: [0, 0, 0],
          beamEnd: [1, 0, 0],
          beamHit: true,
          linkTargetId: "target",
          visual: {
            kind: "shockLance",
            numParts: 25,
            zapDuration: 1,
            boltLength: 14,
            lightningFreq: 25,
            lightningDensity: 3,
            lightningAmp: 0.25,
            lightningWidth: 0.05,
            startWidth: [0.3, 0.3],
            endWidth: [0.6, 0.6],
            boltSpeed: [2, -0.5],
            texWrap: [1.5, 1.5],
            textures: [],
          },
        };
        streamPlaybackStore.setState({ root });
        const view = createShockLanceView(entity.visual, [new Texture()], true);
        view.update(entity, camera, 0);
        overlays = view.root.children.at(-1)!.children as Mesh[];
        dispose = () => view.dispose();
      }
      expect(overlays).toHaveLength(sources.length);
      const zero = new Vector3();
      // Changes after matrix/effect updates must be visible before Three builds
      // its render list, including returning to the original non-morph geometry.
      for (const size of [1.025, 3, 0.7, 1, 2, 1]) {
        chest.apply(size, zero, zero);
        shape.update(camera);
        for (let i = 0; i < sources.length; i++) {
          const source = sources[i],
            overlay = overlays[i];
          expect(overlay.geometry).toBe(source.geometry);
          expect(overlay.morphTargetInfluences).toBe(
            source.morphTargetInfluences,
          );
          expect(overlay.morphTargetDictionary).toBe(
            source.morphTargetDictionary,
          );
          expect(overlay.geometry.morphAttributes.position?.length ?? 0).toBe(
            overlay.morphTargetInfluences?.length ?? 0,
          );
          const actual = overlay.getVertexPosition(0, new Vector3());
          expect(
            actual.distanceTo(source.getVertexPosition(0, new Vector3())),
          ).toBeLessThan(1e-6);
        }
      }
      chest.apply(3, zero, zero);
      chest.dispose();
      const disposeShared = vi.fn();
      for (let i = 0; i < sources.length; i++) {
        expect(overlays[i].geometry).toBe(sources[i].geometry);
        expect(overlays[i].morphTargetInfluences).toBeUndefined();
        sources[i].geometry.addEventListener("dispose", disposeShared);
      }
      dispose();
      expect(disposeShared).not.toHaveBeenCalled();
    },
  );
});
