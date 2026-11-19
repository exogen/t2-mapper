import { describe, expect, it, vi } from "vitest";
import { Group, PerspectiveCamera, Scene } from "three";
import { BlockTypeInfo, type ParsedData } from "t2-demo-parser";
import { FrameScheduler, type FrameContext } from "../engine/frameScheduler";
import type { GameEngine } from "../engine/gameEngine";
import { StreamPlaybackSession } from "../engine/streamPlayback";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { settingsStore } from "../state/settingsStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { DemoStreamAdapter, extractMissionInfo } from "./demoStreaming";
import {
  MAX_LOOK_ANGLE,
  PACKED_BODY_YAW_STEP,
  PACKED_HEAD_STEP,
} from "./quantizedPlayerAim";
import { STREAM_TICK_SEC, yawPitchToQuaternion } from "./streamHelpers";
import { fakeDemoParser, moveBlock, packetBlock } from "./streamTestFixtures";
import type { StreamEntity, StreamRecording, StreamSnapshot } from "./types";

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
