import { describe, expect, it, afterEach } from "vitest";
import { cameraTourStore } from "./cameraTourStore";
import { commandCircuitStore } from "./commandCircuitStore";
import { demoDirectorStore } from "./demoDirectorStore";
import { isPlayerOrbitLocked, resolveCameraOwner } from "./cameraOwner";
import { gameEntityStore } from "./gameEntityStore";
import {
  followFlag,
  isFollowingPlayer,
  resolveWatchFollowTarget,
} from "./watchFollow";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "./streamPlaybackStore";

function set(tour: boolean, directing: boolean, commandCircuit: boolean) {
  cameraTourStore.setState({
    animation: tour ? ({} as never) : null,
  });
  demoDirectorStore.setState({ status: directing ? "playing" : "idle" });
  commandCircuitStore.setState({ active: commandCircuit });
}

afterEach(() => {
  set(false, false, false);
  resetStreamPlayback();
  gameEntityStore.getState().endStreaming();
});

describe("resolveCameraOwner", () => {
  it("gives the camera to local input when nothing else claims it", () => {
    set(false, false, false);
    expect(resolveCameraOwner()).toBe("input");
  });

  it("ranks tour over the director over the command circuit", () => {
    set(true, true, true);
    expect(resolveCameraOwner()).toBe("tour");
    set(false, true, true);
    expect(resolveCameraOwner()).toBe("director");
    set(false, false, true);
    expect(resolveCameraOwner()).toBe("commandCircuit");
  });
});

describe("player orbit lock", () => {
  it.each(["demo", "live"] as const)(
    "locks only player orbit in %s mode",
    (source) => {
      gameEntityStore.getState().beginStreaming(source);
      gameEntityStore
        .getState()
        .setAllStreamEntities([
          { id: "player", renderType: "Player", className: "Player" },
        ]);
      streamPlaybackStore.setState({
        cameraMode: "orbitOverride",
        followEntityId: "player",
      });
      expect(isPlayerOrbitLocked(false)).toBe(false);
      expect(isPlayerOrbitLocked(true)).toBe(true);

      // A held flag uses its carrier's view, but stays outside the player cycle.
      streamPlaybackStore.setState({ followFlagSlot: 1 });
      expect(isPlayerOrbitLocked(true)).toBe(true);
      expect(isFollowingPlayer()).toBe(false);
      streamPlaybackStore.setState({ followFlagSlot: null });

      for (const mode of [
        "original",
        "firstPersonOverride",
        "freeFly",
      ] as const) {
        streamPlaybackStore.setState({ cameraMode: mode });
        expect(isPlayerOrbitLocked(true)).toBe(false);
      }
      streamPlaybackStore.setState({ cameraMode: "orbitOverride" });
      for (const owners of [
        [true, false, false],
        [false, true, false],
        [false, false, true],
      ]) {
        set(owners[0], owners[1], owners[2]);
        expect(isPlayerOrbitLocked(true)).toBe(false);
      }
      set(false, false, false);
      streamPlaybackStore.setState({ followEntityId: "missing" });
      expect(isPlayerOrbitLocked(true)).toBe(false);
    },
  );

  it.each(["demo", "live"] as const)(
    "locks only while the followed flag has a carrier in %s mode",
    (source) => {
      gameEntityStore.getState().beginStreaming(source);
      const showFlag = () =>
        gameEntityStore
          .getState()
          .setAllStreamEntities([
            {
              id: "flag",
              renderType: "Shape",
              className: "Item",
              teamId: 1,
              targetRenderFlags: 2,
            },
          ]);
      const showCarrier = (id: string) =>
        gameEntityStore.getState().setAllStreamEntities([
          {
            id,
            renderType: "Player",
            className: "Player",
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
          },
        ]);
      showFlag();
      followFlag(1);
      expect(isPlayerOrbitLocked(true)).toBe(false);
      for (const carrier of ["first-carrier", "next-carrier"]) {
        showCarrier(carrier);
        expect(resolveWatchFollowTarget()).toBe(carrier);
        expect(isPlayerOrbitLocked(true)).toBe(true);
        expect(isPlayerOrbitLocked(false)).toBe(false);
        expect(isFollowingPlayer()).toBe(false);
        expect(streamPlaybackStore.getState().followFlagSlot).toBe(1);

        showFlag();
        expect(resolveWatchFollowTarget()).toBe("flag");
        expect(isPlayerOrbitLocked(true)).toBe(false);
      }
    },
  );
});
