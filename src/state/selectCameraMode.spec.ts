import { afterEach, beforeEach, expect, it } from "vitest";
import { gameEntityStore } from "./gameEntityStore";
import type { PlayerEntity, ShapeEntity } from "./gameEntityTypes";
import {
  cycleLocalCameraPlayer,
  getLocalCameraCapabilities,
  selectLocalCameraMode,
} from "./selectCameraMode";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "./streamPlaybackStore";
import { enterWatchFollow, followFlag } from "./watchFollow";

function player(
  id: string,
  targetId: number,
  props: Partial<PlayerEntity> = {},
): PlayerEntity {
  return {
    id,
    targetId,
    renderType: "Player",
    className: "Player",
    playerName: id,
    ghostIndex: Number(id),
    ...props,
  };
}

function flag(): ShapeEntity {
  return {
    id: "90",
    teamId: 1,
    renderType: "Shape",
    className: "Item",
    targetRenderFlags: 2,
  };
}

beforeEach(() => {
  resetStreamPlayback();
  gameEntityStore.getState().beginStreaming("demo");
});

afterEach(() => {
  gameEntityStore.getState().endStreaming();
  resetStreamPlayback();
});

it("selects first person directly using the existing default player selection", () => {
  gameEntityStore
    .getState()
    .setAllStreamEntities([player("100", 2), player("200", 1)]);
  streamPlaybackStore.setState({ cameraMode: "original" });
  const modes: string[] = [];
  const unsubscribe = streamPlaybackStore.subscribe((state) => {
    modes.push(state.cameraMode);
  });
  try {
    expect(selectLocalCameraMode("firstPersonOverride", true)).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "firstPersonOverride",
      followCameraMode: "firstPersonOverride",
      followEntityId: "200",
      followTargetId: 1,
    });
    expect(new Set(modes)).toEqual(
      new Set(["original", "firstPersonOverride"]),
    );
  } finally {
    unsubscribe();
  }
});

it("preserves the current player's orbit when changing perspective or reselecting", () => {
  gameEntityStore.getState().setAllStreamEntities([player("100", 32)]);
  enterWatchFollow("100");
  streamPlaybackStore.setState({
    orbitOverrideYaw: 1.2,
    orbitOverridePitch: 0.3,
  });
  for (const mode of [
    "firstPersonOverride",
    "firstPersonOverride",
    "orbitOverride",
  ] as const) {
    expect(selectLocalCameraMode(mode, true)).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: mode,
      followCameraMode: mode,
      followEntityId: "100",
      orbitOverrideYaw: 1.2,
      orbitOverridePitch: 0.3,
    });
  }
});

it("resumes the remembered player's replacement body after leaving follow", () => {
  gameEntityStore
    .getState()
    .setAllStreamEntities([player("100", 1), player("200", 2)]);
  enterWatchFollow("200");
  selectLocalCameraMode("freeFly", true);
  gameEntityStore
    .getState()
    .setAllStreamEntities([player("100", 1), player("300", 2)]);
  expect(selectLocalCameraMode("orbitOverride", true)).toBe(true);
  expect(streamPlaybackStore.getState().followEntityId).toBe("300");
});

it("keeps flag follow in orbit and never changes it to first person", () => {
  gameEntityStore.getState().setAllStreamEntities([player("100", 32), flag()]);
  followFlag(1);
  streamPlaybackStore.setState({ orbitOverrideYaw: 0.7 });
  expect(getLocalCameraCapabilities()).toEqual({
    canFollow: true,
    canFirstPerson: false,
    canCyclePlayers: true,
  });
  expect(selectLocalCameraMode("firstPersonOverride", true)).toBe(false);
  expect(selectLocalCameraMode("orbitOverride", true)).toBe(true);
  expect(streamPlaybackStore.getState()).toMatchObject({
    followEntityId: "90",
    followFlagSlot: 1,
    cameraMode: "orbitOverride",
    orbitOverrideYaw: 0.7,
  });
});

