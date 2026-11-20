import { describe, expect, it, vi } from "vitest";
import { Group, Object3D, PerspectiveCamera, Scene, Vector3 } from "three";
import { BlockTypeInfo, type ParsedData } from "t2-demo-parser";
import type { ProjectileShapeLoader } from "../collision/projectileShapeAssets";
import { DTSShape } from "../dts/dtsModel";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { registerEyeNode } from "../engine/eyePositions";
import { FrameScheduler, type FrameContext } from "../engine/frameScheduler";
import type { GameEngine } from "../engine/gameEngine";
import { StreamPlaybackSession } from "../engine/streamPlayback";
import { effectNow, engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { settingsStore } from "../state/settingsStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  createCollisionState,
  runInCollisionWorld,
} from "../world/nodeCollisionContext";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { DemoStreamAdapter, extractMissionInfo } from "./demoStreaming";
import { streamRenderFrame } from "./interpolateEntity";
import { PlaybackClock } from "./PlaybackClock";
import {
  MAX_LOOK_ANGLE,
  PACKED_BODY_YAW_STEP,
  PACKED_HEAD_STEP,
} from "./quantizedPlayerAim";
import {
  CameraMode_OrbitPoint,
  STREAM_TICK_SEC,
  yawPitchToQuaternion,
} from "./streamHelpers";
import { fakeDemoParser, moveBlock, packetBlock } from "./streamTestFixtures";
import type {
  ProjectileLifecycleEvent,
  StreamEntity,
  StreamRecording,
  StreamSnapshot,
} from "./types";

const dataBlocks: [number, string, ParsedData][] = [
  [10, "LinearFlareProjectileData", { explosion: 11 }],
  [11, "ExplosionData", { dtsFileName: "effect_plasma_explosion.dts" }],
  [12, "StaticShapeData", { debrisShapeName: "debris_generic.dts" }],
];

describe("recorded tournament metadata", () => {
  it.each([
    ["1", true],
    ["0", false],
    [undefined, null],
    ["", null],
    ["<BLANK>", null],
    ["true", null],
    ["1garbage", null],
    ["2", null],
  ])("reads only explicit PJ mode flags (%s)", (flag, expected) => {
    const row = ["3", "classic", "Capture the Flag"];
    if (flag !== undefined) row.push(flag as string);
    expect(
      extractMissionInfo(["readplayerinfo", row.join("\t")]).tournamentMode,
    ).toBe(expected);
  });

  it("leaves recordings without PJ metadata unresolved", () => {
    expect(extractMissionInfo([]).tournamentMode).toBeNull();
  });
});

/**
 * A demo with no packets; the packet parser's datablock map is `packetMap`.
 */
function demo(
  initialDataBlocks: Map<number, { className: string; data: ParsedData }>,
  packetMap: Map<number, ParsedData>,
) {
  const parser = fakeDemoParser({
    demoLengthMs: 1000,
    initialBlock: { dataBlocks: initialDataBlocks },
    ghostTracker: { getGhost: () => undefined },
    packetParser: {
      protocolRejected: 0,
      protocolNoDispatch: 0,
      getDataBlockDataMap: () => packetMap,
    },
    bufferedMoveTicks: 0,
  });
  return new DemoStreamAdapter(parser, { checkpoints: false });
}

describe("DemoStreamAdapter.getEffectShapes", () => {
  it("includes datablocks that arrive in packets (from-connect recordings)", () => {
    const packetMap = new Map<number, ParsedData>();
    const stream = demo(new Map(), packetMap);
    expect(stream.getEffectShapes()).toEqual([]);
    for (const [id, , data] of dataBlocks) packetMap.set(id, data);
    expect(stream.getEffectShapes()).toEqual([
      "effect_plasma_explosion.dts",
      "debris_generic.dts",
    ]);
  });

  it("reads initial-block datablocks (mid-match recordings)", () => {
    const initial = new Map(
      dataBlocks.map(([id, className, data]) => [id, { className, data }]),
    );
    // The parser seeds its packet map with the initial block's datablocks.
    const stream = demo(
      initial,
      new Map(dataBlocks.map(([id, , data]) => [id, data])),
    );
    expect(stream.getEffectShapes()).toEqual([
      "effect_plasma_explosion.dts",
      "debris_generic.dts",
    ]);
  });
});

