import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// inputControls listens for keys on window at import.
vi.hoisted(() => vi.stubGlobal("window", new EventTarget()));
vi.mock("../state/watchFollow", () => ({
  cycleWatchFollow: vi.fn(),
  enterWatchFollow: vi.fn(),
  resolveWatchFollowTarget: vi.fn(),
  toggleFollowFirstPerson: vi.fn(),
}));

import { notifySubscribers } from "../state/inputControls";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  cycleWatchFollow,
  enterWatchFollow,
  resolveWatchFollowTarget,
  toggleFollowFirstPerson,
} from "../state/watchFollow";
import { subscribeFollowActions, syncFollowCameraMode } from "./followControls";

beforeEach(() => {
  streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
  vi.clearAllMocks();
});

describe("subscribeFollowActions", () => {
  let enabled = true;
  let unsubscribe: () => void;
  beforeEach(() => {
    enabled = true;
    unsubscribe = subscribeFollowActions(() => enabled);
  });
  afterEach(() => unsubscribe());

  it("cycles the followed player only while following", () => {
    notifySubscribers("nextPlayer");
    expect(cycleWatchFollow).not.toHaveBeenCalled();
    streamPlaybackStore.setState({ followEntityId: "p1" });
    notifySubscribers("nextPlayer");
    notifySubscribers("prevPlayerKey");
    expect(vi.mocked(cycleWatchFollow).mock.calls).toEqual([[1], [-1]]);
  });

  it("enters follow from the command circuit when not following", () => {
    notifySubscribers("observeNextPlayer");
    expect(enterWatchFollow).toHaveBeenCalledOnce();
    streamPlaybackStore.setState({ followEntityId: "p1" });
    notifySubscribers("observePrevPlayer");
    expect(cycleWatchFollow).toHaveBeenCalledExactlyOnceWith(-1);
  });

  it("does nothing while disabled", () => {
    enabled = false;
    streamPlaybackStore.setState({ followEntityId: "p1" });
    for (const action of [
      "toggleFollowFirstPerson",
      "nextPlayer",
      "prevPlayer",
      "nextPlayerKey",
      "prevPlayerKey",
      "observeNextPlayer",
      "observePrevPlayer",
    ])
      notifySubscribers(action);
    expect(toggleFollowFirstPerson).not.toHaveBeenCalled();
    expect(cycleWatchFollow).not.toHaveBeenCalled();
    expect(enterWatchFollow).not.toHaveBeenCalled();
  });

  it("stops responding once unsubscribed", () => {
    unsubscribe();
    notifySubscribers("toggleFollowFirstPerson");
    expect(toggleFollowFirstPerson).not.toHaveBeenCalled();
  });
});

describe("syncFollowCameraMode", () => {
  it("reports no follow without touching the camera mode", () => {
    expect(syncFollowCameraMode()).toBe(false);
    expect(resolveWatchFollowTarget).not.toHaveBeenCalled();
    expect(streamPlaybackStore.getState().cameraMode).toBe("original");
  });

  it("uses the follow camera while the target has a body", () => {
    streamPlaybackStore.setState({
      followEntityId: "p1",
      followCameraMode: "firstPersonOverride",
    });
    vi.mocked(resolveWatchFollowTarget).mockReturnValue("p1");
    expect(syncFollowCameraMode()).toBe(true);
    expect(streamPlaybackStore.getState().cameraMode).toBe(
      "firstPersonOverride",
    );
  });

  it("free-flies with follow still armed while the target has no body", () => {
    streamPlaybackStore.setState({
      followEntityId: "p1",
      cameraMode: "orbitOverride",
    });
    vi.mocked(resolveWatchFollowTarget).mockReturnValue(null);
    expect(syncFollowCameraMode()).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followEntityId: "p1",
    });
  });
});
