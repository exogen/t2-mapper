import { expect, it } from "vitest";
import { prepareProjectileShapes } from "../collision/projectileShapeAssets";
import {
  createCollisionState,
  runInCollisionWorld,
} from "../world/nodeCollisionContext";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { DemoStreamAdapter } from "./demoStreaming";
import { GhostMessage } from "./entityClassification";
import {
  fakeDemoParser,
  moveBlock,
  packetBlock,
  TestLiveStream,
} from "./streamTestFixtures";
import { STREAM_TICK_SEC } from "./streamHelpers";

const point = { x: 4, y: 5, z: 100 };
const dispatched = { ghostSectionStart: 64 };

it("reads both sides of lock warnings only from dispatched live packets", () => {
  const stream = new TestLiveStream("play");
  expect(stream.getSnapshot().missileLock).toBeUndefined();

  stream.feedDecoded({
    ...dispatched,
    gameState: {
      selfLocked: true,
      seekerTracking: true,
      seekerTrackingPos: point,
      seekerMode: 0,
    },
  });
  const tracking = {
    selfLocked: true,
    selfHomed: false,
    outgoing: { kind: "tracking", position: [4, 5, 100] },
  };
  expect(stream.getSnapshot().missileLock).toEqual(tracking);

  stream.feedDecoded({}, "noDispatch");
  stream.feedDecoded({}, "rejected");
  expect(stream.getSnapshot().missileLock).toEqual(tracking);

  stream.feedDecoded({
    ...dispatched,
    gameState: { selfHomed: true, seekerMode: 2, targetPos: point },
  });
  expect(stream.getSnapshot().missileLock).toEqual({
    selfLocked: false,
    selfHomed: true,
    outgoing: { kind: "position", position: [4, 5, 100] },
  });

  stream.feedDecoded(dispatched);
  expect(stream.getSnapshot().missileLock).toEqual({
    selfLocked: false,
    selfHomed: false,
  });
});

it("keeps a recorded demo lock across payload-less packets and binds only scoped lifetimes", () => {
  const stream = new DemoStreamAdapter(
    fakeDemoParser({
      ghostClasses: "Player",
      blocks: [
        packetBlock({
          ...dispatched,
          gameState: { seekerMode: 1, seekerObjectGhostIndex: 3 },
          ghosts: [
            {
              type: "create",
              index: 3,
              classId: 1,
              parsedData: { position: point },
            },
          ],
        }),
        packetBlock(),
        moveBlock(),
        packetBlock({
          ...dispatched,
          gameState: { seekerMode: 1, seekerObjectGhostIndex: 3 },
        }),
        moveBlock(),
        packetBlock({
          ...dispatched,
          gameState: { seekerMode: 1, seekerObjectGhostIndex: 3 },
          ghosts: [
            { type: "delete", index: 3 },
            {
              type: "create",
              index: 3,
              classId: 1,
              parsedData: { position: point },
            },
          ],
        }),
        moveBlock(),
      ],
    }),
    { checkpoints: false },
  );
  const first = stream.stepToTime(STREAM_TICK_SEC);
  expect(first.missileLock?.outgoing).toEqual({ kind: "object" });
  const locked = stream.stepToTime(2 * STREAM_TICK_SEC);
  expect(locked.missileLock?.outgoing).toEqual({
    kind: "object",
    targetId: locked.entities[0].id,
  });
  const unscoped = stream.stepToTime(3 * STREAM_TICK_SEC);
  expect(unscoped.entities[0].id).not.toBe(locked.entities[0].id);
  expect(unscoped.missileLock?.outgoing).toEqual({ kind: "object" });
});

it("remaps a lock target's lifetime on checkpoint restore", () => {
  const stream = new TestLiveStream("play", "Player");
  stream.createGhost(0, 1, { position: point });
  stream.feedDecoded({
    ...dispatched,
    gameState: { seekerMode: 1, seekerObjectGhostIndex: 0 },
  });
  const before = stream.getSnapshot();
  stream.roundTripCheckpoint();
  const restored = stream.stepToTime(STREAM_TICK_SEC);
  expect(restored.entities[0].id).not.toBe(before.entities[0].id);
  expect(restored.missileLock?.outgoing).toEqual({
    kind: "object",
    targetId: restored.entities[0].id,
  });

  const old = stream.checkpoint();
  delete old.state.latestControl.missileLock;
  stream.restore(old);
  expect(stream.stepToTime(2 * STREAM_TICK_SEC).missileLock).toBeUndefined();
});