it("commits a projectile tick once and agrees across warm replay, cold seeks, and checkpoint generation", async () => {
  const body = createDTSTestShape();
  body.names[body.nodes[0].nameIndex] = "Mount0";
  body.defaultTranslations.fill(0);
  const weapon = createDTSTestShape();
  weapon.names[weapon.nodes[0].nameIndex] = "Muzzlepoint";
  // The authored muzzle is off the initial packet path, so only its warp
  // passes through the player.
  weapon.defaultTranslations.set([0, 5, 0]);
  const names = { body: "prep-turret.dts", weapon: "prep-weapon.dts" };
  const launch = packetBlock({
    ghosts: [
      {
        index: 4,
        type: "create",
        classId: 1,
        parsedData: {
          dataBlockId: 1,
          sourceObject: 3,
          sourceSlot: 2,
          position: { x: 0, y: 0, z: 100 },
          direction: { x: 1, y: 0, z: 0 },
          currTick: 0,
        },
      },
      {
        index: 3,
        type: "create",
        classId: 2,
        parsedData: {
          dataBlockId: 2,
          position: { x: 0, y: 0, z: 100 },
          images: [{ index: 2, dataBlockId: 4 }],
        },
      },
      {
        index: 5,
        type: "create",
        classId: 3,
        parsedData: { dataBlockId: 3, position: { x: 2.8, y: 4.4, z: 99 } },
      },
    ],
  });
  const recording = (load: ProjectileShapeLoader, readPacket?: () => void) => {
    const blocks = [moveBlock(), launch, moveBlock()];
    const parser = fakeDemoParser({
      blocks,
      decompressedByteLength: blocks.length + 1,
      ghostClasses: (id) => ["LinearProjectile", "Turret", "Player"][id - 1],
      initialBlock: {
        dataBlocks: new Map([
          [
            1,
            {
              className: "LinearProjectileData",
              data: {
                dryVelocity: 100,
                doDynamicClientHits: true,
                explosion: 5,
              },
            },
          ],
          [2, { className: "TurretData", data: { shapeName: names.body } }],
          [
            3,
            {
              className: "PlayerData",
              data: { boxSize: { x: 1, y: 1, z: 2 } },
            },
          ],
          [
            4,
            {
              className: "ShapeBaseImageData",
              data: { shapeName: names.weapon, mountPoint: 0 },
            },
          ],
          [5, { className: "ExplosionData", data: { lifetimeMS: 1000 } }],
        ]),
      },
      onBlock: (block) => {
        if (block === launch) readPacket?.();
      },
    });
    const stream = new DemoStreamAdapter(parser, {
      checkpoints: false,
      playerViews: false,
    });
    stream.setProjectileShapeLoader(load);
    return stream;
  };
  const effects = (snapshot: StreamSnapshot) => ({
    shot: snapshot.entities.find((entity) => entity.ghostIndex === 4)
      ?.hasExploded,
    impacts: snapshot.entities
      .filter((entity) => entity.type === "Explosion")
      .map((entity) => entity.position),
  });
  const ready = (stream: DemoStreamAdapter) =>
    vi.waitFor(() => {
      const snapshot = stream.stepToTime(2 * STREAM_TICK_SEC);
      expect(snapshot.timeSec).toBe(2 * STREAM_TICK_SEC);
      return effects(snapshot);
    });
  const load: ProjectileShapeLoader = (name) =>
    name === names.body ? body : weapon;

  const result = await runInCollisionWorld(createCollisionState(), async () => {
    let finish!: (value: typeof weapon) => void;
    const download = new Promise<typeof weapon>(
      (resolve) => (finish = resolve),
    );
    const loadDelayed = vi.fn((name: string) =>
      name === names.weapon ? download : load(name),
    );
    const readPacket = vi.fn();
    const stream = recording(loadDelayed, readPacket);
    const events = vi.fn<(event: ProjectileLifecycleEvent) => void>();
    stream.subscribeProjectileLifecycle(events);

    const previous = stream.stepToTime(STREAM_TICK_SEC);
    expect(stream.stepToTime(2 * STREAM_TICK_SEC)).toBe(previous);
    expect(stream.getSnapshot()).toBe(previous);
    expect(stream.stepToTime(2 * STREAM_TICK_SEC)).toBe(previous);
    expect(events).not.toHaveBeenCalled();
    expect(readPacket).toHaveBeenCalledTimes(1);
    expect(loadDelayed).toHaveBeenCalledTimes(2);
    expect(loadDelayed).toHaveBeenCalledWith(names.weapon);

    finish(weapon);
    const result = await ready(stream);
    expect(result.shot).toBe(true);
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]?.[0]).toBeCloseTo(2.3);
    expect(result.impacts[0]?.[1]).toBeCloseTo(4.28125);
    expect(events.mock.calls.map(([event]) => event.type)).toEqual([
      "spawn",
      "end",
    ]);
    expect(readPacket).toHaveBeenCalledTimes(1);

    stream.stepToTime(STREAM_TICK_SEC);
    expect(effects(stream.stepToTime(2 * STREAM_TICK_SEC))).toEqual(result);
    expect(loadDelayed).toHaveBeenCalledTimes(2);
    return result;
  });

  await runInCollisionWorld(createCollisionState(), async () => {
    const stream = recording(async (name) => load(name));
    const clock = new PlaybackClock();
    const first = {
      status: "seeking",
      rate: 1,
      seekTime: 2 * STREAM_TICK_SEC,
      seekNonce: 1,
    } as const;
    expect(clock.step(stream, first, 0)).toBeNull();
    const waiting = stream.getSnapshot();
    expect(waiting.timeSec).toBe(0);
    expect(stream.projectileAssetBoundarySec).toBe(STREAM_TICK_SEC);
    expect(effects(waiting)).toEqual({ shot: undefined, impacts: [] });

    const replacement = {
      ...first,
      seekTime: 1.25 * STREAM_TICK_SEC,
      seekNonce: 2,
    };
    expect(clock.step(stream, replacement, 0)).toBeNull();
    expect(stream.getSnapshot().timeSec).toBe(STREAM_TICK_SEC);
    const frame = await vi.waitFor(() => {
      const frame = clock.step(stream, replacement, 0);
      expect(frame).not.toBeNull();
      return frame!;
    });
    expect(frame.previousSnapshot.timeSec).toBe(STREAM_TICK_SEC);
    expect(clock.time).toBe(replacement.seekTime);
    expect(effects(frame.snapshot)).toEqual(result);
  });
  await runInCollisionWorld(createCollisionState(), async () => {
    const stream = recording(async (name) => load(name));
    const checkpoint = await stream.captureCheckpointAt(2, async () => {});
    expect(effects(stream.getSnapshot())).toEqual(result);
    const restored = recording(load);
    restored.setPlayerPredictionEnabled(true);
    restored.importCheckpoints([checkpoint]);
    expect(effects(restored.stepToTime(2 * STREAM_TICK_SEC))).toEqual(result);
  });
});

