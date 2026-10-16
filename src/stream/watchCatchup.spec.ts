import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DemoParser,
  GhostStateAccumulator,
  createLiveParser,
  BlockTypePacket,
} from "t2-demo-parser";
import type { PacketData, PacketParser, ParsedData } from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import type { ImageSlot, ThreadState } from "./types";
import { WatchStateAccumulator } from "../../relay/watchState";
import type { ConnectionState } from "../../relay/connectionState";
import { PlayerResolver } from "../../relay/playerReference";
import { buildCatchupPayload } from "../../relay/watchCatchup";
import { GAME_PROTOCOL_VERSION } from "../../relay/shared";
import {
  CatchupDataBlockCache,
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
 * rule, a missing payload field, or a difference in how the relay and the
 * browser react to their shared ConnectionState (server names, match end,
 * the control object's sensor group).
 */

const DEMO_DIR = path.resolve(
  import.meta.dirname,
  "../../../t2-demo-parser/data",
);

/**
 * Recordings to replay: where the late joiner hydrates, how far both then
 * stream, and which shared fields (populatedFields) hold nothing at the
 * join. Every other field must hold something; between them, the cases
 * cover every field.
 */
const CASES = [
  {
    name: "a player's recording, joined mid-match",
    file: "uploads_6_SterIO_2025_LT_Pub_SH.rec",
    cutover: 15_000,
    continued: 10_000,
    emptyAtCutover: ["pendingTags", "loadInfo"],
  },
  {
    // The loading screen, and skin strings still in flight at the join.
    name: "a recording from connect",
    file: "auto-capture_2025-05-16_05-04_DemoBot-Mia_CTFGame_Firestorm.rec",
    cutover: 1_500,
    continued: 3_500,
    emptyAtCutover: ["playerSensorGroup", "identities"],
  },
];

/** Client-simulated classes whose per-tick state legitimately depends on
 *  when the client joined (positions advanced locally, transient lifetimes). */
const CLIENT_SIMULATED = /Projectile|Explosion|Debris|Item|ParticleEmission/;

const fakeRelay = {} as unknown as RelayClient;

describe("live wire protocol propagation", () => {
  it("does not reuse player identities across catch-ups without connection identity metadata", () => {
    const adapter = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
    const hydrate = (name: string) => {
      const watchState = new WatchStateAccumulator();
      watchState.applyPacket({
        gameState: {},
        events: [
          {
            parsedData: {
              type: "RemoteCommandEvent",
              funcName: "ServerMessage",
              args: [
                "MsgClientJoin",
                "",
                name,
                "7",
                "32",
                "0",
                "0",
                "0",
                "1",
                "0",
              ],
            },
          },
        ],
      } as unknown as PacketData);
      const payload = buildCatchupPayload({
        packetParser: createLiveParser({
          protocolVersion: GAME_PROTOCOL_VERSION,
        }).packetParser,
        ghostState: new GhostStateAccumulator(),
        watchState,
        epoch: 1,
        serverAddress: "test:28000",
      });
      delete payload.hudState.playerIdentity;
      delete payload.hudState.targetGenerations;
      for (const player of payload.hudState.playerRoster)
        delete player.clientGeneration;
      adapter.hydrate(payload);
      const snapshot = adapter.getSnapshot();
      return new PlayerResolver(
        snapshot.playerIdentityScope!,
        snapshot.playerRoster,
        snapshot.playerTargets,
      );
    };
    const original = hydrate("Alice").reference("Alice");
    expect(hydrate("Other").resolve(original)).toBeUndefined();
    expect(hydrate("Alice").resolve(original)).toMatchObject({ name: "Alice" });
  });

  it.each([false, true])(
    "hydrates renamed carriers from a relay (legacy payload: %s)",
    (legacy) => {
      const watchState = new WatchStateAccumulator();
      const messages = [
        ["MsgClientJoin", "", "Alice", "7", "32", "0", "0", "0", "1", "0"],
        ["MsgCTFAddTeam", "", "1", "Storm", "Alice", "0"],
        ["MsgClientNameChanged", "", "Alice", "\x0cSmurf", "7"],
      ];
      watchState.applyPacket({
        gameState: {},
        events: messages.map((args) => ({
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args,
          },
        })),
      } as unknown as PacketData);
      const payload = buildCatchupPayload({
        packetParser: createLiveParser({
          protocolVersion: GAME_PROTOCOL_VERSION,
        }).packetParser,
        ghostState: new GhostStateAccumulator(),
        watchState,
        epoch: 1,
        serverAddress: "test:28000",
      });
      if (legacy) {
        delete payload.hudState.flags;
        delete payload.hudState.playerIdentity;
        delete payload.hudState.targetGenerations;
        for (const player of payload.hudState.playerRoster)
          delete player.clientGeneration;
      }
      const adapter = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
      adapter.hydrate(
        deserializeCatchupPayload(serializeCatchupPayload(payload)),
      );
      const snapshot = adapter.getSnapshot();
      const resolver = new PlayerResolver(
        snapshot.playerIdentityScope!,
        snapshot.playerRoster,
        snapshot.playerTargets,
      );
      expect(resolver.display(snapshot.flags![0].carrier!)).toMatchObject({
        name: "Smurf",
        rawName: "\x0cSmurf",
      });
      expect(snapshot.playerRoster[0].guid).toBeUndefined();
      expect(snapshot.teamScores[0].flag).toBe(snapshot.flags![0]);
    },
  );

  it("carries the playhead's mission sequence through catch-up and resets same-map games", () => {
    const watchState = new WatchStateAccumulator();
    watchState.applyMissionStart("MissionStartPhase1", ["21", "Katabatic"]);
    watchState.matchStarted = true;
    expect(
      watchState.applyMissionStart("MissionStartPhase3", ["21", "Katabatic"]),
    ).toBe(false);
    expect(watchState.matchStarted).toBe(true);
    const payload = buildCatchupPayload({
      packetParser: createLiveParser({ protocolVersion: GAME_PROTOCOL_VERSION })
        .packetParser,
      ghostState: new GhostStateAccumulator(),
      watchState,
      epoch: 1,
      serverAddress: "test:28000",
    });
    const adapter = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
    adapter.onMissionIdentity = vi.fn();
    adapter.onMissionChange = vi.fn();
    adapter.hydrate(
      deserializeCatchupPayload(serializeCatchupPayload(payload)),
    );
    expect(adapter.missionSequence).toBe("21");
    expect(adapter.onMissionIdentity).toHaveBeenLastCalledWith(
      "21",
      "Katabatic",
    );
    expect(
      watchState.applyMissionStart("MissionStartPhase1", ["22", "Katabatic"]),
    ).toBe(true);
    expect(watchState.matchStarted).toBe(false);
    const handle = adapter as unknown as {
      handleRelayCommands(event: { funcName: string; args: string[] }): void;
    };
    handle.handleRelayCommands({
      funcName: "MissionStartPhase1",
      args: ["22", "Katabatic"],
    });
    expect(adapter.onMissionChange).toHaveBeenCalledTimes(2);
    expect(adapter.onMissionIdentity).toHaveBeenLastCalledWith(
      "22",
      "Katabatic",
    );
    expect(adapter.missionSequence).toBe("22");
  });

  it("hydrates the loading-screen text the relay saw before MissionStartPhase1", () => {
    const watchState = new WatchStateAccumulator();
    watchState.applyPacket({
      gameState: {},
      events: [
        ["MsgLoadInfo", "", "Surreal", "Surreal", "Capture the Flag"],
        ["MsgLoadRulesLine", "", "R1"],
        ["MsgLoadInfoDone", ""],
      ].map((args) => ({
        parsedData: {
          type: "RemoteCommandEvent",
          funcName: "ServerMessage",
          args,
        },
      })),
    } as unknown as PacketData);
    watchState.applyMissionStart("MissionStartPhase1", ["3", "Surreal"]);
    const payload = buildCatchupPayload({
      packetParser: createLiveParser({ protocolVersion: GAME_PROTOCOL_VERSION })
        .packetParser,
      ghostState: new GhostStateAccumulator(),
      watchState,
      epoch: 1,
      serverAddress: "test:28000",
    });
    const adapter = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
    adapter.hydrate(
      deserializeCatchupPayload(serializeCatchupPayload(payload)),
    );
    expect(adapter.getSnapshot().loadInfo).toEqual({
      quoteLines: [],
      objectiveLines: [],
      rulesLines: ["R1"],
    });
  });

  const parserOf = (adapter: LiveStreamAdapter) =>
    (adapter as unknown as { packetParser: PacketParser }).packetParser;

  it("starts direct play with the protocol the relay requests", () => {
    expect(
      parserOf(new LiveStreamAdapter(fakeRelay)).getProtocolVersion(),
    ).toBe(GAME_PROTOCOL_VERSION);
  });

  it("preserves player admin privileges through catch-up serialization and hydration", () => {
    const watchState = new WatchStateAccumulator();
    watchState.applyPacket({
      gameState: {},
      events: [
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args: ["MsgClientJoin", "", "Admin", "7", "-1", "0", "1", "1"],
          },
        },
      ],
    } as unknown as PacketData);
    const payload = buildCatchupPayload({
      packetParser: createLiveParser({ protocolVersion: GAME_PROTOCOL_VERSION })
        .packetParser,
      ghostState: new GhostStateAccumulator(),
      watchState,
      epoch: 1,
      serverAddress: "test:28000",
    });
    const adapter = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
    adapter.hydrate(
      deserializeCatchupPayload(serializeCatchupPayload(payload)),
    );
    expect(adapter.getSnapshot().playerRoster).toEqual([
      expect.objectContaining({
        clientId: 7,
        isAdmin: true,
        isSuperAdmin: true,
      }),
    ]);
  });

  it("preserves the exported version through serialization, late joins and reconnects", () => {
    const adapter = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
    for (const [i, version] of [52, 51, null, 52, undefined].entries()) {
      const payload = buildCatchupPayload({
        packetParser: createLiveParser({ protocolVersion: version })
          .packetParser,
        ghostState: new GhostStateAccumulator(),
        watchState: new WatchStateAccumulator(),
        epoch: i + 1,
        serverAddress: "test:28000",
      });
      // Older relays omitted the field; explicit null denotes demo-derived state.
      if (version === undefined) delete payload.protocolVersion;
      adapter.hydrate(
        deserializeCatchupPayload(serializeCatchupPayload(payload)),
      );
      expect(parserOf(adapter).getProtocolVersion()).toBe(
        version === undefined ? GAME_PROTOCOL_VERSION : version,
      );
    }
  });
});

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

