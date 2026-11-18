import { describe, expect, it, vi } from "vitest";
import { Group, PerspectiveCamera, Scene } from "three";
import type { ParsedData } from "t2-demo-parser";
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
import { yawPitchToQuaternion } from "./streamHelpers";
import { fakeDemoParser, moveBlock, packetBlock } from "./streamTestFixtures";
import type { StreamRecording, StreamSnapshot } from "./types";

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
    if (damageState || !allowWarp)
      expectAim(0.65 + yawCorrection, 0.6 + pitchCorrection);
    else expectAim(yawCorrection, pitchCorrection);
    vi.mocked(engine.invalidate).mockClear();
    settingsStore.setState({ aimCorrection: false });
    expect(engine.invalidate).toHaveBeenCalledOnce();
    frame(0);
    expectAim(0.65, 0.6);
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
    if (damageState || !allowWarp)
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