it("advances effect time with the published world across asset holds and debriefs", () => {
  const stream = demo(new Map(), new Map());
  const initial: StreamSnapshot = {
    ...stream.getSnapshot(),
    camera: null,
    exhausted: false,
    timeSec: 0,
  };
  const step = vi.spyOn(stream, "stepToTime").mockReturnValue(initial);
  const boundary = vi.spyOn(stream, "projectileAssetBoundarySec", "get");
  vi.spyOn(stream, "findSceneReadyTime").mockReturnValue(0);
  const recording: StreamRecording = {
    source: "demo",
    duration: 1,
    missionName: null,
    gameType: null,
    serverDisplayName: null,
    recorderName: null,
    recordingDate: null,
    streamingPlayback: stream,
  };
  const scheduler = new FrameScheduler();
  const engine = {
    scheduler,
    streamSnapshot: { current: null },
    assetsLoading: () => false,
    invalidate: vi.fn(),
  } as unknown as GameEngine;
  engineStore.getState().setRecording(recording);
  engineStore.getState().setPlaybackStatus("playing");
  const session = new StreamPlaybackSession(engine, recording);
  try {
    const camera = new PerspectiveCamera();
    const scene = new Scene();
    const start = effectNow();
    const render = (expectedMS: number, delta = STREAM_TICK_SEC / 2) => {
      scheduler.runAll({
        camera,
        scene,
        delta,
        elapsed: 0,
        frame: 1,
        renderer: {} as FrameContext["renderer"],
      });
      expect(effectNow() - start).toBeCloseTo(expectedMS);
    };
    step.mockReturnValue({ ...initial, timeSec: 0.032 });
    render(16);
    boundary.mockReturnValue(0.032);
    render(16);
    render(16);
    boundary.mockReturnValue(undefined);
    step.mockReturnValue({ ...initial, timeSec: 0.064 });
    render(48);

    step.mockReturnValue({
      ...initial,
      timeSec: 0.064,
      matchEnded: true,
      matchEndedAtSec: 0.056,
    });
    render(56);
    render(56, 0.5);
    step.mockReturnValue({ ...initial, timeSec: 0.608 });
    render(72);
  } finally {
    session.dispose();
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
    vi.restoreAllMocks();
  }
});