function targetInfo(entity: Record<string, unknown>) {
  return {
    targetId: entity.targetId,
    playerName: entity.playerName,
    playerRawName: entity.playerRawName,
    targetTypeName: entity.targetTypeName,
    sensorGroup: entity.sensorGroup,
    targetRenderFlags: entity.targetRenderFlags,
    skinName: entity.skinName,
    skinPrefName: entity.skinPrefName,
  };
}

function project(entity: Record<string, unknown>, comparePosition: boolean) {
  return {
    className: entity.className,
    dataBlockId: entity.dataBlockId,
    ...targetInfo(entity),
    mountObjectGhostIndex: entity.mountObjectGhostIndex,
    mountNode: entity.mountNode,
    health: entity.health,
    damageState: entity.damageState,
    // Catch-up carries wire state, not the client's earlier animation clocks
    // or RNG. Demo seeking separately tests those against the full history.
    threads: (entity.threads as ThreadState[] | undefined)?.map(
      ({ timeline, ...wire }) => wire,
    ),
    imageSlots: (
      entity.imageSlots as (ImageSlot | undefined)[] | undefined
    )?.map((slot) => {
      if (!slot) return slot;
      const {
        animation: _animation,
        mountedAtSec: _mountedAtSec,
        ...wire
      } = slot;
      return wire;
    }),
    ...(comparePosition
      ? { position: entity.position, rotation: entity.rotation }
      : {}),
  };
}

