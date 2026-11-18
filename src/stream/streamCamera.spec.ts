import { expect, it } from "vitest";
import { DemoStreamAdapter } from "./demoStreaming";
import { CameraMode_OrbitObject, CameraMode_OrbitPoint } from "./streamHelpers";
import { fakeDemoParser, moveBlock, packetBlock } from "./streamTestFixtures";

it("retains the recorded corpse orbit when the server sends a point instead of a ghost", () => {
  const camera = {
    position: { x: 0, y: 5, z: 10 },
    rotX: 0.1,
    rotZ: 0.2,
    minOrbitDist: 0.5,
    maxOrbitDist: 4.5,
    curOrbitDist: 4.5,
  };
  const packet = (controlObjectData: Record<string, unknown>) =>
    packetBlock({
      gameState: { controlObjectGhostIndex: 1, controlObjectData },
    });
  const stream = new DemoStreamAdapter(
    fakeDemoParser({
      ghostClasses: "Player",
      initialBlock: {
        controlObjectGhostIndex: 1,
        controlObjectData: {
          ...camera,
          cameraMode: CameraMode_OrbitObject,
          orbitObjectGhostIndex: 0,
        },
        initialGhosts: [
          {
            index: 0,
            classId: 1,
            type: "create",
            parsedData: { position: { x: 5, y: 5, z: 10 }, damageState: 1 },
          },
        ],
      },
      blocks: [
        packet({
          ...camera,
          cameraMode: CameraMode_OrbitPoint,
          orbitPoint: { x: 5, y: 5, z: 11 },
        }),
        moveBlock(),
        packetBlock(),
        moveBlock(),
        packet({ ...camera, cameraMode: 2 }),
        moveBlock(),
      ],
    }),
    { checkpoints: false },
  );
  const initial = stream.getSnapshot();
  expect(initial.camera).toMatchObject({
    mode: "third-person",
    orbitDistance: 4,
    orbitTargetId: initial.entities[0].id,
  });
  for (const time of [0.032, 0.064]) {
    const camera = stream.stepToTime(time).camera;
    expect(camera).toMatchObject({
      mode: "third-person",
      orbitDistance: 4,
      orbitPoint: [5, 5, 11],
    });
    expect(camera?.orbitTargetId).toBeUndefined();
    expect(camera?.controlEntityId).toBeUndefined();
  }
  const fly = stream.stepToTime(0.096).camera;
  expect(fly?.mode).toBe("observer");
  expect(fly?.orbitPoint).toBeUndefined();
  expect(fly?.orbitDistance).toBeUndefined();
});

it("restores a legacy checkpoint's recorded orbit point and distance on its first frame", async () => {
  const adapter = () =>
    new DemoStreamAdapter(
      fakeDemoParser({
        blocks: [moveBlock(), moveBlock(), moveBlock()],
        decompressedByteLength: 4,
        initialBlock: {
          controlObjectData: {
            position: { x: 0, y: 5, z: 10 },
            rotX: 0.1,
            rotZ: 0.2,
            cameraMode: CameraMode_OrbitPoint,
            orbitPoint: { x: 5, y: 5, z: 11 },
            minOrbitDist: 0.5,
            maxOrbitDist: 7.5,
          },
        },
      }),
      { checkpoints: false },
    );
  const legacy = await adapter().captureCheckpointAt(2, async () => {});
  const camera = legacy.simulation.state.camera!;
  camera.mode = "observer";
  delete camera.orbitDistance;
  delete camera.orbitPoint;
  delete camera.controlCameraBlend;
  delete camera.previousControlCameraBlend;
  legacy.simulation.state.lastOrbitDistance = undefined;

  const stream = adapter();
  stream.setPlayerPredictionEnabled(true);
  stream.importCheckpoints([legacy]);
  for (const time of [0.064, 0.096]) {
    expect(stream.stepToTime(time).camera).toMatchObject({
      mode: "third-person",
      orbitDistance: 7,
      orbitPoint: [5, 5, 11],
    });
  }
  expect(camera.mode).toBe("observer");
});