it.each([true, false])(
  "orbits a projectile without a visual and drops to free-fly (impact point: %s)",
  (hasImpactPoint) => {
    const stream = demo(new Map(), new Map());
    const projectile: StreamEntity = {
      id: "shot",
      type: "Projectile",
      position: [1, 4, 8],
    };
    const first: StreamSnapshot = {
      ...stream.getSnapshot(),
      camera: null,
      exhausted: false,
      timeSec: 0,
      entities: [projectile],
    };
    const step = vi.spyOn(stream, "stepToTime").mockReturnValue(first);
    vi.spyOn(stream, "findSceneReadyTime").mockReturnValue(0);
    const recording: StreamRecording = {
      source: "demo",
      duration: 1,
      missionName: null,
      gameType: null,
      serverDisplayName: null,
      recorderName: null,
      recordingDate: null,
      streamingPlayback: stream,
    };
    const scheduler = new FrameScheduler();
    const engine = {
      scheduler,
      streamSnapshot: { current: null },
      assetsLoading: () => false,
      invalidate: vi.fn(),
    } as unknown as GameEngine;
    engineStore.getState().setRecording(recording);
    engineStore.getState().setPlaybackStatus("playing");
    const session = new StreamPlaybackSession(engine, recording);
    try {
      const camera = new PerspectiveCamera();
      const scene = new Scene();
      const render = () =>
        scheduler.runAll({
          camera,
          scene,
          delta: STREAM_TICK_SEC / 2,
          elapsed: 0,
          frame: 1,
          renderer: {} as FrameContext["renderer"],
        });
      streamPlaybackStore.setState({
        root: null,
        cameraMode: "orbitOverride",
        orbitOverrideDistance: 4,
        projectileFollow: { kind: "tracking", projectileId: "shot" },
      });
      step.mockReturnValue({
        ...first,
        timeSec: STREAM_TICK_SEC,
        entities: [{ ...projectile, position: [3, 8, 12] }],
      });
      render();
      // Midpoint in Torque space is [2, 6, 10]. The camera pulls back
      // four metres along Three's X axis.
      expect(camera.position.toArray()).toEqual([2, 10, 2]);
      const beforeEnd = camera.quaternion.clone();

      if (hasImpactPoint) {
        streamPlaybackStore.setState({
          projectileFollow: {
            kind: "tracking",
            projectileId: "shot",
            terminalPosition: [3, 10, 14],
          },
        });
      }
      step.mockReturnValue({
        ...first,
        timeSec: STREAM_TICK_SEC * 2,
        entities: hasImpactPoint
          ? [{ ...projectile, position: undefined, hasExploded: true }]
          : [],
      });
      render();
      const finalPosition = hasImpactPoint ? [6, 14, 3] : [2, 10, 2];
      expect(camera.position.toArray()).toEqual(finalPosition);
      expect(camera.quaternion.toArray()).toEqual(beforeEnd.toArray());
      expect(streamPlaybackStore.getState()).toMatchObject({
        cameraMode: "freeFly",
        followEntityId: null,
        projectileFollow: null,
      });
      render();
      expect(camera.position.toArray()).toEqual(finalPosition);
    } finally {
      session.dispose();
      engineStore.getState().setRecording(null);
      gameEntityStore.getState().endStreaming();
      vi.restoreAllMocks();
    }
  },
);

