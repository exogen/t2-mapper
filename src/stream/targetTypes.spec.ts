import { expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import { WatchStateAccumulator } from "../../relay/watchState";
import { streamEntityToGameEntity } from "./entityBridge";
import { flagLabel } from "../state/flagTeam";
import { decodeCheckpoint, encodeCheckpoint } from "./checkpointCodec";

class TargetStream extends LiveStreamAdapter {
  constructor() {
    super({} as RelayClient, { mode: "watch" });
    this.registry = {
      getGhostParser: (classId: number) => ({
        name: classId === 2 ? "Player" : "Item",
      }),
      getEventParser: () => undefined,
    };
  }
  override getDataBlockData() {
    return { shapeName: "flag.dts" };
  }
  receive(...events: ParsedData[]) {
    for (const parsedData of events)
      this.processEvent({ classId: 0, parsedData }, undefined);
  }
  spawn(index: number, targetId: number, classId = 1) {
    this.processGhostUpdate({
      index,
      classId,
      type: "create",
      parsedData: {
        dataBlockId: 1,
        targetId,
        position: { x: 0, y: 0, z: 100 },
      },
    });
  }
  retarget(index: number, targetId: number) {
    this.processGhostUpdate({
      index,
      type: "update",
      parsedData: { targetId },
    });
  }
  seed(entry: Parameters<TargetStream["seedTargetInfo"]>[0]) {
    this.seedTargetInfo(entry);
  }
  mountImage(index: number, dataBlockId: number) {
    this.processGhostUpdate({
      index,
      type: "update",
      parsedData: { images: [{ index: 3, dataBlockId }] },
    });
  }
  player(index: number) {
    const entity = this.entities.get(this.entityIdByGhostIndex.get(index)!)!;
    entity.type = "Player";
    entity.className = "Player";
  }
  team() {
    if (!this.teamScores.length)
      this.teamScores = [
        { teamId: 1, name: "Storm", score: 0, playerCount: 0 },
      ];
    return this.buildCachedHudState().teamScores[0];
  }
  entity(index = 0) {
    return this.buildEntityList().find(
      (entity) => entity.ghostIndex === index,
    )!;
  }
  label(index = 0) {
    return flagLabel(
      streamEntityToGameEntity(this.entity(index)),
      "original",
      {},
    );
  }
  flags() {
    return this.buildCachedHudState().flagTargets;
  }
  remove(index: number) {
    this.processGhostUpdate({ index, type: "delete" });
  }
  checkpoint() {
    return this.captureSimulationState();
  }
  restore(checkpoint: ReturnType<TargetStream["checkpoint"]>) {
    this.restoreSimulationState(checkpoint);
  }
}

function fixture() {
  const stream = new TargetStream();
  const relay = new WatchStateAccumulator();
  const receive = (...events: ParsedData[]) => {
    stream.receive(...events);
    relay.applyPacket({
      gameState: {},
      ghosts: [],
      events: events.map((parsedData) => ({ classId: 0, parsedData })),
    } as unknown as Parameters<WatchStateAccumulator["applyPacket"]>[0]);
  };
  return { stream, relay, receive };
}

it("resolves the server's flag type before its ghost appears", () => {
  const { stream, relay, receive } = fixture();
  receive(
    { type: "NetStringEvent", id: 10, value: "Flag" },
    {
      type: "TargetInfoEvent",
      targetId: 32,
      nameTag: 0x400,
      typeTag: 10,
      sensorGroup: 0,
      renderFlags: 2,
    },
  );
  stream.spawn(0, 32);
  expect(stream.label()).toBe("Flag");
  expect(relay.getTargetEntries()[0]).toMatchObject({
    targetId: 32,
    name: "",
    typeDescription: "Flag",
  });
});

it("resolves shared name and type tags for every waiting target", () => {
  const { stream, relay, receive } = fixture();
  for (const [index, targetId] of [32, 33].entries()) {
    stream.spawn(index, targetId);
    receive({ type: "TargetInfoEvent", targetId, nameTag: 10, typeTag: 11 });
  }
  receive(
    { type: "NetStringEvent", id: 10, value: "\x02flag" },
    { type: "NetStringEvent", id: 11, value: "Flag" },
  );
  expect([stream.label(0), stream.label(1)]).toEqual([
    "flag Flag",
    "flag Flag",
  ]);
  expect(
    relay
      .getTargetEntries()
      .map(({ name, typeDescription }) => [name, typeDescription]),
  ).toEqual([
    ["\x02flag", "Flag"],
    ["\x02flag", "Flag"],
  ]);
});

it("distinguishes omitted strings from explicit empty-name and empty-type updates", () => {
  const { stream, relay, receive } = fixture();
  stream.spawn(0, 32);
  receive(
    { type: "NetStringEvent", id: 10, value: "flag" },
    { type: "NetStringEvent", id: 11, value: "Flag" },
    { type: "TargetInfoEvent", targetId: 32, nameTag: 10, typeTag: 11 },
  );
  receive({ type: "TargetInfoEvent", targetId: 32, renderFlags: 2 });
  expect(stream.label()).toBe("flag Flag");
  receive({ type: "TargetInfoEvent", targetId: 32, typeTag: 0x400 });
  expect(stream.label()).toBe("flag");
  receive({ type: "TargetInfoEvent", targetId: 32, nameTag: 0x400 });
  expect(stream.label()).toBe("");
  expect(relay.getTargetEntries()[0]).toMatchObject({
    name: "",
    typeDescription: "",
  });
});

it("does not let late strings rename a freed and reissued target", () => {
  const { stream, relay, receive } = fixture();
  receive(
    { type: "TargetInfoEvent", targetId: 32, nameTag: 10, typeTag: 11 },
    { type: "TargetFreeEvent", targetId: 32 },
    { type: "TargetInfoEvent", targetId: 32, nameTag: 12, typeTag: 13 },
  );
  stream.spawn(0, 32);
  receive(
    { type: "NetStringEvent", id: 10, value: "Old" },
    { type: "NetStringEvent", id: 11, value: "Old Type" },
  );
  expect(stream.entity().playerName).toBeUndefined();
  expect(stream.entity().targetTypeName).toBeUndefined();
  expect(relay.getTargetEntries()).toEqual([
    expect.objectContaining({ targetId: 32, nameTag: 12, typeTag: 13 }),
  ]);
  receive(
    { type: "NetStringEvent", id: 12, value: "New" },
    { type: "NetStringEvent", id: 13, value: "Flag" },
  );
  expect(stream.label()).toBe("New Flag");
});

it("replaces pending strings instead of applying superseded ones", () => {
  const { stream, relay, receive } = fixture();
  stream.spawn(0, 32);
  receive(
    { type: "TargetInfoEvent", targetId: 32, nameTag: 10, typeTag: 11 },
    { type: "TargetInfoEvent", targetId: 32, nameTag: 0x400, typeTag: 12 },
    { type: "NetStringEvent", id: 10, value: "Old" },
    { type: "NetStringEvent", id: 11, value: "Old Type" },
    { type: "NetStringEvent", id: 12, value: "Flag" },
  );
  expect(stream.label()).toBe("Flag");
  expect(relay.getTargetEntries()[0]).toMatchObject({
    name: "",
    typeDescription: "Flag",
  });
});

it("drops all old target metadata when a ghost switches targets", () => {
  const { stream, receive } = fixture();
  receive(
    { type: "NetStringEvent", id: 10, value: "Storm" },
    { type: "NetStringEvent", id: 11, value: "Flag" },
    { type: "NetStringEvent", id: 12, value: "base" },
    {
      type: "TargetInfoEvent",
      targetId: 32,
      nameTag: 10,
      typeTag: 11,
      skinTag: 12,
      skinPrefTag: 12,
      sensorGroup: 1,
      renderFlags: 2,
    },
  );
  stream.spawn(0, 32);
  expect(stream.label()).toBe("Storm Flag");
  stream.retarget(0, 33);
  expect(stream.entity().playerName).toBeUndefined();
  expect(stream.entity().targetTypeName).toBeUndefined();
  expect(stream.entity().teamId).toBeUndefined();
  expect(stream.entity().targetRenderFlags).toBeUndefined();
  expect(stream.entity().skinName).toBeUndefined();
  expect(stream.entity().skinPrefName).toBeUndefined();
});

it("detaches a freed target from existing ghosts before its slot is reissued", () => {
  const { stream, receive } = fixture();
  receive(
    { type: "NetStringEvent", id: 10, value: "Storm" },
    { type: "NetStringEvent", id: 11, value: "Flag" },
    {
      type: "TargetInfoEvent",
      targetId: 32,
      nameTag: 10,
      typeTag: 11,
      sensorGroup: 1,
      renderFlags: 2,
    },
  );
  stream.spawn(0, 32);
  receive({ type: "TargetFreeEvent", targetId: 32 });
  expect(stream.entity()).toMatchObject({ targetId: -1 });
  expect(stream.entity().playerName).toBeUndefined();
  expect(stream.entity().targetTypeName).toBeUndefined();
  expect(stream.entity().targetRenderFlags).toBeUndefined();
  receive({
    type: "TargetInfoEvent",
    targetId: 32,
    typeTag: 11,
    renderFlags: 2,
  });
  expect(stream.entity().targetTypeName).toBeUndefined();
  expect(stream.entity().targetRenderFlags).toBeUndefined();
  stream.spawn(1, 32);
  expect(stream.entity(1)).toMatchObject({
    targetTypeName: "Flag",
    targetRenderFlags: 2,
    targetGeneration: 1,
  });
});

it("resolves and clears skins with the same sparse update rules as names and types", () => {
  const { stream, relay, receive } = fixture();
  stream.spawn(0, 32);
  receive({
    type: "TargetInfoEvent",
    targetId: 32,
    skinTag: 0,
    skinPrefTag: 1,
  });
  receive(
    { type: "NetStringEvent", id: 0, value: "base" },
    { type: "NetStringEvent", id: 1, value: "beagle" },
  );
  expect(stream.entity()).toMatchObject({
    skinName: "base",
    skinPrefName: "beagle",
  });
  expect(relay.getTargetEntries()[0]).toMatchObject({
    skin: "base",
    skinPref: "beagle",
  });
  receive({
    type: "TargetInfoEvent",
    targetId: 32,
    skinTag: 0x400,
    skinPrefTag: 0x400,
  });
  expect(stream.entity().skinName).toBeUndefined();
  expect(stream.entity().skinPrefName).toBeUndefined();
  expect(relay.getTargetEntries()[0]).toMatchObject({ skin: "", skinPref: "" });
});

it("refreshes cached team flag skins when target metadata resolves, changes or is freed", () => {
  const { stream, receive } = fixture();
  expect(stream.team().skinName).toBeUndefined();
  receive({
    type: "TargetInfoEvent",
    targetId: 32,
    sensorGroup: 1,
    renderFlags: 2,
    skinTag: 10,
  });
  expect(stream.team().skinName).toBeUndefined();
  receive({ type: "NetStringEvent", id: 10, value: "beagle" });
  expect(stream.team().skinName).toBe("beagle");
  receive({ type: "TargetInfoEvent", targetId: 32, skinTag: 0x400 });
  expect(stream.team().skinName).toBeUndefined();
  receive({ type: "TargetInfoEvent", targetId: 32, skinTag: 10 });
  expect(stream.team().skinName).toBe("beagle");
  receive({ type: "TargetFreeEvent", targetId: 32 });
  expect(stream.team().skinName).toBeUndefined();
});

it("keeps original flag metadata without a ghost and refreshes cached labels on string updates", () => {
  const { stream, receive } = fixture();
  receive({
    type: "TargetInfoEvent",
    targetId: 40,
    nameTag: 10,
    typeTag: 11,
    skinTag: 12,
    sensorGroup: 1,
    renderFlags: 2,
  });
  expect(stream.flags()).toEqual([
    {
      targetId: 40,
      name: undefined,
      typeName: undefined,
      skinName: undefined,
      teamId: 1,
    },
  ]);
  receive(
    { type: "NetStringEvent", id: 10, value: "\x02Storm" },
    { type: "NetStringEvent", id: 11, value: "Flag" },
    { type: "NetStringEvent", id: 12, value: "BASE" },
  );
  const flags = stream.flags();
  expect(flags).toEqual([
    {
      targetId: 40,
      name: "\x02Storm",
      typeName: "Flag",
      skinName: "base",
      teamId: 1,
    },
  ]);
  expect(stream.flags()).toBe(flags);
  receive({
    type: "TargetInfoEvent",
    targetId: 40,
    nameTag: 0x400,
    typeTag: 0x400,
  });
  expect(stream.flags()[0]).toMatchObject({ name: "", typeName: "" });
  receive({ type: "TargetFreeEvent", targetId: 40 });
  expect(stream.flags()).toEqual([]);
});

it("excludes carriers from the original flags before their ghosts appear", () => {
  const { stream, receive } = fixture();
  receive(
    { type: "NetStringEvent", id: 10, value: "_ClientConnection" },
    { type: "TargetInfoEvent", targetId: 32, typeTag: 10, renderFlags: 2 },
    { type: "TargetInfoEvent", targetId: 40, renderFlags: 2 },
  );
  expect(stream.flags().map((flag) => flag.targetId)).toEqual([40]);
});

it("refreshes flag classification when scoped players appear or switch targets", () => {
  const { stream, receive } = fixture();
  receive(
    { type: "TargetInfoEvent", targetId: 32, renderFlags: 2 },
    { type: "TargetInfoEvent", targetId: 33, renderFlags: 2 },
  );
  expect(stream.flags().map((flag) => flag.targetId)).toEqual([32, 33]);
  stream.spawn(0, 32, 2);
  expect(stream.flags().map((flag) => flag.targetId)).toEqual([33]);
  stream.retarget(0, 33);
  expect(stream.flags().map((flag) => flag.targetId)).toEqual([32]);
  stream.remove(0);
  expect(stream.flags().map((flag) => flag.targetId)).toEqual([32, 33]);
});

it("retains pending strings through relay catch-up and serialized seek checkpoints", () => {
  const { relay, receive } = fixture();
  receive({
    type: "TargetInfoEvent",
    targetId: 32,
    nameTag: 0,
    typeTag: 1,
    skinTag: 2,
    skinPrefTag: 3,
    renderFlags: 2,
  });
  const late = new TargetStream();
  const [entry] = JSON.parse(JSON.stringify(relay.getTargetEntries()));
  late.seed(entry);
  late.spawn(0, 32);
  const checkpoint = decodeCheckpoint(
    encodeCheckpoint(late.checkpoint()),
  ) as ReturnType<TargetStream["checkpoint"]>;
  late.restore(checkpoint);
  late.receive(
    { type: "NetStringEvent", id: 0, value: "Storm" },
    { type: "NetStringEvent", id: 1, value: "Flag" },
    { type: "NetStringEvent", id: 2, value: "base" },
    { type: "NetStringEvent", id: 3, value: "beagle" },
  );
  expect(late.entity()).toMatchObject({
    playerName: "Storm",
    targetTypeName: "Flag",
    skinName: "base",
    skinPrefName: "beagle",
  });
  expect(late.flags()).toEqual([
    {
      targetId: 32,
      name: "Storm",
      typeName: "Flag",
      skinName: "base",
      teamId: undefined,
    },
  ]);
});

it("uses only server target bits for flag markers, independently of mounted images", () => {
  const { stream, receive } = fixture();
  stream.spawn(0, 32);
  stream.player(0);
  receive({ type: "TargetInfoEvent", targetId: 32, renderFlags: 2 });
  expect(stream.entity().targetRenderFlags).toBe(2);
  stream.mountImage(0, 1);
  stream.mountImage(0, 0);
  expect(stream.entity().targetRenderFlags).toBe(2);
  receive({ type: "TargetInfoEvent", targetId: 32, renderFlags: 0 });
  stream.mountImage(0, 1);
  expect(stream.entity().targetRenderFlags).toBe(0);
});

it("restores target types and pending strings from serialized seek checkpoints", () => {
  const { stream, receive } = fixture();
  stream.spawn(0, 32);
  stream.spawn(1, 33);
  receive(
    { type: "NetStringEvent", id: 10, value: "Flag" },
    { type: "TargetInfoEvent", targetId: 32, typeTag: 10 },
    { type: "TargetInfoEvent", targetId: 33, nameTag: 11, typeTag: 12 },
  );
  const checkpoint = decodeCheckpoint(
    encodeCheckpoint(stream.checkpoint()),
  ) as ReturnType<TargetStream["checkpoint"]>;
  for (let i = 0; i < 2; i++) {
    stream.restore(checkpoint);
    receive(
      { type: "NetStringEvent", id: 11, value: "Rabbit" },
      { type: "NetStringEvent", id: 12, value: "Flag" },
    );
    expect([stream.label(0), stream.label(1)]).toEqual(["Flag", "Rabbit Flag"]);
  }
});
