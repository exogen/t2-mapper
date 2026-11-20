import { expect, it, vi } from "vitest";
import { Group, Quaternion, Vector3 } from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { DTSAnimationTransform } from "../dts/dtsModel";
import { createImageStateAnimation } from "./imageStateAnimation";
import {
  emitImageWeaponEffects,
  imageFlashTransform,
  installImageWeaponEffects,
  queueImageWeaponEffects,
} from "./imageWeaponEffects";
import { FramePriority } from "./framePriority";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import { DebrisHistory } from "../stream/debrisHistory";
import { DebrisSimulation } from "../particles/DebrisSimulation";
import { ImageAnimation } from "../stream/imageAnimation";
import { parseWeaponImageStates } from "../stream/streamHelpers";
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { takeShockwaveRequests } from "./shockwaveRequests";
import { threeToTorque } from "../scene/coordinates";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";

vi.mock("./audioGraph", () => ({ getAudioGraph: () => ({}) }));

it("launches missed render-frame shots as separate casings and baselines after a seek", () => {
  const playback = engineStore.getState().playback;
  engineStore.setState({ playback: { ...playback, status: "playing" } });
  const prevTime = streamClock.time;
  const owner = new Group();
  owner.rotation.y = Math.PI / 2;
  const image = new Group();
  const mount = new Group();
  mount.name = "mount0";
  mount.position.z = 2;
  owner.add(image);
  image.add(mount);
  const state = new ImageAnimation(
    parseWeaponImageStates({
      states: [
        { name: "Ready" },
        { name: "Fire", fire: true, ejectShell: true },
      ],
    })!,
    0,
    0,
  );
  const animation = createImageStateAnimation(
    () => ({
      shapeName: "weapon.dts",
      mountPoint: 0,
      dataBlockId: 1,
      mountedAtSec: 0,
      animation: state.current,
    }),
    {
      actions: new Map(),
      imageRoot: image,
      seqIndexToName: [],
      cyclicSequences: new Set(),
    },
  );
  const flags = {
    dataBlockId: 1,
    loaded: true,
    ammo: true,
    target: false,
    wet: false,
    triggerDown: true,
    fireCount: 0,
  };
  try {
    streamClock.time = 0;
    state.advance(0, flags);
    expect(animation.update()).toBeUndefined();
    state.advance(0.032, { ...flags, fireCount: 1 });
    state.advance(0.064, { ...flags, fireCount: 2 });
    streamClock.time = 0.064;
    const shots = animation.update();
    expect(shots).toEqual({ dataBlockId: 1, shellCount: 2, shockwave: false });
    expect(animation.update()).toBeUndefined();

    const history = new DebrisHistory();
    const blocks: Record<number, Record<string, unknown>> = {
      1: { casing: 2, shellExitDir: { x: 1, y: 0, z: 0 }, shellVelocity: 3 },
      2: {
        shapeName: "casing.dts",
        lifetime: 3,
        numBounces: 3,
        velocity: 40,
        fade: true,
        useRadiusMass: false,
        baseRadius: 1,
      },
    };
    const getDataBlockData = (id: number) => blocks[id];
    emitImageWeaponEffects(
      { getDataBlockData, debrisHistory: history },
      shots!,
      image,
      owner,
      { timeSec: 0.064, gravity: -9.81 },
    );
    image.removeFromParent();
    emitImageWeaponEffects(
      { getDataBlockData, debrisHistory: history },
      shots!,
      image,
      owner,
      { timeSec: 0.064, gravity: -9.81 },
    );
    expect(history.events).toHaveLength(2);
    const sim = new DebrisSimulation(
      getDataBlockData,
      () => [],
      () => null,
    );
    sim.update(0.064, history.events);
    expect(sim.bodies.size).toBe(2);
    for (const body of sim.bodies.values()) {
      expect(body.shape).toBe("casing.dts");
      expect(body.position[1]).toBeCloseTo(2);
      expect(body.velocity[1]).toBeCloseTo(3);
      expect(body.bounces).toBe(3);
      expect(body.data.fade).toBe(true);
      expect(body.radius).toBeCloseTo(0.2);
    }

    engineStore.setState({
      playback: {
        ...playback,
        status: "playing",
        seekNonce: playback.seekNonce + 1,
      },
    });
    state.advance(0.096, { ...flags, fireCount: 3 });
    expect(animation.update()).toBeUndefined();
    state.advance(0.128, { ...flags, fireCount: 4 });
    expect(animation.update()).toEqual({
      dataBlockId: 1,
      shellCount: 1,
      shockwave: false,
    });
  } finally {
    engineStore.setState({ playback });
    streamClock.time = prevTime;
    animation.dispose();
  }
});