it.each([
  { seat: 1, turretScoped: true, eye: "turret" },
  { seat: 0, turretScoped: true, eye: "cockpit" },
  { seat: 2, turretScoped: true, eye: "rider" },
  { seat: 1, turretScoped: false, eye: "rider" },
])(
  "chooses the first-person eye for seat $seat (turret scoped: $turretScoped) and orbits without a recorded camera",
  ({ seat, turretScoped, eye }) => {
    const stream = demo(new Map(), new Map([[1, { useEyePoint: true }]]));
    const turret: StreamEntity = {
      id: "belly-turret",
      type: "Deployable",
      className: "Turret",
      dataBlockId: 1,
      mountObjectId: "bomber",
      mountNode: 10,
    };
    vi.spyOn(stream, "stepToTime").mockReturnValue({
      ...stream.getSnapshot(),
      camera: null,
      exhausted: false,
      entities: [
        {
          id: "rider",
          type: "Player",
          mountObjectId: "bomber",
          mountNode: seat,
        },
        { id: "bomber", type: "Vehicle", position: [0, 0, 0] },
        { ...turret, id: "other-turret", mountObjectId: "other-vehicle" },
        ...(turretScoped ? [turret] : []),
      ],
    });
    vi.spyOn(stream, "findSceneReadyTime").mockReturnValue(0);
    const recording: StreamRecording = {
      source: "demo",
      duration: 1,
      missionName: null,
      gameType: null,
      serverDisplayName: null,
      recorderName: null,
      recordingDate: null,
      streamingPlayback: stream,
    };
    const scheduler = new FrameScheduler();
    const rider = new Group();
    rider.name = "rider";
    rider.position.set(1, 3, -5);
    rider.rotation.y = -SHAPE_MODEL_ROTATION_Y;
    const engine = {
      scheduler,
      entities: new Map([["rider", { root: rider }]]),
      streamSnapshot: { current: null },
      assetsLoading: () => false,
      invalidate: vi.fn(),
    } as unknown as GameEngine;
    engineStore.getState().setRecording(recording);
    engineStore.getState().setPlaybackStatus("playing");
    const session = new StreamPlaybackSession(engine, recording);

    const root = new Group();
    const bomber = new Group();
    bomber.name = "bomber";
    root.add(bomber);
    bomber.add(rider);
    const register = (
      id: string,
      position: Vector3,
      pitch = 0,
      parent = bomber,
    ) => {
      const shape = new DTSShape();
      shape.data = createDTSTestShape();
      if (id === "rider") shape.rotation.y = SHAPE_MODEL_ROTATION_Y;
      const eyeNode = new Object3D();
      eyeNode.position.copy(position);
      eyeNode.rotation.x = pitch;
      shape.add(eyeNode);
      parent.add(shape);
      return registerEyeNode(id, eyeNode, shape);
    };
    const unregister = [
      register("bomber", new Vector3(0, 2, 4)),
      register("belly-turret", new Vector3(0, -2, 0), Math.PI / 2),
      register("other-turret", new Vector3(9, 9, 9)),
      register("rider", new Vector3(0, 0.5, 0.25), 0, rider),
    ];
    try {
      streamPlaybackStore.setState({
        root,
        cameraMode: "firstPersonOverride",
        followEntityId: "rider",
      });
      const camera = new PerspectiveCamera();
      const scene = new Scene();
      const render = (frame: number) =>
        scheduler.runAll({
          camera,
          scene,
          delta: STREAM_TICK_SEC,
          elapsed: frame * STREAM_TICK_SEC,
          frame,
          renderer: {} as FrameContext["renderer"],
        });
      render(1);
      const expectedPosition = {
        turret: new Vector3(0, -2, 0),
        cockpit: new Vector3(4, 2, 0),
        rider: new Vector3(1, 3.5, -4.75),
      }[eye]!;
      const expectedDirection = {
        turret: new Vector3(0, -1, 0),
        cockpit: new Vector3(1, 0, 0),
        rider: new Vector3(0, 0, 1),
      }[eye]!;
      expect(camera.position.distanceTo(expectedPosition)).toBeLessThan(1e-8);
      expect(streamRenderFrame.firstPersonPlayerId).toBe(
        eye === "rider" ? rider.name : null,
      );
      expect(
        camera.getWorldDirection(new Vector3()).distanceTo(expectedDirection),
      ).toBeLessThan(1e-8);

      streamPlaybackStore.setState({
        cameraMode: "orbitOverride",
        orbitOverrideDistance: 8,
      });
      for (let frame = 2; frame <= 20; frame++) render(frame);
      expect(camera.position.distanceTo(new Vector3(-8, 0, 0))).toBeLessThan(
        1e-8,
      );
    } finally {
      for (const cleanup of unregister) cleanup();
      session.dispose();
      engineStore.getState().setRecording(null);
      gameEntityStore.getState().endStreaming();
      vi.restoreAllMocks();
    }
  },
);