it("only estimates a remote lock while the packet flag, heat, aim, and dwell agree", () =>
  runInCollisionWorld(createCollisionState(), () => {
    const data = new Map<number, Record<string, unknown>>([
      [
        1,
        {
          shapeName: "lock-body.dts",
          boxSize: { x: 1, y: 1, z: 2 },
          heatIncreasePerSec: 1 / 3,
          heatDecayPerSec: 0.25,
        },
      ],
      [
        2,
        {
          shapeName: "lock-launcher.dts",
          isSeeker: true,
          seekerRadius: 400,
          maxSeekAngle: 8,
          seekerLockTime: 0.5,
          seekerFreeTime: 0.7,
          maxLockRange: 40,
          isTargetLockRequired: true,
          projectile: 3,
        },
      ],
      [3, { maxVelocity: 80, lifetimeMS: 6000 }],
      [
        4,
        {
          shapeName: "lock-body.dts",
          boxSize: { x: 1, y: 1, z: 2 },
          heatIncreasePerSec: 0,
          heatDecayPerSec: 0.25,
        },
      ],
    ]);
    class SeekerTestStream extends TestLiveStream {
      override getDataBlockData(id: number) {
        return data.get(id);
      }
    }
    const stream = new SeekerTestStream("watch", "Player");
    const body = createDTSTestShape();
    body.names[body.nodes[0].nameIndex] = "Mount0";
    body.defaultTranslations.fill(0);
    const weapon = createDTSTestShape();
    weapon.names[weapon.nodes[0].nameIndex] = "Muzzlepoint";
    weapon.defaultTranslations.fill(0);
    const load = (name: string) => (name === "lock-body.dts" ? body : weapon);
    stream.setProjectileShapeLoader(load);
    prepareProjectileShapes(["lock-body.dts", "lock-launcher.dts"], load);
    stream.setMissileLockInferenceEnabled(true);
    stream.event({
      type: "GhostingMessageEvent",
      message: GhostMessage.GhostAlwaysDone,
    });

    const player = (id: string, ghostIndex: number, sensorGroup: number) => {
      stream.addEntity({
        id,
        ghostIndex,
        sensorGroup,
        type: "Player",
        className: "Player",
      });
      stream.updateGhost(ghostIndex, { dataBlockId: 1 });
    };
    player("shooter", 3, 1);
    player("victim", 4, 2);

    const image = (target: boolean) =>
      stream.updateGhost(3, { images: [{ index: 0, dataBlockId: 2, target }] });
    const angles = { rotationZ: 0, headX: -1 / 63, headZ: -1 / 63 };
    let tick = 0;
    const advance = (turn = 0, observeVictim = true) => {
      stream.updateGhost(3, {
        ...angles,
        position: point,
        moveFlag1: false,
        rotationZ: turn,
      });
      if (observeVictim)
        stream.updateGhost(4, {
          ...angles,
          position: { ...point, y: 105 },
          moveFlag1: true,
        });
      return stream.stepToTime(++tick * STREAM_TICK_SEC).inferredMissileLocks;
    };

    // A hot target in scope alone says nothing about the launcher's state.
    for (let i = 0; i < 110; i++) expect(advance()).toBeUndefined();
    image(true);
    for (let i = 0; i < 15; i++) expect(advance()).toBeUndefined();
    expect(advance()).toEqual([
      { shooterId: "shooter", targetId: "victim", warnTarget: true },
    ]);
    expect(advance(Math.PI)).toBeUndefined();
    for (let i = 0; i < 16; i++) advance();
    expect(advance()).toHaveLength(1);
    for (let i = 0; i < 3; i++) expect(advance(0, false)).toHaveLength(1);
    expect(advance(0, false)).toBeUndefined();
    image(false);
    expect(advance()).toBeUndefined();

    // Replacing a player in the same network slot starts the heat history over.
    player("new-victim", 4, 2);
    image(true);
    for (let i = 0; i < 32; i++) expect(advance()).toBeUndefined();
    for (let i = 0; i < 84; i++) advance();
    expect(advance()).toHaveLength(1);
    // A sparse armor update invalidates heat even without a new move sample.
    stream.updateGhost(4, { dataBlockId: 4 });
    expect(advance(0, false)).toBeUndefined();
  }));