/**
 * Connection state a late joiner must share with a from-start watcher.
 * Clock anchors and flag drop times depend on when each heard them (the
 * relay keeps wall time), so only durations and dropped teams compare.
 */
function sharedState(adapter: LiveStreamAdapter) {
  const { conn } = adapter as unknown as { conn: ConnectionState };
  const { clock, flagDroppedAtSec, matchEndedAtSec, ...state } = conn.save();
  return {
    ...state,
    clockDurationMs: clock?.durationMs ?? null,
    flagDropTeams: Object.keys(flagDroppedAtSec).sort(),
    matchEnded: matchEndedAtSec != null,
    loadInfo: conn.loadInfo.info,
  };
}

/**
 * Which shared fields hold something, so comparing them means something.
 */
function populatedFields(state: ReturnType<typeof sharedState>) {
  const { targets } = state;
  return {
    netStrings: state.netStrings.size > 0,
    targets: [
      targets.rawNames,
      targets.types,
      targets.skins,
      targets.teams,
      targets.renderFlags,
    ].every((values) => values.size > 0),
    targetGenerations: targets.generations.size > 0,
    pendingTags: [
      targets.pendingNameTags,
      targets.pendingTypeTags,
      targets.pendingSkinTags,
      targets.pendingSkinPrefTags,
    ].some((tags) => tags.size > 0),
    sensorGroupColors: state.sensorGroupColors.size > 0,
    playerSensorGroup: state.playerSensorGroup > 0,
    roster: state.playerRoster.size > 0,
    teamScores: state.teamScores.length > 0,
    flags: state.flags.size > 0,
    flagDrops: state.flagDropTeams.length > 0,
    identities: (state.playerIdentity.generations?.size ?? 0) > 0,
    clock: state.clockDurationMs != null,
    missionInfo: [
      state.missionDisplayName,
      state.missionTypeDisplayName,
      state.gameClassName,
      state.serverDisplayName,
    ].every(Boolean),
    loadInfo: state.loadInfo != null,
  };
}

/**
 * Server state the recordings don't exercise by the join: a mission drop
 * with a server name, CTF teams, a dropped flag and a freed target.
 */