describe("recorded first-person transitions", () => {
  const mode = (firstPerson: boolean) => ({
    type: BlockTypeInfo,
    parsed: { firstPerson, cameraFov: 90 },
  });
  const time = (tick: number) => tick * STREAM_TICK_SEC;
  function recordingCamera(
    blocks: unknown[],
    initialBlock?: NonNullable<
      Parameters<typeof fakeDemoParser>[0]
    >["initialBlock"],
  ) {
    const parser = fakeDemoParser({
      blocks,
      ghostClasses: "Player",
      decompressedByteLength: blocks.length + 1,
      initialBlock: {
        controlObjectData: {
          position: { x: 1, y: 2, z: 3 },
          rotationZ: 0,
          headX: 0,
        },
        ...initialBlock,
      },
    });
    return new DemoStreamAdapter(parser, { checkpoints: false });
  }

  it("starts at the recorded position and reverses at the recorded speed", () => {
    const blocks = [
      moveBlock(),
      mode(false),
      moveBlock(),
      moveBlock(),
      moveBlock(),
      moveBlock(),
      mode(true),
      moveBlock(),
    ];
    const stream = recordingCamera(blocks, { cameraPos: 0.6, cameraSpeed: 5 });
    const blends = [0.6, 0.44, 0.6, 0.76, 0.92, 1, 0.84];
    const snapshots = blends.map((blend, tick) => {
      const camera = stream.stepToTime(time(tick)).camera;
      expect(camera?.controlCameraBlend).toBeCloseTo(blend);
      expect(camera?.previousControlCameraBlend).toBeCloseTo(
        blends[Math.max(0, tick - 1)],
      );
      expect(camera?.mode).toBe(
        tick >= 2 && tick <= 5 ? "third-person" : "first-person",
      );
      return camera;
    });
    expect(snapshots[0]?.controlCameraBlend).toBe(0.6);
  });

  it("restores a partial blend and accepts older checkpoints at their view endpoint", async () => {
    const blocks = [
      moveBlock(),
      mode(false),
      moveBlock(),
      moveBlock(),
      mode(true),
      moveBlock(),
      moveBlock(),
    ];
    const source = recordingCamera(blocks);
    const saved = await source.captureCheckpointAt(2, async () => {});
    const viewer = recordingCamera(blocks);
    viewer.setPlayerPredictionEnabled(true);
    viewer.importCheckpoints([saved]);
    expect(viewer.stepToTime(time(2)).camera?.controlCameraBlend).toBeCloseTo(
      0.32,
    );
    expect(viewer.lastStepStartTimeSec).toBeCloseTo(time(2));
    const reversed = viewer.stepToTime(time(4)).camera;
    expect(reversed?.previousControlCameraBlend).toBeCloseTo(0.64);
    expect(reversed?.controlCameraBlend).toBeCloseTo(0.32);

    const legacy = structuredClone(saved);
    delete legacy.simulation.state.camera?.controlCameraBlend;
    delete legacy.simulation.state.camera?.previousControlCameraBlend;
    viewer.importCheckpoints([legacy]);
    expect(viewer.stepToTime(time(2)).camera?.controlCameraBlend).toBe(1);
    expect(viewer.stepToTime(time(4)).camera?.controlCameraBlend).toBeCloseTo(
      0.68,
    );
  });

  it("pulls the camera in when its control object's datablock requires first person", () => {
    const stream = recordingCamera([moveBlock()], {
      firstPerson: false,
      cameraPos: 0.5,
      controlObjectGhostIndex: 0,
      dataBlocks: new Map([
        [1, { className: "PlayerData", data: { firstPersonOnly: true } }],
      ]),
      initialGhosts: [
        {
          index: 0,
          classId: 1,
          type: "create",
          parsedData: { dataBlockId: 1, position: { x: 1, y: 2, z: 3 } },
        },
      ],
    });
    expect(stream.stepToTime(time(1)).camera?.controlCameraBlend).toBeCloseTo(
      0.18,
    );
  });
});