it("emits initial mount effects once and suppresses them on the frame that completes a seek", () => {
  const previousPlayback = engineStore.getState().playback;
  const previousTime = streamClock.time;
  const previousReconstruction = streamRenderFrame.reconstructing;
  const state = new ImageAnimation(
    parseWeaponImageStates({
      states: [
        { name: "Ready" },
        { name: "Fire", fire: true, ejectShell: true, shockwave: true },
      ],
    })!,
    10,
    0,
  );
  state.advance(
    10,
    {
      dataBlockId: 1,
      fireCount: 0,
      loaded: true,
      ammo: true,
      target: false,
      wet: false,
      triggerDown: true,
    },
    true,
  );
  const mount = () =>
    createImageStateAnimation(
      () => ({
        shapeName: "weapon.dts",
        mountPoint: 0,
        dataBlockId: 1,
        mountedAtSec: 10,
        animation: state.current,
      }),
      {
        actions: new Map(),
        imageRoot: new Group(),
        seqIndexToName: [],
        cyclicSequences: new Set(),
      },
    );
  try {
    engineStore.setState({
      playback: { ...previousPlayback, status: "playing" },
    });
    streamClock.time = 10;
    streamRenderFrame.reconstructing = false;
    const live = mount();
    expect(live.update()).toEqual({
      dataBlockId: 1,
      shellCount: 1,
      shockwave: true,
    });
    expect(live.update()).toBeUndefined();
    live.dispose();

    const seek = mount();
    streamRenderFrame.reconstructing = true;
    expect(seek.update()).toBeUndefined();
    streamRenderFrame.reconstructing = false;
    expect(seek.update()).toBeUndefined();
    seek.dispose();
  } finally {
    engineStore.setState({ playback: previousPlayback });
    streamClock.time = previousTime;
    streamRenderFrame.reconstructing = previousReconstruction;
  }
});

it("uses the current muzzle flash datablock when a mission reuses an image ID", () => {
  const owner = new Group();
  const image = new Group();
  owner.name = "player";
  owner.add(image);
  let muzzleFlash = 3;
  const stream = { getDataBlockData: () => ({ muzzleFlash }) };
  const effects = { dataBlockId: 1, shellCount: 0, shockwave: true };
  const snapshot = { timeSec: 0, gravity: -9.81 };
  emitImageWeaponEffects(stream, effects, image, owner, snapshot);
  muzzleFlash = 4;
  emitImageWeaponEffects(stream, effects, image, owner, snapshot);
  expect(takeShockwaveRequests().map((request) => request.dataBlockId)).toEqual(
    [3, 4],
  );
});

it("samples a frozen weapon mount after the owner's animation, before debris", () => {
  const arm = new DTSAnimationTransform();
  const image = new Group();
  image.matrixAutoUpdate = false;
  const mount = new Group();
  mount.name = "mount0";
  mount.position.z = 1;
  arm.add(image);
  image.add(mount);
  arm.updateMatrixWorld(true);

  const scheduler = new FrameScheduler();
  const stop = installImageWeaponEffects(scheduler);
  scheduler.add(FramePriority.ShapeAnimation, () => {
    queueImageWeaponEffects(
      scheduler,
      { getDataBlockData: () => ({ muzzleFlash: 2 }) },
      { dataBlockId: 1, shellCount: 0, shockwave: true },
      image,
      arm,
      { timeSec: 0, gravity: -9.81 },
    );
  });
  scheduler.add(FramePriority.ShapeAnimation, () => {
    arm.position.x = 2;
    arm.rotation.y = Math.PI / 2;
    arm.matrixWorldNeedsUpdate = true;
  });
  scheduler.add(FramePriority.Debris, () => {
    const requests = takeShockwaveRequests();
    expect(requests).toHaveLength(1);
    expect(
      new Vector3(...requests[0].origin).distanceTo(new Vector3(0, 3, 0)),
    ).toBeLessThan(1e-8);
    expect(
      new Vector3(...requests[0].normal).distanceTo(new Vector3(0, 1, 0)),
    ).toBeLessThan(1e-8);
  });
  try {
    scheduler.runAll({} as FrameContext);
  } finally {
    stop();
    takeShockwaveRequests();
  }
});

