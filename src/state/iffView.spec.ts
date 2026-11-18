import { afterEach, beforeEach, expect, it } from "vitest";
import {
  IFF_ENEMY,
  IFF_FRIENDLY,
  IFF_NEUTRAL,
  resolveIffDisplay,
  resolveObserverTeamColor,
} from "../iffTheme";
import type { StreamSnapshot } from "../stream/types";
import { gameEntityStore } from "./gameEntityStore";
import type { PlayerEntity, ShapeEntity } from "./gameEntityTypes";
import {
  getFlagIffDisplay,
  getIffView,
  selectIffVisibilityTarget,
} from "./iffView";
import { settingsStore } from "./settingsStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { setStreamSnapshot } from "./streamSnapshotStore";

const followed: PlayerEntity = {
  id: "followed",
  renderType: "Player",
  className: "Player",
  teamId: 2,
  iffColor: IFF_ENEMY.color,
};
const recorderTeam = { teamId: 1, iffColor: IFF_FRIENDLY.color };
const stormFlag: ShapeEntity = {
  id: "storm-flag",
  renderType: "Shape",
  className: "Item",
  teamId: 1,
};

beforeEach(() => {
  settingsStore.setState({ followTeamIff: true, firstPersonTeamIff: false });
  streamPlaybackStore.setState({
    cameraMode: "orbitOverride",
    followEntityId: followed.id,
    followFlagSlot: null,
  });
  gameEntityStore.getState().setAllStreamEntities([{ ...followed }]);
  setStreamSnapshot({ playerSensorGroup: 1 } as StreamSnapshot);
});

afterEach(() => {
  gameEntityStore.getState().clearStreamEntities();
  setStreamSnapshot(null);
  streamPlaybackStore.setState(streamPlaybackStore.getInitialState());
  settingsStore.setState(settingsStore.getInitialState());
});

it("uses the selected player's team over the recorder's original affiliations", () => {
  const view = getIffView();
  expect(resolveIffDisplay(followed, view)).toBe(IFF_FRIENDLY);
  expect(resolveIffDisplay(recorderTeam, view)).toBe(IFF_ENEMY);
  expect(resolveIffDisplay({ ...followed, teamId: 0 }, view)).toBe(IFF_NEUTRAL);
  expect(getFlagIffDisplay(followed, 1)).toBe(IFF_ENEMY);
  expect(getFlagIffDisplay(followed, 2)).toBe(IFF_FRIENDLY);
});

it("colors a carried flag by ownership or possession in the recorder's view", () => {
  streamPlaybackStore.setState({ cameraMode: "original" });
  const friendlyCarrier = { ...followed, ...recorderTeam };
  expect(getFlagIffDisplay(friendlyCarrier, 2)).toBe(IFF_ENEMY);
  expect(getFlagIffDisplay(followed, 1)).toBe(IFF_FRIENDLY);
  expect(getFlagIffDisplay(stormFlag, 1)).toBe(IFF_FRIENDLY);

  settingsStore.setState({ flagColorMode: "possession" });
  expect(getFlagIffDisplay(friendlyCarrier, 2)).toBe(IFF_FRIENDLY);
  expect(getFlagIffDisplay(followed, 1)).toBe(IFF_ENEMY);
  expect(getFlagIffDisplay(stormFlag, 1)).toBe(IFF_FRIENDLY);
});

it("preserves the recorded IFF of a loose flag in the stock color mode", () => {
  streamPlaybackStore.setState({ cameraMode: "original" });
  const looseFlag = { ...stormFlag, iffColor: IFF_ENEMY.color };
  expect(getFlagIffDisplay(looseFlag, 1)).toBe(IFF_FRIENDLY);

  settingsStore.setState({ flagColorMode: "possession" });
  expect(getFlagIffDisplay(looseFlag, 1)).toBe(IFF_ENEMY);
});

it("uses the selected observer palette for the carrier or owner team", () => {
  streamPlaybackStore.setState({ cameraMode: "original" });
  setStreamSnapshot({ playerSensorGroup: 0 } as StreamSnapshot);
  settingsStore.setState({ observerTeamColors: "blueOrange" });
  expect(getFlagIffDisplay(followed, 1)).toBe(
    resolveObserverTeamColor(1, "blueOrange"),
  );
  expect(getFlagIffDisplay(followed, null)).toBe(IFF_NEUTRAL);

  settingsStore.setState({ flagColorMode: "possession" });
  expect(getFlagIffDisplay(followed, 1)).toBe(
    resolveObserverTeamColor(2, "blueOrange"),
  );
  expect(getFlagIffDisplay(followed, null)).toBe(
    resolveObserverTeamColor(2, "blueOrange"),
  );
  expect(getFlagIffDisplay(stormFlag, null)).toBe(IFF_NEUTRAL);
});

it("applies followed-player IFF colors to the team holding the flag", () => {
  settingsStore.setState({ flagColorMode: "possession" });
  expect(getFlagIffDisplay(followed, 1)).toBe(IFF_FRIENDLY);
  expect(getFlagIffDisplay(stormFlag, 1)).toBe(IFF_ENEMY);
});

it("applies the Follow and First-person preferences independently", () => {
  streamPlaybackStore.setState({ cameraMode: "firstPersonOverride" });
  expect(resolveIffDisplay(followed, getIffView())).toBe(IFF_ENEMY);
  settingsStore.setState({ followTeamIff: false, firstPersonTeamIff: true });
  expect(resolveIffDisplay(followed, getIffView())).toBe(IFF_FRIENDLY);
  streamPlaybackStore.setState({ cameraMode: "orbitOverride" });
  expect(resolveIffDisplay(followed, getIffView())).toBe(IFF_ENEMY);
  streamPlaybackStore.setState({ cameraMode: "original" });
  expect(getIffView().followedTeamId).toBeUndefined();
});

it("tracks the visible nameplate target independently of color overrides", () => {
  settingsStore.setState({ followTeamIff: false, firstPersonTeamIff: false });
  expect(getIffView().followedTeamId).toBeUndefined();
  expect(selectIffVisibilityTarget(streamPlaybackStore.getState())).toBe(
    followed.id,
  );
  streamPlaybackStore.setState({ cameraMode: "original" });
  expect(selectIffVisibilityTarget(streamPlaybackStore.getState())).toBeNull();
});

it("updates after a team change and falls back when following a flag or losing the player", () => {
  const body = gameEntityStore
    .getState()
    .streamEntities.get(followed.id) as PlayerEntity;
  expect(getIffView().followedTeamId).toBe(2);
  body.teamId = 1;
  expect(getIffView().followedTeamId).toBe(1);
  streamPlaybackStore.setState({ followFlagSlot: 2 });
  expect(getIffView().followedTeamId).toBeUndefined();
  streamPlaybackStore.setState({ followFlagSlot: null });
  gameEntityStore.getState().deleteStreamEntity(body.id);
  expect(getIffView().followedTeamId).toBeUndefined();
});