it("applies recorded turn input to an observer orbit between server packets", () => {
  const move = moveBlock();
  move.parsed.yaw = 0.125;
  move.parsed.pitch = -0.25;
  const stream = new DemoStreamAdapter(
    fakeDemoParser({
      blocks: [move],
      initialBlock: {
        controlObjectData: {
          cameraMode: CameraMode_OrbitPoint,
          position: { x: 0, y: 0, z: 0 },
          orbitPoint: { x: 1, y: 2, z: 3 },
          minOrbitDist: 1,
          maxOrbitDist: 10,
          rotZ: 0.25,
          rotX: 0.5,
        },
      },
    }),
    { checkpoints: false },
  );
  expect(stream.stepToTime(STREAM_TICK_SEC).camera).toMatchObject({
    mode: "third-person",
    orbitPoint: [1, 2, 3],
    orbitDistance: 9,
    yaw: 0.375,
    pitch: 0.25,
  });
});

it("replays a pilot's freelook and release on top of the exact control angles", () => {
  const move = moveBlock();
  const stream = new DemoStreamAdapter(
    fakeDemoParser({
      blocks: [
        {
          ...move,
          parsed: { ...move.parsed, freeLook: true, yaw: 0.25, pitch: -0.25 },
        },
        move,
      ],
      ghostClasses: (id) => (id === 1 ? "Player" : "FlyingVehicle"),
      initialBlock: {
        controlObjectGhostIndex: 0,
        controlObjectData: {
          position: { x: 1, y: 2, z: 3 },
          rotationZ: 0,
          headX: 0.5,
          headZ: 0.125,
          controlObjectGhost: 1,
        },
        initialGhosts: [
          {
            index: 0,
            classId: 1,
            type: "create",
            parsedData: { mountObject: 1, mountNode: 0 },
          },
          { index: 1, classId: 2, type: "create", parsedData: {} },
        ],
      },
    }),
    { checkpoints: false },
  );
  stream.setPlayerPredictionEnabled(true);
  expect(stream.stepToTime(STREAM_TICK_SEC).camera?.controlMountHead).toEqual([
    0.375, 0.25,
  ]);
  expect(
    stream.stepToTime(STREAM_TICK_SEC * 2).camera?.controlMountHead,
  ).toEqual([0.1875, 0.125]);
});