it("permits an existing flag orbit without any players", () => {
  gameEntityStore.getState().setAllStreamEntities([flag()]);
  followFlag(1);
  expect(getLocalCameraCapabilities()).toEqual({
    canFollow: true,
    canFirstPerson: false,
    canCyclePlayers: false,
  });
  expect(selectLocalCameraMode("orbitOverride", true)).toBe(true);
});

it("rejects follow without a living eligible player without mutating the mode", () => {
  gameEntityStore
    .getState()
    .setAllStreamEntities([player("100", 32, { damageState: 1 }), flag()]);
  streamPlaybackStore.setState({ cameraMode: "freeFly" });
  expect(getLocalCameraCapabilities()).toEqual({
    canFollow: false,
    canFirstPerson: false,
    canCyclePlayers: false,
  });
  const state = streamPlaybackStore.getState();
  expect(selectLocalCameraMode("firstPersonOverride", true)).toBe(false);
  expect(selectLocalCameraMode("orbitOverride", true)).toBe(false);
  expect(streamPlaybackStore.getState()).toBe(state);
});

it("checks target eligibility again when selecting after a player disappears", () => {
  gameEntityStore.getState().setAllStreamEntities([player("100", 32)]);
  expect(getLocalCameraCapabilities().canFollow).toBe(true);
  gameEntityStore.getState().setAllStreamEntities([]);
  expect(selectLocalCameraMode("orbitOverride", true)).toBe(false);
});

it.each(["freeFly", "original"] as const)(
  "clears an armed respawn follow when selecting %s",
  (mode) => {
    gameEntityStore.getState().setAllStreamEntities([player("100", 32)]);
    enterWatchFollow("100");
    streamPlaybackStore.setState({
      cameraMode: "freeFly",
      followEntityId: null,
      followCameraMode: "firstPersonOverride",
    });
    expect(selectLocalCameraMode(mode, true)).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: mode,
      followPlayer: null,
      followEntityId: null,
      followTargetId: null,
      followFlagSlot: null,
      followCameraMode: "orbitOverride",
      lastFollowTargetId: 32,
    });
  },
);

it("selects original without passing through another camera mode", () => {
  gameEntityStore.getState().setAllStreamEntities([player("100", 32)]);
  enterWatchFollow("100");
  const modes: string[] = [];
  const unsubscribe = streamPlaybackStore.subscribe((state) => {
    modes.push(state.cameraMode);
  });
  try {
    expect(selectLocalCameraMode("original", true)).toBe(true);
    expect(modes).toEqual(["original"]);
  } finally {
    unsubscribe();
  }
});

it("rejects an unsupported original view without changing state", () => {
  const state = streamPlaybackStore.getState();
  expect(selectLocalCameraMode("original", false)).toBe(false);
  expect(streamPlaybackStore.getState()).toBe(state);
});

it.each([
  ["original", 1, "200"],
  ["original", -1, "100"],
  ["freeFly", 1, "200"],
  ["freeFly", -1, "100"],
] as const)(
  "starts player orbit from %s in direction %s without skipping a player",
  (cameraMode, direction, expectedPlayer) => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([
        player("100", 3),
        player("200", 1),
        player("300", 2),
      ]);
    streamPlaybackStore.setState({
      cameraMode,
      followCameraMode: "firstPersonOverride",
      lastFollowTargetId: 2,
    });
    expect(getLocalCameraCapabilities().canCyclePlayers).toBe(true);
    expect(cycleLocalCameraPlayer(direction)).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "orbitOverride",
      followCameraMode: "orbitOverride",
      followEntityId: expectedPlayer,
      followFlagSlot: null,
    });
  },
);

it.each([
  ["orbitOverride", 1, "100"],
  ["orbitOverride", -1, "201"],
  ["firstPersonOverride", 1, "100"],
  ["firstPersonOverride", -1, "201"],
] as const)(
  "preserves %s when cycling direction %s in stable player order",
  (cameraMode, direction, expectedPlayer) => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([
        player("100", 3, { playerName: "Alice" }),
        player("200", 1, { playerName: "Zoe" }),
        player("201", 1, { playerName: "Zoe" }),
        player("300", 2, { playerName: "Mary" }),
        player("400", 4, { damageState: 1 }),
      ]);
    enterWatchFollow("300");
    streamPlaybackStore.setState({ cameraMode, followCameraMode: cameraMode });
    expect(cycleLocalCameraPlayer(direction)).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode,
      followCameraMode: cameraMode,
      followEntityId: expectedPlayer,
      followFlagSlot: null,
    });
  },
);

