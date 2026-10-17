import { describe, expect, it } from "vitest";
import {
  createDefaultRegistry,
  createLiveParser,
  GhostStateAccumulator,
  passiveObserverProtocolState,
} from "t2-demo-parser";
import { gravityEvent, serverPacket } from "../../relay/serverPacketFixtures";
import { GAME_PROTOCOL_VERSION } from "../../relay/shared";
import { buildCatchupPayload } from "../../relay/watchCatchup";
import {
  deserializeCatchupPayload,
  serializeCatchupPayload,
} from "../../relay/watchSerialize";
import { WatchStateAccumulator } from "../../relay/watchState";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import { DEFAULT_WORLD_GRAVITY, worldGravityToMS2 } from "./worldGravity";
import { STREAM_TICK_SEC } from "./streamHelpers";

const viewer = () =>
  new LiveStreamAdapter({} as RelayClient, { mode: "watch" });

function relay() {
  const { packetParser } = createLiveParser({
    protocolVersion: GAME_PROTOCOL_VERSION,
  });
  packetParser.setConnectionProtocolState(
    passiveObserverProtocolState(serverPacket(1)[0]),
  );
  const ghostState = new GhostStateAccumulator();
  const watchState = new WatchStateAccumulator();
  let sequence = 0;
  return {
    watchState,
    gravity(value: number) {
      const packet = serverPacket(sequence + 1, {
        events: [gravityEvent(sequence++, value)],
      });
      const parsed = packetParser.parsePacket(packet);
      expect(parsed.parseFault).toBeUndefined();
      watchState.applyPacket(parsed);
      ghostState.applyPacket(parsed);
      return packet;
    },
    payload() {
      return deserializeCatchupPayload(
        serializeCatchupPayload(
          buildCatchupPayload({
            packetParser,
            ghostState,
            watchState,
            epoch: 1,
            serverAddress: "test:28000",
          }),
        ),
      );
    },
  };
}

describe("watch gravity", () => {
  it("uses restored gravity and the mortar multiplier when advancing flight", () => {
    const source = relay();
    source.gravity(-26.9);
    const payload = source.payload();
    payload.dataBlocks = [
      [7, { className: "GrenadeProjectileData", data: { gravityMod: 1.1 } }],
    ];
    payload.initialGhosts = [
      {
        index: 1,
        type: "create",
        classId: createDefaultRegistry().getGhostClassId("GrenadeProjectile"),
        updateBitsStart: 0,
        updateBitsEnd: 0,
        parsedData: {
          dataBlockId: 7,
          position: { x: 0, y: 0, z: 100 },
          velocity: { x: 10, y: 0, z: 20 },
        },
      },
    ];
    const adapter = viewer();
    adapter.hydrate(payload);
    const ticks = 10;
    const snapshot = adapter.stepToTime(ticks * STREAM_TICK_SEC);
    const mortar = snapshot.entities.find((entity) => entity.ghostIndex === 1)!;
    // Native integration applies acceleration before position each 32 ms tick.
    const acceleration = Math.fround(-26.9) * 0.4905 * 1.1;
    expect(mortar.velocity?.[2]).toBeCloseTo(
      20 + acceleration * ticks * STREAM_TICK_SEC,
    );
    expect(mortar.position?.[2]).toBeCloseTo(
      100 +
        20 * ticks * STREAM_TICK_SEC +
        acceleration * STREAM_TICK_SEC ** 2 * ((ticks * (ticks + 1)) / 2),
    );
  });

  it.each([-26.9, 0])(
    "hydrates native gravity %s and continues with later GravityEvents",
    (gravity) => {
      const source = relay();
      const early = viewer();
      early.hydrate(source.payload());
      early.feedPacket(source.gravity(gravity));

      const payload = source.payload();
      expect(payload.worldGravity).toBe(Math.fround(gravity));
      const late = viewer();
      late.hydrate(payload);
      expect(late.getSnapshot().gravity).toBe(
        worldGravityToMS2(Math.fround(gravity)),
      );
      expect(late.getSnapshot().gravity).toBe(early.getSnapshot().gravity);

      const next = source.gravity(-24);
      early.feedPacket(next);
      late.feedPacket(next);
      expect(late.getSnapshot().gravity).toBe(worldGravityToMS2(-24));
      expect(late.getSnapshot().gravity).toBe(early.getSnapshot().gravity);
    },
  );

  it("replaces gravity on rehydration and defaults when an older relay omits it", () => {
    const adapter = viewer();
    const source = relay();
    expect(source.payload().worldGravity).toBeUndefined();
    for (const gravity of [-26.9, 0, -24]) {
      source.gravity(gravity);
      adapter.hydrate(source.payload());
      expect(adapter.getSnapshot().gravity).toBe(
        worldGravityToMS2(Math.fround(gravity)),
      );
    }

    const legacy = source.payload();
    delete legacy.worldGravity;
    adapter.hydrate(legacy);
    expect(adapter.getSnapshot().gravity).toBe(
      worldGravityToMS2(DEFAULT_WORLD_GRAVITY),
    );
  });

  it("preserves gravity through mission phases and ignores nonfinite events", () => {
    const source = relay();
    source.watchState.applyMissionStart("MissionStartPhase1", [
      "1",
      "Raindance",
    ]);
    source.gravity(-26.9);
    source.watchState.applyMissionStart("MissionStartPhase1", [
      "2",
      "Katabatic",
    ]);
    source.watchState.applyMissionStart("MissionStartPhase3", [
      "2",
      "Katabatic",
    ]);
    source.gravity(Number.NaN);
    source.gravity(Number.POSITIVE_INFINITY);
    source.gravity(Number.NEGATIVE_INFINITY);

    const adapter = viewer();
    adapter.hydrate(source.payload());
    expect(adapter.getSnapshot().gravity).toBe(
      worldGravityToMS2(Math.fround(-26.9)),
    );
  });
});
