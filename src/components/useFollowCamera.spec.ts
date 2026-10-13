import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFollowCamera } from "./useFollowCamera";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { demoDirectorStore } from "../state/demoDirectorStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { resolveWatchFollowTarget } from "../state/watchFollow";
import { streamEntityToGameEntity } from "../stream/entityBridge";
import type { PlayerEntity } from "../state/gameEntityTypes";
import type { PlayerRosterEntry, StreamSnapshot } from "../stream/types";

vi.mock("../state/gameEntityStore", async (original) => {
  const actual = await original<typeof import("../state/gameEntityStore")>();
  return {
    ...actual,
    useDataSource: () => actual.gameEntityStore.getState().dataSource,
  };
});
vi.mock("../state/liveConnectionStore", async (original) => {
  const actual =
    await original<typeof import("../state/liveConnectionStore")>();
  return {
    ...actual,
    useLiveSelector: (
      select: (
        state: ReturnType<typeof actual.liveConnectionStore.getState>,
      ) => unknown,
    ) => select(actual.liveConnectionStore.getState()),
  };
});

const alice: PlayerRosterEntry = {
  clientId: 7,
  clientGeneration: 1,
  targetId: 32,
  name: "Alice",
  rawName: "Alice",
  teamId: 1,
  score: 0,
  ping: 0,
  packetLoss: 0,
};

function body(id: string, targetId = 32): PlayerEntity {
  return {
    id,
    renderType: "Player",
    className: "Player",
    targetId,
    targetGeneration: 0,
    playerName: "Alice",
    damageState: 0,
  };
}

beforeEach(() => {
  gameEntityStore.getState().beginStreaming("demo");
  setStreamSnapshot({
    playerIdentityScope: "demo",
    playerRoster: [alice],
  } as StreamSnapshot);
  gameEntityStore.getState().setAllStreamEntities([body("original")]);
});
afterEach(() => {
  resetStreamPlayback();
  setStreamSnapshot(null);
  gameEntityStore.getState().endStreaming();
  commandCircuitStore.getState().deactivate();
  cameraTourStore.getState().cancel();
  demoDirectorStore.setState({ status: "idle" });
  liveConnectionStore.setState({ role: null, liveReady: false });
});

it("takes over third-person follow from first person, CC, tours and the director", () => {
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followCameraMode: "firstPersonOverride",
  });
  commandCircuitStore.getState().activate();
  cameraTourStore
    .getState()
    .flyTo({ entityId: "tour", label: "Tour", position: [0, 0, 0] });
  demoDirectorStore.setState({ status: "playing" });
  expect(useFollowCamera().followPlayer(alice)).toBe(true);
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "orbitOverride",
    followCameraMode: "orbitOverride",
    followEntityId: "original",
    followFlagSlot: null,
  });
  expect(commandCircuitStore.getState().active).toBe(false);
  expect(cameraTourStore.getState().animation).toBeNull();
  expect(demoDirectorStore.getState().status).toBe("ready");
});

it("selects a GUID-less player by identity, even when another player has the same name", () => {
  setStreamSnapshot({
    playerIdentityScope: "demo",
    playerRoster: [alice, { ...alice, clientId: 8, targetId: 33 }],
  } as StreamSnapshot);
  gameEntityStore
    .getState()
    .setAllStreamEntities([body("other", 33), body("chosen")]);
  useFollowCamera().followPlayer(alice);
  expect(streamPlaybackStore.getState().followEntityId).toBe("chosen");
});

it("waits for a missing body and follows the selected player through renaming and respawning", () => {
  gameEntityStore.getState().setAllStreamEntities([]);
  expect(useFollowCamera().followPlayer(alice)).toBe(true);
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "freeFly",
    followEntityId: null,
    followPlayer: { clientId: 7 },
  });
  setStreamSnapshot({
    playerIdentityScope: "demo",
    playerRoster: [{ ...alice, name: "Renamed", rawName: "Renamed" }],
  } as StreamSnapshot);
  gameEntityStore.getState().setAllStreamEntities([body("respawn")]);
  expect(resolveWatchFollowTarget()).toBe("respawn");
  expect(streamPlaybackStore.getState().cameraMode).toBe("orbitOverride");
  gameEntityStore.getState().setAllStreamEntities([body("next")]);
  expect(resolveWatchFollowTarget()).toBe("next");
});

it("follows the requested team's flag and keeps tracking it when picked up", () => {
  setStreamSnapshot({
    teamScores: [
      { teamId: 1, name: "Storm", skinName: "base" },
      { teamId: 2, name: "Inferno", skinName: "baseb" },
    ],
  } as StreamSnapshot);
  const flag = (id: string, teamId: number) =>
    streamEntityToGameEntity({
      id,
      type: "Item",
      className: "Item",
      targetRenderFlags: 2,
      teamId,
    });
  gameEntityStore
    .getState()
    .setAllStreamEntities([flag("flag1", 1), flag("flag2", 2)]);
  expect(useFollowCamera().followFlag(2)).toBe(true);
  expect(streamPlaybackStore.getState()).toMatchObject({
    followFlagSlot: 2,
    followEntityId: "flag2",
    cameraMode: "orbitOverride",
  });
  gameEntityStore.getState().setAllStreamEntities([
    {
      ...body("carrier"),
      targetRenderFlags: 2,
      teamId: 1,
      imageSlots: [
        { shapeName: "flag", skinName: "baseb", mountPoint: 0, dataBlockId: 1 },
      ],
    },
  ]);
  expect(resolveWatchFollowTarget()).toBe("carrier");
});

it("leaves the camera alone when a flag is unavailable", () => {
  const before = streamPlaybackStore.getState();
  expect(useFollowCamera().followFlag(2)).toBe(false);
  expect(streamPlaybackStore.getState()).toBe(before);
});

it.each([
  { role: "player" as const, liveReady: true, enabled: false },
  { role: "watcher" as const, liveReady: false, enabled: false },
  { role: "watcher" as const, liveReady: true, enabled: true },
])(
  "enables live camera changes: $role, ready=$liveReady → $enabled",
  ({ role, liveReady, enabled }) => {
    gameEntityStore.getState().beginStreaming("live");
    liveConnectionStore.setState({ role, liveReady });
    const before = streamPlaybackStore.getState();
    const actions = useFollowCamera();
    expect(actions.enabled).toBe(enabled);
    expect(actions.followPlayer(alice)).toBe(enabled);
    if (!enabled) expect(streamPlaybackStore.getState()).toBe(before);
  },
);
