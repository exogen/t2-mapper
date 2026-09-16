import { afterEach, expect, it, vi } from "vitest";
import type { PacketData, PacketParser } from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";

class ControlStream extends LiveStreamAdapter {
  constructor() {
    super({} as RelayClient);
    this.registry = {
      getGhostParser: (id) => ({ name: id === 1 ? "Player" : "HoverVehicle" }),
      getEventParser: () => undefined,
    };
    for (const [index, classId] of [
      [0, 1],
      [1, 2],
      [2, 2],
    ]) {
      this.processGhostUpdate({
        index,
        classId,
        type: "create",
        parsedData: { dataBlockId: 1 },
      });
    }
  }

  override getDataBlockData() {
    return { boxSize: { x: 1, y: 1, z: 2 }, maxEnergy: 100, cameraMaxDist: 5 };
  }

  receive(state: Partial<PacketData["gameState"]>) {
    const parser = (this as unknown as { packetParser: PacketParser })
      .packetParser;
    vi.spyOn(parser, "parsePacket").mockReturnValueOnce({
      gameState: { lastMoveAck: 0, ...state },
      events: [],
      ghosts: [],
      dnetHeader: { packetType: 0 },
    } as unknown as PacketData);
    this.feedPacket(new Uint8Array([0]));
  }

  vehicle(index = 1) {
    return this.getSnapshot().entities.find(
      (entity) => entity.ghostIndex === index,
    )!;
  }
  checkpoint() {
    return this.captureSimulationState();
  }
  restore(checkpoint: ReturnType<ControlStream["checkpoint"]>) {
    this.restoreSimulationState(checkpoint);
  }
}
const piloting = (x: number, vehicle = 1) => ({
  controlObjectGhostIndex: 0,
  compressionPoint: { x, y: 0, z: 100 },
  controlObjectData: {
    rotationZ: 0,
    headX: 0,
    controlObjectGhost: vehicle,
    controlObjectData: {
      linMomentum: { x: 10, y: 0, z: 0 },
      angPosition: { x: 0, y: 0, z: 0, w: 1 },
    },
  },
});
afterEach(() => vi.restoreAllMocks());

it("keeps camera orientation across compression-point-only and unrelated packets", () => {
  const stream = new ControlStream();
  stream.receive({
    controlObjectGhostIndex: 10,
    controlObjectData: {
      cameraMode: 0,
      position: { x: 10, y: 20, z: 30 },
      rotX: 0.2,
      rotZ: 1.1,
    },
  });
  const rotation = stream.getSnapshot().camera?.rotation;
  stream.receive({ compressionPoint: { x: 15, y: 20, z: 30 } });
  stream.receive({});
  const camera = stream.stepToTime(0.032).camera;
  expect(camera?.rotation).toEqual(rotation);
  expect(camera?.position).toEqual([15, 20, 30]);
});

it("retains an energy correction when another packet arrives before the next tick", () => {
  const stream = new ControlStream();
  stream.receive({
    controlObjectGhostIndex: 0,
    controlObjectData: {
      rotationZ: 0,
      headX: 0,
      position: { x: 0, y: 0, z: 100 },
      energyLevel: 20,
      rechargeRate: 0.5,
    },
  });
  stream.receive({});
  expect(stream.stepToTime(0.032).status?.energy).toBeCloseTo(0.205);
  expect(stream.stepToTime(0.064).status?.energy).toBeCloseTo(0.21);
});

it("keeps predicted vehicle motion between packets and corrects it only on new positions", () => {
  const stream = new ControlStream();
  stream.receive(piloting(10));
  stream.stepToTime(0.064);
  expect(stream.vehicle().position?.[0]).toBeCloseTo(10.64);
  expect(stream.getSnapshot().camera?.position[0]).toBeCloseTo(10.64);
  stream.receive({});
  expect(stream.vehicle().position?.[0]).toBeCloseTo(10.64);
  stream.receive({ compressionPoint: { x: 20, y: 0, z: 100 } });
  expect(stream.vehicle().position?.[0]).toBe(20);
  stream.stepToTime(0.096);
  expect(stream.vehicle().position?.[0]).toBeCloseTo(20.32);

  const checkpoint = stream.checkpoint();
  stream.stepToTime(0.16);
  const expected = stream.vehicle().position;
  stream.restore(checkpoint);
  stream.stepToTime(0.16);
  expect(stream.vehicle().position).toEqual(expected);
  stream.receive(piloting(30, 2));
  stream.stepToTime(0.192);
  expect(stream.vehicle(2).position?.[0]).toBeCloseTo(30.32);
});

it("clears the old controlled player when control switches to a camera", () => {
  const stream = new ControlStream();
  stream.receive({
    controlObjectGhostIndex: 0,
    controlObjectData: {
      rotationZ: 0,
      position: { x: 0, y: 0, z: 100 },
      headX: 0,
    },
  });
  expect(stream.getSnapshot().controlPlayerGhostId).toBeDefined();
  stream.receive({
    controlObjectGhostIndex: 10,
    controlObjectData: {
      cameraMode: 0,
      position: { x: 10, y: 20, z: 30 },
      rotX: 0.2,
      rotZ: 1.1,
    },
  });
  expect(stream.getSnapshot().controlPlayerGhostId).toBeUndefined();
  expect(stream.getSnapshot().camera?.mode).toBe("observer");
});