function serverStateBurst(unusedTargetId: number): ParsedData[] {
  return [
    ...[
      ["MsgClientReady", "", "CTFGame"],
      ["MsgMissionDropInfo", "", "Test Mission", "Capture the Flag", "Server"],
      ["MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0"],
      ["MsgCTFAddTeam", "", "2", "Inferno", "<At Base>", "0"],
      ["MsgCTFFlagDropped", "", "Somebody", "Inferno", "2"],
    ].map((args) => ({
      type: "RemoteCommandEvent",
      funcName: "ServerMessage",
      args,
    })),
    { type: "TargetFreeEvent", targetId: unusedTargetId },
  ];
}

describe("watch catch-up equivalence", () => {
  it.for(CASES)(
    "late joiner at block $cutover converges with a from-start watcher ($name)",
    { timeout: 240_000 },
    async (
      { file, cutover: cutoverBlocks, continued, emptyAtCutover },
      context,
    ) => {
      const demoFile = path.join(DEMO_DIR, file);
      if (!fs.existsSync(demoFile)) context.skip();
      const buffer = fs.readFileSync(demoFile);
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
      // Seeded like a demo's own start (DemoStreamAdapter.resetToStart).
      const relayState = (
        sim.watchState as unknown as { state: ConnectionState }
      ).state;
      relayState.seedTables({
        taggedStrings: initialBlock.taggedStrings,
        targetEntries: initialBlock.targetEntries.map((entry) => ({
          ...entry,
          typeDescription: entry.typeDescription ?? "",
        })),
        sensorGroupColors: initialBlock.sensorGroupColors,
      });
      sim.watchState.playerSensorGroup = initialBlock.sensorGroup;
      sim.watchState.controlObjectGhostIndex =
        initialBlock.controlObjectGhostIndex;
      sim.watchState.controlObjectData = initialBlock.controlObjectData;
      sim.watchState.missionName = initialBlock.missionName ?? null;

      const dataBlockCache = new CatchupDataBlockCache();
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
            dataBlockCache,
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
      expect(packets.length).toBeGreaterThan(cutoverBlocks + 1000);

      const cutover = Math.min(cutoverBlocks, packets.length);
      const end = Math.min(cutover + continued, packets.length);

      // Feed 1..K to the relay sim and the reference watcher.
      for (let i = 0; i < cutover; i++) {
        const parsed = sim.parser.parsePacket(packets[i]);
        sim.watchState.applyPacket(parsed);
        sim.ghostState.applyPacket(parsed);
        reference.feedPacket(packets[i]);
      }
      // The same burst for the relay and the reference, just before K.
      const targetIds = sim.watchState
        .getTargetEntries()
        .map((entry) => entry.targetId);
      const burst = serverStateBurst(Math.max(-1, ...targetIds) + 1);
      sim.watchState.applyPacket({
        gameState: {},
        ghosts: [],
        events: burst.map((parsedData) => ({ parsedData })),
      } as unknown as PacketData);
      const engine = reference as unknown as {
        processEvent(
          event: { classId: number; parsedData: ParsedData },
          eventName: undefined,
        ): void;
      };
      for (const parsedData of burst)
        engine.processEvent({ classId: 0, parsedData }, undefined);

      // Late joiner hydrates from the relay's state at K (epoch 2).
      const lateJoiner = new LiveStreamAdapter(fakeRelay, { mode: "watch" });
      lateJoiner.hydrate(buildPayload(2));
      // The catch-up alone carries the whole connection state.
      const populated = populatedFields(sharedState(reference));
      expect(
        Object.entries(populated)
          .filter(([, isPopulated]) => !isPopulated)
          .map(([field]) => field),
      ).toEqual(emptyAtCutover);
      expect(sharedState(lateJoiner)).toEqual(sharedState(reference));
      expect(lateJoiner.getSnapshot().flagTargets).toEqual(
        reference.getSnapshot().flagTargets,
      );

      // Catch-up must carry target metadata immediately; subsequent packets
      // must not be needed to repair missing names, types, skins or flag bits.
      const hydratedEntities = comparableEntities(lateJoiner);
      for (const [ghostIndex, entity] of comparableEntities(reference)) {
        if (CLIENT_SIMULATED.test(entity.className as string)) continue;
        const hydrated = hydratedEntities.get(ghostIndex);
        expect(hydrated, `hydrated ghost #${ghostIndex} missing`).toBeDefined();
        expect(targetInfo(hydrated!)).toEqual(targetInfo(entity));
      }

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

      // And all the connection state again, after both streamed on.
      expect(sharedState(lateJoiner)).toEqual(sharedState(reference));
      expect(lateJoiner.getSnapshot().flagTargets).toEqual(
        reference.getSnapshot().flagTargets,
      );
    },
  );
});
