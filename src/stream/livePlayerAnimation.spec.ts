import { afterEach, expect, it, vi } from "vitest";
import type {
  PacketData,
  PacketParser,
  ParsedData,
  PlayerDataBlock,
} from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { MutableEntity } from "./StreamEngine";
import type { RelayClient } from "./relayClient";
import { clearWorldColliders } from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";

const armor = {
  boxSize: { x: 1, y: 1, z: 2 },
  runSurfaceAngle: 70,
  maxEnergy: 100,
} satisfies PlayerDataBlock;
const neutral = {
  px: 16,
  py: 16,
  pz: 16,
  pyaw: 0,
  ppitch: 0,
  proll: 0,
  freeLook: false,
  trigger: [],
};
const pose = {
  rotationZ: 0,
  position: { x: 0, y: 0, z: 100 },
  velocity: { x: 16, y: 0, z: 0 },
  move: neutral,
};

class PlayerStream extends LiveStreamAdapter {
  readonly player: MutableEntity = {
    id: "player",
    ghostIndex: 0,
    className: "Player",
    type: "Player",
    spawnTick: 0,
    rotation: [0, 0, 0, 1],
    dataBlockId: 1,
  };

  constructor(mode: "play" | "watch" = "watch") {
    super({} as RelayClient, { mode });
    this.entities.set(this.player.id, this.player);
    this.entityIdByGhostIndex.set(0, this.player.id);
    this.update(pose);
  }

  override getDataBlockData() {
    return armor;
  }

  update(data: ParsedData) {
    this.applyGhostData(this.player, data);
    this.advanceShapeAnimations();
  }

  control() {
    this.processControlObject({
      controlObjectGhostIndex: 0,
      controlObjectData: { ...pose, energyLevel: 100 },
    });
    this.acknowledgeMoves(0, { ...pose, energyLevel: 100 });
  }

  addTerrain() {
    this.entities.set("terrain", {
      id: "terrain",
      ghostIndex: 1,
      className: "TerrainBlock",
      type: "Terrain",
      spawnTick: 0,
      rotation: [0, 0, 0, 1],
    });
  }

  addEffect() {
    this.entities.set("effect", {
      id: "effect",
      ghostIndex: -1,
      className: "Explosion",
      type: "Explosion",
      spawnTick: 0,
      rotation: [0, 0, 0, 1],
      expiryTick: 3,
      isExplosion: true,
    });
  }

  packet(
    ack = 0,
    disposition: "accepted" | "rejected" | "keepalive" = "accepted",
  ) {
    // Only decoding is stubbed; feedPacket still takes the production acceptance,
    // event/ghost application, acknowledgment and snapshot-invalidation path.
    const parser = (this as unknown as { packetParser: PacketParser })
      .packetParser;
    vi.spyOn(parser, "parsePacket").mockImplementationOnce(() => {
      if (disposition === "rejected") parser.protocolRejected++;
      if (disposition === "keepalive") parser.protocolNoDispatch++;
      return {
        gameState: { lastMoveAck: ack },
        events: [],
        ghosts: [],
        dnetHeader: { packetType: disposition === "keepalive" ? 1 : 0 },
      } as unknown as PacketData;
    });
    // Play mode accepts packets without a watch hydration epoch.
    this.feedPacket(new Uint8Array([0]));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  clearWorldColliders();
  setTerrainCollisionData(null);
});

it("applies a new action after unmounting when both arrive in one ghost update", () => {
  const stream = new PlayerStream();
  stream.update({ mountObject: 4, action: 16, actionAtEnd: true });
  stream.stepToTime(0.032);
  stream.update({
    mountObject: -1,
    action: 20,
    actionHoldAtEnd: true,
    damageState: 1,
  });
  expect(stream.player.mountObjectGhostIndex).toBeUndefined();
  expect(stream.player.actionAnim).toBe(20);
  expect(stream.player.actionTimeSec).toBe(0.032);
  expect(stream.player.actionHoldAtEnd).toBe(true);
  expect(stream.player.actionAtEnd).toBe(false);

  // An ordinary unmount still clears a stale seat pose.
  stream.update({ mountObject: 4, action: 16, actionAtEnd: true });
  stream.update({ mountObject: -1 });
  expect(stream.player.actionAnim).toBeUndefined();
});

