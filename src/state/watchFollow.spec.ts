import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gameEntityStore } from "./gameEntityStore";
import {
  streamPlaybackStore,
  resetStreamPlayback,
} from "./streamPlaybackStore";
import type { PlayerEntity, ShapeEntity } from "./gameEntityTypes";
import {
  enterWatchFollow,
  followFlag,
  getFollowTargets,
  resolveWatchFollowTarget,
  cycleDemoCameraMode,
  cycleWatchObserverMode,
  exitToFreeFly,
} from "./watchFollow";

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
    playerName: "Alice",
    ghostIndex: Number(id),
    ...props,
  };
}

function flag(id: string, teamId: number): ShapeEntity {
  return {
    id,
    teamId,
    renderType: "Shape",
    className: "Item",
    targetRenderFlags: 2,
  };
}

beforeEach(() => {
  gameEntityStore.getState().beginStreaming("demo");
});

afterEach(() => {
  gameEntityStore.getState().endStreaming();
  resetStreamPlayback();
});

describe("free-fly transitions", () => {
  it("cycles relay demos out of first person without briefly restoring the recorded view", () => {
    gameEntityStore.getState().setAllStreamEntities([player("100", 32)]);
    exitToFreeFly();
    const modes: string[] = [];
    const unsubscribe = streamPlaybackStore.subscribe((state) => {
      modes.push(state.cameraMode);
    });
    try {
      cycleDemoCameraMode(false);
      expect(streamPlaybackStore.getState().cameraMode).toBe("orbitOverride");
      cycleDemoCameraMode(false);
      expect(streamPlaybackStore.getState().cameraMode).toBe(
        "firstPersonOverride",
      );
      cycleDemoCameraMode(false);
      expect(streamPlaybackStore.getState()).toMatchObject({
        cameraMode: "freeFly",
        followEntityId: null,
        followTargetId: null,
        followFlagSlot: null,
      });
      expect(modes).not.toContain("original");
    } finally {
      unsubscribe();
    }
  });

  it("stays in free-fly when a relay demo has no spawned players", () => {
    exitToFreeFly();
    cycleDemoCameraMode(false);
    expect(streamPlaybackStore.getState().cameraMode).toBe("freeFly");
  });

  it("preserves the recorded-view option in player-recorded demos", () => {
    gameEntityStore.getState().setAllStreamEntities([player("100", 32)]);
    enterWatchFollow("100");
    cycleDemoCameraMode(true);
    cycleDemoCameraMode(true);
    expect(streamPlaybackStore.getState().cameraMode).toBe("original");
    cycleDemoCameraMode(true);
    expect(streamPlaybackStore.getState().cameraMode).toBe("freeFly");
  });

  it("clears live/watch follow when detaching from first person or a flag", () => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([player("100", 32), flag("90", 1)]);
    enterWatchFollow("100");
    cycleWatchObserverMode();
    expect(streamPlaybackStore.getState().cameraMode).toBe(
      "firstPersonOverride",
    );
    cycleWatchObserverMode();
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followEntityId: null,
    });
    followFlag(1);
    cycleWatchObserverMode();
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followEntityId: null,
      followFlagSlot: null,
    });
  });
});

describe("target finder follow targets", () => {
  it("excludes corpses and deduplicates respawning players by stable identity", () => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([
        player("100", 32, { damageState: 1 }),
        player("101", 32),
        player("102", 32),
        player("103", -1, { playerName: "Bot" }),
        { id: "104", renderType: "Camera", className: "Camera" },
      ]);
    expect(getFollowTargets()).toMatchObject([
      { key: "player:32", label: "Alice", entityId: "102", flagSlot: null },
      { key: "entity:103", label: "Bot", entityId: "103", flagSlot: null },
    ]);
  });

  it("preserves name colors separately from searchable text, including color-only updates", () => {
    const entity = player("100", 32, {
      playerName: "PSYOP-Alice",
      playerRawName: "\x10\x0bPSYOP-\x08Alice\x11",
    });
    gameEntityStore.getState().setAllStreamEntities([entity]);
    for (const color of ["\x08", "\x0c", "\x0e"]) {
      entity.playerRawName = `\x10\x0bPSYOP-${color}Alice\x11`;
      expect(getFollowTargets()[0]).toMatchObject({
        label: "PSYOP-Alice",
        rawName: entity.playerRawName,
      });
    }
  });

  it("keeps a player's selection identity through respawn and follows their new body", () => {
    gameEntityStore.getState().setAllStreamEntities([player("100", 32)]);
    const chosen = getFollowTargets()[0];
    enterWatchFollow(chosen.entityId);
    gameEntityStore.getState().setAllStreamEntities([player("200", 32)]);
    expect(getFollowTargets()[0].key).toBe(chosen.key);
    expect(resolveWatchFollowTarget()).toBe("200");
  });

  it("keeps a flag distinct from its carrier and selects the same slot as the number key", () => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([flag("90", 1), flag("91", 2)]);
    const chosen = getFollowTargets()[0];
    expect(chosen).toEqual({
      key: "flag:1",
      label: "Storm Flag",
      entityId: "90",
      flagSlot: 1,
    });
    followFlag(chosen.flagSlot!);
    gameEntityStore.getState().setAllStreamEntities([
      player("100", 32, {
        teamId: 2,
        targetRenderFlags: 2,
        imageSlots: [
          {
            shapeName: "flag",
            skinName: "base",
            mountPoint: 0,
            dataBlockId: 1,
          },
        ],
      }),
      flag("91", 2),
    ]);
    const targets = getFollowTargets();
    expect(targets.find((t) => t.key === chosen.key)?.entityId).toBe("100");
    expect(targets.find((t) => t.key === "player:32")?.label).toBe("Alice");
    expect(resolveWatchFollowTarget()).toBe("100");
    expect(streamPlaybackStore.getState().followFlagSlot).toBe(1);
  });

  it("uses neutral-flag slots in games without flag teams", () => {
    gameEntityStore.getState().setAllStreamEntities([flag("90", 0)]);
    expect(getFollowTargets()[0]).toEqual({
      key: "flag:1",
      label: "Flag",
      entityId: "90",
      flagSlot: 1,
    });
    followFlag(1);
    expect(streamPlaybackStore.getState().followEntityId).toBe("90");
  });
});
