import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cameraOwner from "../state/cameraOwner";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { selectLocalCameraMode } from "../state/selectCameraMode";
import { setPreference } from "../state/settingsStore";
import {
  cancelFlagFollowHold,
  resetStreamPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import {
  enterWatchFollow,
  exitWatchFollow,
  followFlag,
} from "../state/watchFollow";
import type { ServerMessageEvent, StreamSnapshot } from "../stream/types";
import { FlagReturnFollow } from "./flagReturnFollow";

const flag = {
  id: "flag",
  teamId: 2,
  renderType: "Shape",
  className: "Item",
  targetRenderFlags: 2,
} as const;

const carrier = {
  id: "carrier",
  renderType: "Player",
  className: "Player",
  targetRenderFlags: 2,
  imageSlots: [
    { shapeName: "flag", skinName: "baseb", mountPoint: 0, dataBlockId: 1 },
  ],
} as const;

function flagEvent(
  teamId = 2,
  msgType = "MsgCTFFlagReturned",
): ServerMessageEvent {
  return {
    id: 1,
    timeSec: 10,
    msgType,
    args: [msgType, "", "", "Inferno", String(teamId)],
  };
}

function frame(
  follow: FlagReturnFollow,
  snapshot: Pick<StreamSnapshot, "serverEvents">,
  timeSec: number,
  seekNonce = 0,
  generation = 1,
  seeking = false,
) {
  follow.update(snapshot, timeSec, seekNonce, generation, seeking);
  follow.resume();
}

function trackingReturn() {
  const follow = new FlagReturnFollow();
  frame(follow, { serverEvents: [] }, 9);
  return follow;
}

function startHold() {
  setPreference("flagReturnCamera", "delay");
  const follow = trackingReturn();
  const snapshot = { serverEvents: [flagEvent()] };
  frame(follow, snapshot, 10);
  return { follow, snapshot };
}

beforeEach(() => {
  gameEntityStore.getState().beginStreaming("demo");
  gameEntityStore.getState().setAllStreamEntities([flag]);
  followFlag(2);
});

afterEach(() => {
  vi.restoreAllMocks();
  commandCircuitStore.getState().deactivate();
  setStreamSnapshot(null);
  setPreference("flagReturnCamera", "followHome");
  gameEntityStore.getState().endStreaming();
  resetStreamPlayback();
});

describe("followed flag returns", () => {
  it("keeps following by default", () => {
    const follow = trackingReturn();
    frame(follow, { serverEvents: [flagEvent()] }, 10);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "orbitOverride",
      followFlagSlot: 2,
      followEntityId: flag.id,
    });
  });

  it.each(["MsgCTFFlagReturned", "MsgCTFFlagCapped"])(
    "detaches in place when %s sends the flag home",
    (msgType) => {
      setPreference("flagReturnCamera", "holdPosition");
      const follow = trackingReturn();
      const snapshot = { serverEvents: [flagEvent(2, msgType)] };
      frame(follow, snapshot, 10);
      frame(follow, snapshot, 20);
      expect(streamPlaybackStore.getState()).toMatchObject({
        cameraMode: "freeFly",
        followFlagSlot: null,
        followEntityId: null,
      });
    },
  );

  it.each([
    flagEvent(1),
    flagEvent(1, "MsgCTFFlagCapped"),
    flagEvent(2, "MsgCTFFlagDropped"),
  ])("ignores an unrelated flag event ($msgType for team $args.4)", (event) => {
    setPreference("flagReturnCamera", "holdPosition");
    const follow = trackingReturn();
    frame(follow, { serverEvents: [event] }, 10);
    expect(streamPlaybackStore.getState().followEntityId).toBe(flag.id);
  });

  it("handles a return on the first frame after selecting a flag", () => {
    setPreference("flagReturnCamera", "holdPosition");
    exitWatchFollow();
    const follow = trackingReturn();
    expect(followFlag(2)).toBe(true);
    frame(follow, { serverEvents: [flagEvent()] }, 10);
    expect(streamPlaybackStore.getState().followEntityId).toBeNull();
  });

  it("skips seek history but handles a new return as play resumes", () => {
    setPreference("flagReturnCamera", "holdPosition");
    const follow = trackingReturn();
    const oldReturn = flagEvent();
    frame(follow, { serverEvents: [oldReturn] }, 20, 1, 2, true);
    expect(streamPlaybackStore.getState().followEntityId).toBe(flag.id);
    const newReturn = { ...oldReturn, id: 2, timeSec: 20.032 };
    frame(
      follow,
      { serverEvents: [oldReturn, newReturn] },
      20.032,
      1,
      2,
      false,
    );
    expect(streamPlaybackStore.getState().followEntityId).toBeNull();
  });

  it("holds and resumes a manual flag follow in the command circuit", () => {
    setPreference("flagReturnCamera", "delay");
    vi.spyOn(cameraOwner, "resolveCameraOwner").mockReturnValue(
      "commandCircuit",
    );
    const follow = trackingReturn();
    const snapshot = {
      serverEvents: [flagEvent(2, "MsgCTFFlagCapped")],
    };
    frame(follow, snapshot, 10);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followFlagSlot: 2,
      followEntityId: null,
    });
    frame(follow, snapshot, 12);
    expect(streamPlaybackStore.getState().followEntityId).toBe(flag.id);
  });

  it("holds for two playback seconds and restores the orbit", () => {
    streamPlaybackStore.setState({
      orbitOverrideYaw: 1,
      orbitOverridePitch: 0.5,
    });
    const { follow, snapshot } = startHold();
    frame(follow, snapshot, 11.9);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followFlagSlot: 2,
      followEntityId: null,
    });

    frame(follow, snapshot, 12);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "orbitOverride",
      followFlagSlot: 2,
      followEntityId: flag.id,
      orbitOverrideYaw: 1,
      orbitOverridePitch: 0.5,
    });
  });

  it("gives up at the deadline if the flag is out of scope", () => {
    const { follow, snapshot } = startHold();
    gameEntityStore.getState().setAllStreamEntities([]);
    frame(follow, snapshot, 12);
    gameEntityStore.getState().setAllStreamEntities([flag]);
    frame(follow, snapshot, 20);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followFlagSlot: null,
      followEntityId: null,
    });
  });

  it.each([false, true])(
    "reattaches to the current flag at the original deadline after a grab (dropped: %s)",
    (dropped) => {
      const { follow, snapshot } = startHold();
      setStreamSnapshot({
        flagTargets: [{ teamId: 2, skinName: "baseb" }],
      } as StreamSnapshot);
      gameEntityStore.getState().setAllStreamEntities([
        {
          ...carrier,
          imageSlots: [...carrier.imageSlots],
        },
      ]);
      snapshot.serverEvents.push({
        ...flagEvent(2, "MsgCTFFlagTaken"),
        id: 2,
        timeSec: 10.5,
      });
      frame(follow, snapshot, 10.5);
      if (dropped) {
        gameEntityStore
          .getState()
          .setAllStreamEntities([{ ...flag, id: "drop" }]);
        snapshot.serverEvents.push({
          ...flagEvent(2, "MsgCTFFlagDropped"),
          id: 3,
          timeSec: 11,
        });
      }
      frame(follow, snapshot, 11);
      expect(streamPlaybackStore.getState().followEntityId).toBeNull();
      frame(follow, snapshot, 12);
      expect(streamPlaybackStore.getState().followEntityId).toBe(
        dropped ? "drop" : carrier.id,
      );
    },
  );

  it.each(["MsgCTFFlagReturned", "MsgCTFFlagCapped"])(
    "restarts only once for a fresh %s, even on the frame the delay expires",
    (msgType) => {
      const { follow, snapshot } = startHold();
      snapshot.serverEvents.push({
        ...flagEvent(2, msgType),
        id: 2,
        timeSec: 12,
      });
      frame(follow, snapshot, 12);
      frame(follow, snapshot, 13.9);
      expect(streamPlaybackStore.getState().followEntityId).toBeNull();
      frame(follow, snapshot, 14);
      expect(streamPlaybackStore.getState().followEntityId).toBe(flag.id);
    },
  );

  it.each(["move", "free-fly", "other flag", "player", "original"])(
    "honors a camera action (%s) on the frame the delay expires",
    (action) => {
      const { follow, snapshot } = startHold();
      const otherFlag = { ...flag, id: "other-flag", teamId: 1 };
      const player = {
        id: "player",
        renderType: "Player",
        className: "Player",
      } as const;
      gameEntityStore
        .getState()
        .setAllStreamEntities([flag, otherFlag, player]);
      follow.update(snapshot, 12, 0, 1, false);
      if (action === "move") cancelFlagFollowHold();
      if (action === "free-fly") selectLocalCameraMode("freeFly", true);
      if (action === "other flag") followFlag(1);
      if (action === "player") enterWatchFollow(player.id);
      if (action === "original") selectLocalCameraMode("original", true);
      const selected = streamPlaybackStore.getState();
      expect(selected.followFlagSlot).not.toBe(2);
      follow.resume();
      frame(follow, snapshot, 15);
      expect(streamPlaybackStore.getState()).toBe(selected);
    },
  );

  it.each(["command circuit", "preference"])(
    "cancels the pending resume when switching %s",
    (change) => {
      const { follow, snapshot } = startHold();
      if (change === "command circuit")
        commandCircuitStore.getState().activate();
      else setPreference("flagReturnCamera", "holdPosition");
      frame(follow, snapshot, 11);
      expect(streamPlaybackStore.getState().followFlagSlot).toBeNull();
      frame(follow, snapshot, 12);
      expect(streamPlaybackStore.getState().cameraMode).toBe("freeFly");
    },
  );

  it("cancels a pending follow when the viewer exits follow or seeks", () => {
    setPreference("flagReturnCamera", "delay");
    const snapshot = { serverEvents: [flagEvent()] };
    for (const cancel of ["exit", "seek"]) {
      followFlag(2);
      const follow = trackingReturn();
      frame(follow, snapshot, 10);
      if (cancel === "exit") exitWatchFollow();
      else frame(follow, snapshot, 11, 1, 1, true);
      frame(follow, snapshot, 15, 1, 1, false);
      expect(streamPlaybackStore.getState().followFlagSlot).toBeNull();
    }
  });

  it.each(["clip", "director"] as const)(
    "leaves flag following alone while the %s owns the camera",
    (owner) => {
      setPreference("flagReturnCamera", "holdPosition");
      const follow = trackingReturn();
      vi.spyOn(cameraOwner, "resolveCameraOwner").mockReturnValue(owner);
      frame(follow, { serverEvents: [flagEvent()] }, 10);
      expect(streamPlaybackStore.getState().followEntityId).toBe(flag.id);
    },
  );

  it("recognizes a neutral flag return", () => {
    gameEntityStore
      .getState()
      .setAllStreamEntities([{ ...flag, id: "neutral-flag", teamId: 0 }]);
    expect(followFlag(1)).toBe(true);
    setPreference("flagReturnCamera", "holdPosition");
    const follow = trackingReturn();
    const neutralReturn = {
      ...flagEvent(0, "MsgRabbitFlagReturned"),
      args: [],
    };
    frame(follow, { serverEvents: [neutralReturn] }, 10);
    expect(streamPlaybackStore.getState().followFlagSlot).toBeNull();
  });
});