it("advances prediction and contact once per 32 ms, independently of render frequency", () => {
  const dense = new PlayerStream();
  const sparse = new PlayerStream();
  const initial = dense.getSnapshot();
  for (let ms = 1; ms <= 960; ms++) {
    const snapshot = dense.stepToTime(ms / 1000);
    expect(snapshot.timeSec).toBe(Math.floor(ms / 32) * 0.032);
    expect(dense.player.playerPrediction?.contactTimer).toBe(
      Math.floor(ms / 32),
    );
    if (ms < 32) expect(snapshot).toBe(initial);
  }
  const end = sparse.stepToTime(0.96);
  expect(end.entities[0]).toEqual(dense.getSnapshot().entities[0]);
  expect(end.entities[0].position?.[0]).toBe(15);
  expect(end.entities[0].playerDelta?.posVec[0]).toBe(-0.5);
  expect(end.entities[0].clientAnimation?.move?.animation).toBe("fall");
  // A missing server update stops ghost prediction after the retail 30-tick limit.
  dense.stepToTime(1.92);
  expect(dense.player.position).toEqual(end.entities[0].position);
  expect(dense.player.playerPrediction?.contactTimer).toBe(30);
});

it("waits for collision assets without aging contact or moving through unloaded terrain", () => {
  const stream = new PlayerStream();
  stream.addTerrain();
  stream.stepToTime(10);
  expect(stream.player.position).toEqual([0, 0, 100]);
  expect(stream.player.playerPrediction?.contactTimer).toBe(0);
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256).fill(3200),
    squareSize: 8,
  });
  stream.stepToTime(10.016);
  expect(stream.player.playerPrediction?.contactTimer).toBe(0);
  expect(stream.player.position?.[0]).toBeGreaterThan(0);
  expect(stream.player.position?.[2]).toBeGreaterThanOrEqual(100);
});

it("does not advance movement, contact or effect lifetimes on packet arrivals", () => {
  const stream = new PlayerStream("play");
  stream.addEffect();
  const initialUpdateId = stream.serverUpdateId;
  stream.stepToTime(0.032);
  expect(stream.serverUpdateId).toBe(initialUpdateId);
  const state = stream.player.playerPrediction!.saveState();
  for (let i = 0; i < 12; i++) stream.packet(7);
  expect(stream.player.playerPrediction!.saveState()).toEqual(state);
  expect(stream.getSnapshot().timeSec).toBe(0.032);
  expect(stream.getSnapshot().entities.some((e) => e.id === "effect")).toBe(
    true,
  );
  expect(stream.lastMoveAck).toBe(7);
  const updateId = stream.serverUpdateId;
  expect(updateId).toBe(initialUpdateId + 12);
  const beforeRejected = stream.getSnapshot();
  stream.packet(0, "rejected");
  stream.packet(0, "keepalive");
  expect(stream.lastMoveAck).toBe(7);
  expect(stream.getSnapshot()).toBe(beforeRejected);
  expect(stream.serverUpdateId).toBe(updateId);
  expect(stream.stepToTime(0.096).entities.some((e) => e.id === "effect")).toBe(
    false,
  );
});

it("processes local control input once and does not apply watcher camera moves to the relay player", () => {
  const play = new PlayerStream("play");
  play.control();
  play.submitMove({}, 0);
  play.submitMove({}, 0); // A retransmission must not advance the player twice.
  play.stepToTime(0.032);
  expect(play.player.position?.[0]).toBe(0.5);
  play.stepToTime(0.064);
  expect(play.player.position?.[0]).toBe(0.5);
  expect(play.player.playerDelta).toBeUndefined();
  play.submitMove({}, 1);
  play.stepToTime(0.096);
  expect(play.player.position?.[0]).toBe(1);

  const watch = new PlayerStream();
  watch.control();
  watch.submitMove({ y: 1, yaw: 1 }, 0);
  watch.stepToTime(0.032);
  expect(watch.player.position).toEqual([0, 0, 100]);
});

it("honors the tick budget and never runs live simulation backwards", () => {
  const stream = new PlayerStream();
  expect(stream.stepToTime(1, 2).timeSec).toBe(0.064);
  const snapshot = stream.getSnapshot();
  expect(stream.stepToTime(0)).toBe(snapshot);
  expect(stream.stepToTime(Infinity)).toBe(snapshot);
  expect(stream.stepToTime(NaN)).toBe(snapshot);
  stream.reset();
  expect(stream.getSnapshot().timeSec).toBe(0);
  expect(stream.getSnapshot().entities).toEqual([]);
});
