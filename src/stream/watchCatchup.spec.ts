import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DemoParser,
  GhostStateAccumulator,
  createLiveParser,
  BlockTypePacket,
} from "t2-demo-parser";
import type { PacketData } from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import { WatchStateAccumulator } from "../../relay/watchState";
import { buildCatchupPayload } from "../../relay/watchCatchup";
import {
  serializeCatchupPayload,
  deserializeCatchupPayload,
} from "../../relay/watchSerialize";

/**
 * The watch-mode equivalence test: a late joiner hydrated from a relay
 * catch-up payload at block K must converge to the same world state as a
 * watcher who has streamed since the start. Demo recordings provide a
 * deterministic packet source standing in for the live server.
 *
 * Both sides use identical machinery on identical bytes, so any
 * difference isolates a hydration bug: a GhostStateAccumulator merge
 * rule, a missing payload field, or watchState drift from
 * StreamEngine.handleServerMessage.
 */

const DEMO_DIR = path.resolve(
  import.meta.dirname,
  "../../../t2-demo-parser/data",
);
const DEMO_FILE = "uploads_6_SterIO_2025_LT_Pub_SH.rec";
const CUTOVER_BLOCKS = 15_000;
const CONTINUE_BLOCKS = 10_000;

/** Client-simulated classes whose per-tick state legitimately depends on
 *  when the client joined (positions advanced locally, transient lifetimes). */
const CLIENT_SIMULATED = /Projectile|Explosion|Debris|Item|ParticleEmission/;

function demoPath(): string | null {
  const p = path.join(DEMO_DIR, DEMO_FILE);
  return fs.existsSync(p) ? p : null;
}

const fakeRelay = {} as unknown as RelayClient;

interface RelaySim {
  parser: ReturnType<typeof createLiveParser>["packetParser"];
  ghostState: GhostStateAccumulator;
  watchState: WatchStateAccumulator;
}

function comparableEntities(adapter: LiveStreamAdapter) {
  // Test-only access to protected engine state.
  const entities = (
    adapter as unknown as {
      entities: Map<string, Record<string, unknown>>;
    }
  ).entities;
  const byGhostIndex = new Map<number, Record<string, unknown>>();
  for (const entity of entities.values()) {
    byGhostIndex.set(entity.ghostIndex as number, entity);
  }
  return byGhostIndex;
}

function project(entity: Record<string, unknown>, comparePosition: boolean) {
  return {
    className: entity.className,
    dataBlockId: entity.dataBlockId,
    targetId: entity.targetId,
    sensorGroup: entity.sensorGroup,
    mountObjectGhostIndex: entity.mountObjectGhostIndex,
    mountNode: entity.mountNode,
    health: entity.health,
    damageState: entity.damageState,
    threads: entity.threads,
    imageSlots: entity.imageSlots,
    skinName: entity.skinName,
    ...(comparePosition
      ? { position: entity.position, rotation: entity.rotation }
      : {}),
  };
}