it.each([
  { name: "holds living aim", damageState: undefined, allowWarp: true },
  { name: "cuts to the death pose", damageState: 1, allowWarp: true },
  {
    name: "cuts across death and revival within one tick",
    damageState: 1,
    allowWarp: true,
    revive: true,
  },
  {
    name: "cuts to the no-warp pose",
    damageState: undefined,
    allowWarp: false,
  },
  {
    name: "cuts to the no-warp pose at end of file",
    damageState: undefined,
    allowWarp: false,
    completeAtFrontier: true,
  },
])("$name at the progressive download frontier", (test) => {
  const { damageState, allowWarp, completeAtFrontier, revive } = test;
  const blocks: unknown[] = [moveBlock()];
  const parser = fakeDemoParser({
    blocks,
    ghostClasses: "Player",
    initialBlock: {
      initialGhosts: [
        {
          index: 0,
          classId: 1,
          type: "create",
          parsedData: {
            position: { x: 0, y: 0, z: 0 },
            rotationZ: 0,
            headX: 0,
            headZ: 0,
          },
        },
      ],
    },
  });
  Object.assign(parser, { isComplete: false });
  const stream = new DemoStreamAdapter(parser, { checkpoints: false });
  vi.spyOn(stream, "findSceneReadyTime").mockReturnValue(0);
  const recording: StreamRecording = {
    source: "demo",
    duration: 1,
    missionName: null,
    gameType: null,
    serverDisplayName: null,
    recorderName: null,
    recordingDate: null,
    streamingPlayback: stream,
  };
  const scheduler = new FrameScheduler();
  const streamSnapshot = { current: null as StreamSnapshot | null };
  const engine = {
    scheduler,
    streamSnapshot,
    assetsLoading: () => false,
    invalidate: vi.fn(),
  } as unknown as GameEngine;
  engineStore.getState().setRecording(recording);
  engineStore.getState().setPlaybackStatus("playing");
  const { aimCorrection } = settingsStore.getState();
  settingsStore.setState({ aimCorrection: true });
  const session = new StreamPlaybackSession(engine, recording);
  try {
    const camera = new PerspectiveCamera();
    const scene = new Scene();
    const root = new Group();
    const body = new Group();
    body.name = streamSnapshot.current!.entities[0].id;
    root.add(body);
    streamPlaybackStore.setState({
      root,
      followEntityId: body.name,
      cameraMode: "firstPersonOverride",
    });
    const frame = (delta: number) =>
      scheduler.runAll({
        camera,
        scene,
        delta,
        elapsed: 0,
        frame: 1,
        renderer: {} as FrameContext["renderer"],
      });
    const expectAim = (yaw: number, pitch: number) => {
      const expected = yawPitchToQuaternion(yaw, pitch);
      camera.quaternion.toArray().forEach((component, index) => {
        expect(component).toBeCloseTo(expected[index], 10);
      });
    };
    const expectDeathCamera = () => {
      expectAim(0.5, 0);
      expect(camera.position.x).toBeCloseTo(
        body.position.x - 4 * Math.cos(0.5),
      );
      expect(camera.position.y).toBeCloseTo(body.position.y + 1.15);
      expect(camera.position.z).toBeCloseTo(
        body.position.z - 4 * Math.sin(0.5),
      );
    };
    frame(0.016);
    const first = streamSnapshot.current!;
    const pitchCorrection = (PACKED_HEAD_STEP * MAX_LOOK_ANGLE) / 2;
    const yawCorrection = PACKED_BODY_YAW_STEP / 2 + pitchCorrection;
    expectAim(yawCorrection, pitchCorrection);

    const aimUpdate = {
      index: 0,
      classId: 1,
      type: "update",
      parsedData: {
        rotationZ: 0.5,
        headX: 0.4,
        headZ: 0.1,
        damageState,
        allowWarp,
      },
    };
    const ghosts = [aimUpdate];
    if (revive) {
      ghosts.push({
        ...aimUpdate,
        parsedData: { ...aimUpdate.parsedData, damageState: 0 },
      });
    }
    blocks.push(packetBlock({ ghosts }));
    Object.assign(parser, { decompressedByteLength: 2 });
    frame(0.024);
    expect(streamSnapshot.current!.timeSec).toBe(0.032);
    expect(streamSnapshot.current!.entities[0].headPitch).toBe(0.4);
    if (damageState && !revive) expectDeathCamera();
    else if (damageState || !allowWarp)
      expectAim(0.65 + yawCorrection, 0.6 + pitchCorrection);
    else expectAim(yawCorrection, pitchCorrection);
    vi.mocked(engine.invalidate).mockClear();
    settingsStore.setState({ aimCorrection: false });
    expect(engine.invalidate).toHaveBeenCalledOnce();
    frame(0);
    if (damageState && !revive) expectDeathCamera();
    else expectAim(0.65, 0.6);
    settingsStore.setState({ aimCorrection: true });

    if (completeAtFrontier) {
      Object.assign(parser, { isComplete: true });
      frame(0.016);
      expect(streamSnapshot.current!.timeSec).toBe(0.032);
      expectAim(0.65 + yawCorrection, 0.6 + pitchCorrection);
      return;
    }

    blocks.push(moveBlock());
    Object.assign(parser, { decompressedByteLength: 3 });
    frame(0.016);
    expect(streamSnapshot.current!.timeSec).toBe(0.064);
    expect(
      streamSnapshot.current!.previousPlayerViews!.get(body.name),
    ).toMatchObject({
      rotation: first.entities[0].rotation,
      headPitch: 0,
      headYaw: 0,
    });
    if (damageState && !revive) expectDeathCamera();
    else if (damageState || !allowWarp)
      expectAim(0.65 + yawCorrection, 0.6 + pitchCorrection);
    else expectAim(0.325 + yawCorrection, 0.3 + pitchCorrection);
    expect(first.entities[0].headPitch).toBe(0);
  } finally {
    session.dispose();
    streamPlaybackStore.setState({ root: null });
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
    settingsStore.setState({ aimCorrection });
    vi.restoreAllMocks();
  }
});
