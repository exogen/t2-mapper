import fs from "node:fs/promises";
import { expect, it } from "vitest";
import { Group, Matrix4, Quaternion, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { DTSLoader } from "../dts/dtsLoader";
import { parseDSQ } from "../dts/dsq";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import {
  DTSSequenceFlags,
  type DTSSequence,
  type DTSShapeData,
} from "../dts/dtsTypes";
import {
  EmitterInstance,
  resolveEmitterData,
} from "../particles/ParticleSystem";
import {
  createParticleGeometry,
  syncBuffers,
} from "../particles/particleRenderer";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { readNodeEmitterTransform } from "./nodeEmitters";

const players = [
  "light_male",
  "light_female",
  "medium_male",
  "medium_female",
  "heavy_male",
  "bioderm_light",
  "bioderm_medium",
  "bioderm_heavy",
];
const vehicles = [
  "vehicle_air_scout",
  "vehicle_air_bomber",
  "vehicle_air_hapc",
  "vehicle_grav_scout",
  "vehicle_grav_tank",
];

async function readShapeFile(name: string) {
  const bytes = await fs.readFile(`docs/base/@vl2/shapes.vl2/shapes/${name}`);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

// Independent reference: compose raw DTS/DSQ transforms in Torque coordinates,
// then read column 1 of renderTransform * nodeTransform, as all three engine
// paths do (Player 0x005d65e0, FlyingVehicle 0x006112d0, HoverVehicle 0x006192a0).
function nativeMatrix(
  data: DTSShapeData,
  index: number,
  sequence?: DTSSequence,
  frame = 0,
): Matrix4 {
  const rotation = new Quaternion()
    .fromArray(data.defaultRotations, index * 4)
    .normalize()
    .invert();
  const position = new Vector3().fromArray(data.defaultTranslations, index * 3);
  if (sequence) {
    const n = sequence.numKeyframes;
    const first = Math.floor(frame);
    const next = (first + 1) % n;
    const alpha = frame - first;
    const rotationRank = sequence.rotationMatters.indexOf(index);
    if (rotationRank >= 0) {
      const at = (k: number) =>
        new Quaternion()
          .fromArray(
            data.rotations,
            (sequence.baseRotation + rotationRank * n + k) * 4,
          )
          .normalize()
          .invert();
      rotation.copy(at(first)).slerp(at(next), alpha);
    }
    const translationRank = sequence.translationMatters.indexOf(index);
    if (translationRank >= 0) {
      const at = (k: number) =>
        new Vector3().fromArray(
          data.translations,
          (sequence.baseTranslation + translationRank * n + k) * 3,
        );
      position.copy(at(first)).lerp(at(next), alpha);
    }
  }
  const matrix = new Matrix4().compose(
    position,
    rotation,
    new Vector3(1, 1, 1),
  );
  const parentIndex = data.nodes[index].parentIndex;
  return parentIndex < 0
    ? matrix
    : nativeMatrix(data, parentIndex, sequence, frame).multiply(matrix);
}

it.each([...players, ...vehicles])(
  "uses native nozzle/contrail axes in %s, including parent motion",
  async (name) => {
    const model = new DTSLoader().parse(await readShapeFile(`${name}.dts`));
    const data = model.data;
    const scene = clone(model.scene) as typeof model.scene;
    scene.rotation.y = SHAPE_MODEL_ROTATION_Y;
    const parent = new Group();
    parent.add(scene);
    parent.position.set(10, 20, 30);
    parent.scale.setScalar(2);
    const origin: [number, number, number] = [0, 0, 0],
      axis: [number, number, number] = [0, 0, 0];
    let tested = 0;
    for (const [index, node] of data.nodes.entries()) {
      const nodeName = data.names[node.nameIndex];
      if (!/^(jetnozzle|contrail)\d+$/i.test(nodeName)) continue;
      const anchor = scene.getNodeByName(nodeName)!;
      const native = nativeMatrix(data, index);
      const nativeOrigin = new Vector3().setFromMatrixPosition(native);
      const nativeAxis = new Vector3(0, 1, 0).transformDirection(native);
      for (const [pitch, yaw, roll] of [
        [0, 0, 0],
        [0.4, 0.7, -0.3],
        [-1, -1, 0.8],
      ]) {
        parent.rotation.set(pitch, yaw, roll);
        readNodeEmitterTransform(anchor, origin, axis);
        const expectedOrigin = new Vector3(
          nativeOrigin.y,
          nativeOrigin.z,
          nativeOrigin.x,
        ).applyMatrix4(parent.matrixWorld);
        const expectedAxis = new Vector3(
          nativeAxis.y,
          nativeAxis.z,
          nativeAxis.x,
        ).transformDirection(parent.matrixWorld);
        expect(
          new Vector3(origin[1], origin[2], origin[0]).distanceTo(
            expectedOrigin,
          ),
        ).toBeLessThan(1e-6);
        expect(
          new Vector3(axis[1], axis[2], axis[0]).distanceTo(expectedAxis),
        ).toBeLessThan(1e-6);
      }
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  },
);

it.each(players)(
  "follows animated DSQ nozzle transforms in %s without a render traversal",
  async (name) => {
    const sources = await Promise.all(
      ["root", "jet", "forward"].map(async (sequence) => ({
        name: sequence,
        data: parseDSQ(await readShapeFile(`${name}_${sequence}.dsq`)),
      })),
    );
    const model = new DTSLoader().parse(
      await readShapeFile(`${name}.dts`),
      sources,
    );
    const scene = clone(model.scene) as typeof model.scene;
    const parent = new Group();
    parent.position.set(10, 20, 30);
    parent.rotation.set(0.4, -0.7, 0.3);
    const basis = new Group();
    basis.rotation.y = SHAPE_MODEL_ROTATION_Y;
    parent.add(basis);
    basis.add(scene);
    const mixer = new DTSAnimationMixer(scene);
    const data = model.data;
    const nozzles = data.nodes.flatMap((node, index) =>
      /^jetnozzle\d+$/i.test(data.names[node.nameIndex]) ? [index] : [],
    );
    expect(nozzles.length).toBeGreaterThan(0);
    const origin: [number, number, number] = [0, 0, 0];
    const axis: [number, number, number] = [0, 0, 0];
    for (const source of sources) {
      const clip = model.animations.find((c) => c.name === source.name)!;
      const sequence = data.sequences.find(
        (s) => data.names[s.nameIndex] === source.name,
      )!;
      // These are absolute body poses; blend/scale semantics are tested elsewhere.
      expect(sequence.flags & DTSSequenceFlags.Blend).toBe(0);
      expect(sequence.scaleMatters).toHaveLength(0);
      mixer.stopAllAction();
      const action = mixer.clipAction(clip).play();
      action.paused = true;
      for (const fraction of [0, 0.275, 0.725]) {
        action.time = fraction * clip.duration;
        mixer.update(0);
        const frame =
          fraction *
          (sequence.flags & DTSSequenceFlags.Cyclic
            ? sequence.numKeyframes
            : sequence.numKeyframes - 1);
        for (const index of nozzles) {
          const native = nativeMatrix(data, index, sequence, frame);
          const p = new Vector3().setFromMatrixPosition(native);
          const a = new Vector3(0, 1, 0).transformDirection(native);
          // The emitter query itself must refresh the dirty animated ancestors.
          readNodeEmitterTransform(scene.getNode(index)!, origin, axis);
          const expectedPosition = new Vector3(p.y, p.z, p.x).applyMatrix4(
            parent.matrixWorld,
          );
          const expectedAxis = new Vector3(a.y, a.z, a.x).transformDirection(
            parent.matrixWorld,
          );
          expect(
            new Vector3(origin[1], origin[2], origin[0]).distanceTo(
              expectedPosition,
            ),
          ).toBeLessThan(1e-5);
          expect(
            new Vector3(axis[1], axis[2], axis[0]).distanceTo(expectedAxis),
          ).toBeLessThan(1e-5);
        }
      }
    }
    mixer.stopAllAction();
  },
);

it.each(["Jetnozzle0", "Jetnozzle2", "Contrail0"])(
  "preserves %s direction through particle emission and GPU buffers",
  async (nodeName) => {
    const { scene } = new DTSLoader().parse(
      await readShapeFile("vehicle_air_scout.dts"),
    );
    scene.rotation.y = SHAPE_MODEL_ROTATION_Y;
    const parent = new Group();
    parent.rotation.set(0.4, 0.7, -0.3);
    parent.add(scene);
    const origin: [number, number, number] = [0, 0, 0];
    const axis: [number, number, number] = [0, 0, 0];
    readNodeEmitterTransform(scene.getNodeByName(nodeName)!, origin, axis);
    // Stock shrike rear nozzle and contrail point backward (-Torque Y);
    // the belly nozzle points down (-Torque Z).
    const expected = (
      nodeName === "Jetnozzle2" ? new Vector3(0, -1, 0) : new Vector3(-1, 0, 0)
    ).transformDirection(parent.matrixWorld);
    const data = resolveEmitterData(
      {
        particles: [1],
        ejectionVelocity: 2000,
        velocityVariance: 0,
        ejectionPeriodMS: 10,
        thetaMax: 0,
        orientOnVelocity: false,
      },
      () => ({ inheritedVelFactor: 0.2, windCoefficient: 0 }),
    )!;
    const emitter = new EmitterInstance(data);
    const velocity: [number, number, number] = [3, 4, 5];
    emitter.emitPeriodic(origin, origin, 10, axis, velocity);
    expect(emitter.particles).toHaveLength(1);
    const particle = emitter.particles[0];
    const expectedVelocity = expected
      .clone()
      .multiplyScalar(20)
      .add(new Vector3(4, 5, 3).multiplyScalar(0.2));
    expect(
      new Vector3(particle.vel[1], particle.vel[2], particle.vel[0]).distanceTo(
        expectedVelocity,
      ),
    ).toBeLessThan(1e-6);
    emitter.update(10);
    const geometry = createParticleGeometry(1);
    syncBuffers({ emitter, geometry });
    const expectedPosition = new Vector3(
      origin[1],
      origin[2],
      origin[0],
    ).addScaledVector(expectedVelocity, 0.01);
    expect(
      new Vector3()
        .fromBufferAttribute(geometry.getAttribute("position"), 0)
        .distanceTo(expectedPosition),
    ).toBeLessThan(1e-5);
    expect(
      new Vector3()
        .fromBufferAttribute(geometry.getAttribute("orientDir"), 0)
        .distanceTo(expected),
    ).toBeLessThan(1e-6);
    geometry.dispose();
  },
);