describe("watch catch-up equivalence", () => {
  it(
    "late joiner at block K converges with a from-start watcher",
    { timeout: 240_000, skip: !demoPath() },
    async () => {
      const buffer = fs.readFileSync(demoPath()!);
      const demo = new DemoParser(buffer);
      const { initialBlock } = await demo.load();

      // ── Relay-side simulation ──
      // Passive-observer connection state, mirroring what both the relay
      // session (syncConnectSequence) and the browser adapter use: never
      // reject on ack validation, keep the demo's receive window.
      const connectionState = {
        ...initialBlock.connectionState,
        lastSendSeq: 0x1fffffff,
      };
      const relayKit = createLiveParser({
        dataBlocks: [...initialBlock.dataBlocks.entries()].map(
          ([id, db]) => [id, db.data] as [number, Record<string, unknown>],
        ),
        ghosts: initialBlock.initialGhosts
          .filter((g) => g.type === "create" && g.classId != null)
          .map((g) => ({ index: g.index, classId: g.classId! })),
        connectionProtocolState: connectionState,
        nextRecvEventSeq: initialBlock.nextRecvEventSeq,
      });
      const sim: RelaySim = {
        parser: relayKit.packetParser,
        ghostState: new GhostStateAccumulator(),
        watchState: new WatchStateAccumulator(),
      };
      sim.ghostState.applyPacket({
        events: [],
        ghosts: initialBlock.initialGhosts,
      } as unknown as PacketData);
      for (const [id, value] of initialBlock.taggedStrings) {
        sim.watchState.netStrings.set(id, value);
      }
      sim.watchState.controlObjectGhostIndex =
        initialBlock.controlObjectGhostIndex;
      sim.watchState.controlObjectData = initialBlock.controlObjectData;
      sim.watchState.missionName = initialBlock.missionName ?? null;

      const buildPayload = (epoch: number) =>
        deserializeCatchupPayload(
          serializeCatchupPayload(
            buildCatchupPayload({
              packetParser: sim.parser,
              ghostState: sim.ghostState,
              watchState: sim.watchState,
              epoch,
              serverAddress: "test:28000",
            }),
          ),
        );

      // Reference watcher: hydrates at the very beginning (epoch 1).
      const reference = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
      reference.hydrate(buildPayload(1));

      // Collect raw packet blocks so the same bytes feed everything.
      const packets: Uint8Array[] = [];
      let block;
      while ((block = demo.nextBlock()) !== undefined) {
        if (block.type === BlockTypePacket) {
          // Copy: block.data is a transient subarray of the demo buffer.
          packets.push(block.data.slice());
        }
      }
      expect(packets.length).toBeGreaterThan(CUTOVER_BLOCKS + 1000);

      const cutover = Math.min(CUTOVER_BLOCKS, packets.length);
      const end = Math.min(cutover + CONTINUE_BLOCKS, packets.length);

      // Feed 1..K to the relay sim and the reference watcher.
      for (let i = 0; i < cutover; i++) {
        const parsed = sim.parser.parsePacket(packets[i]);
        sim.watchState.applyPacket(parsed);
        sim.ghostState.applyPacket(parsed);
        reference.feedPacket(packets[i]);
      }

      // Late joiner hydrates from the relay's state at K (epoch 2).
      const lateJoiner = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
      lateJoiner.hydrate(buildPayload(2));

      // Both continue through K+1..N.
      for (let i = cutover; i < end; i++) {
        reference.feedPacket(packets[i]);
        lateJoiner.feedPacket(packets[i]);
      }

      // ── Compare worlds ──
      const refEntities = comparableEntities(reference);
      const lateEntities = comparableEntities(lateJoiner);

      const refStable = [...refEntities.entries()].filter(
        ([, e]) => !CLIENT_SIMULATED.test(e.className as string),
      );
      const lateStableCount = [...lateEntities.values()].filter(
        (e) => !CLIENT_SIMULATED.test(e.className as string),
      ).length;
      expect(lateStableCount).toBe(refStable.length);

      for (const [ghostIndex, refEntity] of refStable) {
        const lateEntity = lateEntities.get(ghostIndex);
        expect(lateEntity, `ghost #${ghostIndex} missing`).toBeDefined();
        expect(
          project(lateEntity!, true),
          `ghost #${ghostIndex} (${refEntity.className})`,
        ).toEqual(project(refEntity, true));
      }

      // Shared state: net strings, target tables, roster/scores. Roster
      // equality doubles as a drift check on the relay's ported
      // handleServerMessage logic in watchState.
      const refShared = reference as unknown as {
        netStrings: Map<number, string>;
        targetNames: Map<number, string>;
        targetTeams: Map<number, number>;
        playerRoster: Map<number, unknown>;
        teamScores: unknown[];
        playerSensorGroup: number;
      };
      const lateShared = lateJoiner as unknown as typeof refShared;
      expect(lateShared.netStrings).toEqual(refShared.netStrings);
      expect(lateShared.targetNames).toEqual(refShared.targetNames);
      expect(lateShared.targetTeams).toEqual(refShared.targetTeams);
      expect(lateShared.playerRoster).toEqual(refShared.playerRoster);
      expect(lateShared.teamScores).toEqual(refShared.teamScores);
      expect(lateShared.playerSensorGroup).toBe(refShared.playerSensorGroup);
    },
  );
});
