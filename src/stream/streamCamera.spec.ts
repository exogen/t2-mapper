import { expect, it, vi } from "vitest";
import { DemoStreamAdapter } from "./demoStreaming";
import {
  CameraMode_OrbitObject,
  CameraMode_OrbitPoint,
  STREAM_TICK_SEC,
} from "./streamHelpers";
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

it.each([
  { cameraMissing: false, useEyePoint: true },
  { cameraMissing: true, useEyePoint: true },
  { cameraMissing: false, useEyePoint: false },
])(
  "restores recorded turret aim and camera (camera missing: $cameraMissing, turret supplies eye: $useEyePoint)",
  async ({ cameraMissing, useEyePoint }) => {
    const onRestore = vi.fn();
    const controlObjectData = (rotationValues: [number, number, number]) => ({
      rotationZ: 0,
      headX: 0,
      headZ: 0,
      controlObjectGhost: 1,
      controlObjectData: { turretState: 2, rotationValues },
    });
    const adapter = () =>
      new DemoStreamAdapter(
        fakeDemoParser({
          ghostClasses: (id) => ["Player", "Turret", "FlyingVehicle"][id - 1],
          decompressedByteLength: 6,
          onRestore,
          initialBlock: {
            firstPerson: false,
            controlObjectGhostIndex: 0,
            controlObjectData: controlObjectData([1, 122.5, 147.25]),
            dataBlocks: new Map([
              [
                7,
                {
                  className: "TurretData",
                  data: { firstPersonOnly: true, useEyePoint },
                },
              ],
            ]),
            initialGhosts: [
              {
                index: 2,
                classId: 3,
                type: "create",
                parsedData: { position: { x: 5, y: 10, z: 70 } },
              },
              {
                index: 1,
                classId: 2,
                type: "create",
                parsedData: { dataBlockId: 7, mountObject: 2, mountNode: 10 },
              },
              {
                index: 0,
                classId: 1,
                type: "create",
                parsedData: { mountObject: 2, mountNode: 1 },
              },
            ],
          },
          blocks: [
            moveBlock(),
            packetBlock({
              gameState: {
                controlObjectGhostIndex: 0,
                compressionPoint: { x: 6, y: 20, z: 80 },
                controlObjectData: controlObjectData([1, 271.5, 161.25]),
              },
            }),
            moveBlock(),
            packetBlock(),
            moveBlock(),
          ],
        }),
        { checkpoints: false },
      );
    const main = adapter();
    const initial = main.getSnapshot();
    const initialTurret = initial.entities.find(
      (entity) => entity.className === "Turret",
    )!;
    const expectedView = {
      mode: useEyePoint ? "first-person" : "third-person",
      controlCameraBlend: useEyePoint ? 0 : 1,
    };
    expect(initial.camera).toMatchObject({
      ...expectedView,
      controlEntityId: initialTurret.id,
      position: [5, 10, 70],
    });
    expect(initialTurret.turretAim).toEqual({
      activation: 1,
      phi: 122.5,
      theta: 147.25,
    });
    const expectedAim = { activation: 1, phi: 271.5, theta: 161.25 };
    for (const tick of [2, 3]) {
      const snapshot = main.stepToTime(tick * STREAM_TICK_SEC);
      const turret = snapshot.entities.find(
        (entity) => entity.className === "Turret",
      )!;
      expect(turret.turretAim).toEqual(expectedAim);
      expect(turret.position).toEqual(initialTurret.position);
    }

    const checkpoint = await adapter().captureCheckpointAt(2, async () => {});
    delete [...checkpoint.simulation.state.entities.values()].find(
      (entity) => entity.className === "Turret",
    )!.turretAim;
    if (cameraMissing) {
      // Legacy recordings starting in a turret had no camera until a separate
      // compression point arrived. Restore their view on the checkpoint itself.
      checkpoint.simulation.state.camera = null;
      checkpoint.simulation.state.latestControl.position = undefined;
    }
    const viewer = adapter();
    viewer.setPlayerPredictionEnabled(true);
    viewer.importCheckpoints([checkpoint]);
    onRestore.mockClear();
    const restored = viewer.stepToTime(2 * STREAM_TICK_SEC);
    const turret = restored.entities.find(
      (entity) => entity.className === "Turret",
    )!;
    expect(onRestore).toHaveBeenCalled();
    expect(restored.camera).toMatchObject({
      ...expectedView,
      controlEntityId: turret.id,
      position: cameraMissing ? [5, 10, 70] : [6, 20, 80],
    });
    expect(turret.turretAim).toEqual(expectedAim);
  },
);
