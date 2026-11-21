import { describe, expect, it } from "vitest";
import { castWorldRay } from "../collision/worldCollision";
import { HeadlessWorld } from "../world/headlessWorld";
import { GhostMessage } from "./entityClassification";
import { ForceFieldState } from "./forceFieldState";
import { TestLiveStream } from "./streamTestFixtures";

const playerIndex = 0;
const zoneIndex = 1;
const fieldIndex = 2;
const crossingState = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 80, y: 0, z: 0 },
  rotationZ: 0,
};
const zone = {
  transform: {
    elements: [1, 0, 0, 1, 0, 1, 0, -1, 0, 0, 1, -1, 0, 0, 0, 1],
    position: { x: 1, y: -1, z: -1 },
  },
  scale: { x: 0.5, y: 2, z: 4 },
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: 0, y: 1, z: 1 },
  ],
  velocityMod: 0.1,
  active: true,
};

class ZoneStream extends TestLiveStream {
  constructor(mode: "play" | "watch" = "watch") {
    super(
      mode,
      (classId) =>
        ["Player", "PhysicalZone", "Trigger", "ForceFieldBare"][classId],
    );
    this.seedPlayer();
  }

  override getDataBlockData(id: number) {
    if (id === 2) return { teamPermiable: true, otherPermiable: false };
    return { boxSize: { x: 1, y: 1, z: 2 }, mass: 90 };
  }

  seedPlayer(): void {
    this.createGhost(playerIndex, 0, { dataBlockId: 1 });
  }

  addField(team: number): void {
    this.createGhost(fieldIndex, 3, {
      dataBlockId: 2,
      transform: {
        position: zone.transform.position,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      scale: zone.scale,
      state: ForceFieldState.Closed,
    });
    this.entities.get(this.entityIdByGhostIndex.get(fieldIndex)!)!.sensorGroup =
      team;
  }

  predictCrossing() {
    const player = this.entities.get(
      this.entityIdByGhostIndex.get(playerIndex)!,
    )!;
    const prediction = this.ensurePlayerPrediction(player)!;
    prediction.readPacketData(crossingState);
    prediction.processTick(0, {});
    return { position: prediction.position.x, velocity: prediction.velocity.x };
  }

  predictedCrossingSpeed(): number {
    return this.predictCrossing().velocity;
  }
}

describe("PhysicalZone ghost prediction", () => {
  it("uses sparse active updates and restores the zone from a serialized checkpoint", () => {
    const stream = new ZoneStream();
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(80);
    stream.createGhost(zoneIndex, 1, zone);
    const crossing = stream.predictCrossing();
    expect(crossing.velocity).toBeCloseTo(8);
    expect(crossing.position).toBeCloseTo(2.5);

    stream.updateGhost(zoneIndex, { active: false });
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(80);
    stream.roundTripCheckpoint();
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(80);

    stream.updateGhost(zoneIndex, { active: true });
    stream.roundTripCheckpoint();
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(8);
  });

  it.each([
    { team: 0, position: 2.5, velocity: 8 },
    { team: 1, position: 0.04, velocity: -0.01 },
  ])(
    "honors field permeability in player prediction for field team $team",
    ({ team, position, velocity }) => {
      const stream = new ZoneStream();
      stream.createGhost(zoneIndex, 1, zone);
      stream.addField(team);
      const crossing = stream.predictCrossing();
      expect(crossing.position).toBeCloseTo(position);
      expect(crossing.velocity).toBeCloseTo(velocity);
    },
  );

  it("updates headless ray collision when field power returns", async () => {
    const world = new HeadlessWorld();
    const stream = new ZoneStream();
    const castAcrossField = () => castWorldRay([2.5, 0, 0], [0, 0, 0]);
    stream.addField(1);
    stream.updateGhost(fieldIndex, { state: ForceFieldState.Open });
    await world.sync([stream.entityAt(fieldIndex)!]);
    expect(await world.run(castAcrossField)).toBeNull();

    stream.updateGhost(fieldIndex, {
      state: ForceFieldState.Closed,
      scale: { ...zone.scale, x: 0.75 },
    });
    await world.sync([stream.entityAt(fieldIndex)!]);
    expect(await world.run(castAcrossField)).toMatchObject({
      source: "forcefield",
      point: [1.75, 0, 0],
    });
  });

  it("predicts against enemy field updates immediately without a world sync", () => {
    const stream = new ZoneStream("play");
    expect(stream.predictCrossing().position).toBeCloseTo(2.5);

    stream.addField(1);
    expect(stream.predictCrossing().position).toBeCloseTo(0.49);

    stream.updateGhost(fieldIndex, {
      state: ForceFieldState.Open,
      scale: { x: 0, y: 0, z: 0 },
    });
    expect(stream.predictCrossing().position).toBeCloseTo(2.5);

    const gameState = {
      controlObjectGhostIndex: playerIndex,
      controlObjectData: crossingState,
    };
    stream.feedDecoded({ gameState });
    stream.submitMove({}, 0);
    stream.feedDecoded({
      gameState,
      ghosts: [
        {
          index: fieldIndex,
          type: "update",
          parsedData: { state: ForceFieldState.Closing, scale: zone.scale },
        },
      ],
    });
    expect(stream.entityAt(playerIndex)?.position?.[0]).toBeCloseTo(0.49);

    stream.updateGhost(fieldIndex, {
      transform: {
        position: { ...zone.transform.position, x: 2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    expect(stream.predictCrossing().position).toBeCloseTo(1.49);
    stream.roundTripCheckpoint();
    expect(stream.predictCrossing().position).toBeCloseTo(1.49);

    stream.ghost({ index: fieldIndex, type: "delete" });
    expect(stream.predictCrossing().position).toBeCloseTo(2.5);
  });

  it("forgets zones when deleted, replaced or cleared with the mission", () => {
    const stream = new ZoneStream();
    stream.createGhost(zoneIndex, 1, zone);
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(8);
    stream.ghost({ index: zoneIndex, type: "delete" });
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(80);

    stream.createGhost(zoneIndex, 1, zone);
    stream.createGhost(zoneIndex, 2, {});
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(80);

    stream.createGhost(zoneIndex, 1, zone);
    stream.event({
      type: "GhostingMessageEvent",
      message: GhostMessage.EndGhosting,
    });
    stream.seedPlayer();
    expect(stream.predictedCrossingSpeed()).toBeCloseTo(80);
  });
});