it("ejects a casing in the tilted passenger's body frame", () => {
  const vehicle = new Group();
  vehicle.rotation.set(0.3, 0.5, -0.6);
  const rider = new Group();
  vehicle.add(rider);
  const pose = new Group();
  pose.rotation.y = 0.9;
  rider.add(pose);
  const basis = new Group();
  basis.rotation.y = SHAPE_MODEL_ROTATION_Y;
  pose.add(basis);
  const { scene: riderModel } = buildDTS(createDTSTestShape());
  basis.add(riderModel);
  const image = new Group();
  riderModel.add(image);

  const history = new DebrisHistory();
  const getDataBlockData = (id: number) =>
    id === 1
      ? { casing: 2, shellExitDir: { x: 1, y: 0, z: 0 }, shellVelocity: 3 }
      : { lifetime: 3 };
  emitImageWeaponEffects(
    { getDataBlockData, debrisHistory: history },
    { dataBlockId: 1, shellCount: 1, shockwave: false },
    image,
    rider,
    { timeSec: 0, gravity: -9.81 },
  );
  const shell = history.events[0];
  if (shell?.kind !== "shell" || !shell.velocity)
    throw new Error("Expected a casing with launch velocity");
  const expected = vehicle.quaternion.clone().multiply(pose.quaternion);
  const launch = new Vector3(0, 0, 3).applyQuaternion(expected);
  expect(
    new Vector3(...shell.velocity).distanceTo(
      new Vector3(...threeToTorque(launch)),
    ),
  ).toBeLessThan(1e-8);
  expect(new Quaternion(...shell.rotation).angleTo(expected)).toBeLessThan(
    1e-7,
  );
});

it.each([true, false])(
  "orients image flash along native +Y with mount0 present=%s",
  (hasMount) => {
    const data = createDTSTestShape();
    // Unreferenced by geometry or animation, so the named node is lazy.
    data.nodes.push({
      ...data.nodes[0],
      nameIndex: data.names.push(hasMount ? "Mount0" : "Unused") - 1,
      parentIndex: -1,
    });
    data.defaultTranslations = new Float32Array([
      ...data.defaultTranslations,
      2,
      3,
      4,
    ]);
    data.defaultRotations = new Int16Array([
      ...data.defaultRotations,
      0,
      0,
      -23170,
      23170,
    ]);
    const { scene } = buildDTS(data);
    const parent = new Group();
    parent.add(scene);
    parent.position.set(10, 20, 30);
    const position = new Vector3(),
      direction = new Vector3();
    // A mounted child's similarly named node must not be selected.
    const child = new Group();
    child.userData.imageMount = true;
    const decoy = new Group();
    decoy.name = "mount0";
    child.add(decoy);
    scene.add(child);
    for (const yaw of [0, 0.7, -1]) {
      parent.rotation.y = yaw;
      imageFlashTransform(scene, position, direction);
      // Native +Y rotated +90 degrees about Z is -X, converted to model +X.
      const expectedDir = new Vector3(
        ...(hasMount ? [1, 0, 0] : [0, 0, 1]),
      ).applyEuler(parent.rotation);
      const expectedPos = new Vector3(...(hasMount ? [-2, 4, 3] : [0, 0, 0]))
        .applyEuler(parent.rotation)
        .add(parent.position);
      expect(direction.distanceTo(expectedDir)).toBeLessThan(1e-8);
      expect(position.distanceTo(expectedPos)).toBeLessThan(1e-8);
    }
  },
);