it.each([
  [1, "100"],
  [-1, "300"],
] as const)(
  "leaves a flag item for player orbit in direction %s",
  (direction, expectedPlayer) => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([
        player("100", 1),
        player("200", 2),
        player("300", 3),
        flag(),
      ]);
    followFlag(1);
    expect(cycleLocalCameraPlayer(direction)).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "orbitOverride",
      followCameraMode: "orbitOverride",
      followEntityId: expectedPlayer,
      followFlagSlot: null,
    });
    expect(streamPlaybackStore.getState().followPlayer).not.toBeNull();
  },
);

it.each([
  [1, "200"],
  [-1, "300"],
] as const)(
  "leaves flag-carrier tracking for the adjacent player in direction %s",
  (direction, expectedPlayer) => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([
        player("100", 1, { teamId: 1, targetRenderFlags: 2 }),
        player("200", 2),
        player("300", 3),
      ]);
    followFlag(1);
    expect(streamPlaybackStore.getState().followEntityId).toBe("100");
    expect(cycleLocalCameraPlayer(direction)).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "orbitOverride",
      followCameraMode: "orbitOverride",
      followEntityId: expectedPlayer,
      followFlagSlot: null,
    });
    expect(streamPlaybackStore.getState().followPlayer).not.toBeNull();
  },
);

it("cycles past a respawned player by stable identity while preserving first person", () => {
  gameEntityStore.getState().setAllStreamEntities([player("200", 2)]);
  enterWatchFollow("200");
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followCameraMode: "firstPersonOverride",
  });
  gameEntityStore
    .getState()
    .setAllStreamEntities([
      player("100", 1),
      player("200", 2, { damageState: 1 }),
      player("201", 2),
      player("300", 3),
    ]);
  expect(cycleLocalCameraPlayer(1)).toBe(true);
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "firstPersonOverride",
    followCameraMode: "firstPersonOverride",
    followEntityId: "300",
    followTargetId: 3,
  });
});

it("enters orbit when cycling from a paused, unresolved respawn follow", () => {
  gameEntityStore.getState().setAllStreamEntities([player("200", 2)]);
  enterWatchFollow("200");
  streamPlaybackStore.setState({
    cameraMode: "freeFly",
    followEntityId: null,
    followCameraMode: "firstPersonOverride",
  });
  gameEntityStore
    .getState()
    .setAllStreamEntities([
      player("100", 1),
      player("201", 2),
      player("300", 3),
    ]);
  expect(cycleLocalCameraPlayer(1)).toBe(true);
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "orbitOverride",
    followCameraMode: "orbitOverride",
    followEntityId: "300",
    followTargetId: 3,
    followFlagSlot: null,
  });
});

it.each([1, -1] as const)(
  "leaves a flag view unchanged when no living players can cycle (%s)",
  (direction) => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([player("100", 1, { damageState: 1 }), flag()]);
    followFlag(1);
    const state = streamPlaybackStore.getState();
    expect(getLocalCameraCapabilities().canCyclePlayers).toBe(false);
    expect(cycleLocalCameraPlayer(direction)).toBe(false);
    expect(streamPlaybackStore.getState()).toBe(state);
  },
);

it("keeps an armed respawn follow unchanged when no players are available", () => {
  gameEntityStore.getState().setAllStreamEntities([player("100", 1)]);
  enterWatchFollow("100");
  streamPlaybackStore.setState({
    cameraMode: "freeFly",
    followEntityId: null,
    followCameraMode: "firstPersonOverride",
  });
  gameEntityStore.getState().setAllStreamEntities([]);
  const state = streamPlaybackStore.getState();
  expect(cycleLocalCameraPlayer(1)).toBe(false);
  expect(streamPlaybackStore.getState()).toBe(state);
});
