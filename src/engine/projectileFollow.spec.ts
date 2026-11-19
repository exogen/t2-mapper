import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import type { PlayerEntity, ShapeEntity } from "../state/gameEntityTypes";
import { notifySubscribers } from "../state/inputControls";
import { selectLocalCameraMode } from "../state/selectCameraMode";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  cycleDemoCameraMode,
  cycleWatchFollow,
  followFlag,
  resolveWatchFollowTarget,
} from "../state/watchFollow";
import { streamRenderFrame } from "../stream/interpolateEntity";
import type {
  ProjectileLifecycleEvent,
  StreamEntity,
  StreamRecording,
  StreamingPlayback,
} from "../stream/types";
import { FramePriority } from "./framePriority";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";
import {
  installProjectileFollow,
  startProjectileTracking,
} from "./projectileFollow";

vi.hoisted(() => vi.stubGlobal("window", new EventTarget()));

const callbacks = new Set<(event: ProjectileLifecycleEvent) => void>();
const stream = {
  worldGeneration: 1,
  playbackRevision: 1,
  subscribeProjectileLifecycle(
    callback: (event: ProjectileLifecycleEvent) => void,
  ) {
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  },
};
const recording = {
  source: "demo",
  streamingPlayback: stream as unknown as StreamingPlayback,
} as StreamRecording;
const player = {
  id: "player",
  playerName: "Scout",
  renderType: "Player",
  targetId: 1,
  ghostIndex: 1,
} as PlayerEntity;
const carrier = { ...player, targetRenderFlags: 2 };
const looseFlag: ShapeEntity = {
  id: "flag",
  className: "Item",
  renderType: "Shape",
  targetRenderFlags: 2,
};
const nearbyShot: StreamEntity = {
  id: "nearby",
  type: "Projectile",
  position: [1, 0, 0],
};

let scheduler: FrameScheduler;
let cleanup: () => void;
const state = streamPlaybackStore.getState;
const press = () => notifySubscribers("followProjectile");
function emit(event: ProjectileLifecycleEvent) {
  for (const callback of callbacks) callback(event);
}
function followPlayer() {
  gameEntityStore.setState({ streamEntities: new Map([[player.id, player]]) });
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followCameraMode: "firstPersonOverride",
    followEntityId: player.id,
  });
}

function followTestFlag(target: PlayerEntity | ShapeEntity) {
  gameEntityStore.getState().setAllStreamEntities([target]);
  expect(followFlag(1)).toBe(true);
  streamRenderFrame.current = new Map([[nearbyShot.id, nearbyShot]]);
}

beforeEach(() => {
  stream.worldGeneration = 1;
  stream.playbackRevision = 1;
  streamClock.time = 15;
  streamClock.matchEndedAtSec = null;
  gameEntityStore.getState().beginStreaming("demo");
  engineStore.setState((s) => ({
    playback: { ...s.playback, recording, status: "playing" },
  }));
  streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
  streamPlaybackStore.setState({
    playback: recording.streamingPlayback,
    cameraMode: "freeFly",
  });
  streamRenderFrame.current = new Map();
  streamRenderFrame.previous = null;
  streamRenderFrame.interpT = 0.5;
  scheduler = new FrameScheduler();
  const engine = {
    cameras: { perspective: new PerspectiveCamera() },
    scheduler,
    invalidate: vi.fn(),
  } as unknown as GameEngine;
  cleanup = installProjectileFollow(engine);
});

afterEach(() => {
  cleanup();
  expect(callbacks.size).toBe(0);
  engineStore.setState(engineStore.getInitialState(), true);
  gameEntityStore.getState().endStreaming();
  streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
  streamRenderFrame.current = null;
  streamRenderFrame.previous = null;
});

it("stays armed across perspective changes and tracks the same player's next eligible projectile", () => {
  followPlayer();
  press();
  expect(state().cameraMode).toBe("firstPersonOverride");
  const armed = state().projectileFollow;
  expect(armed).toMatchObject({
    kind: "armed",
    playerId: player.id,
  });
  cycleDemoCameraMode(false, -1);
  expect(state().cameraMode).toBe("orbitOverride");
  expect(state().projectileFollow).toBe(armed);
  expect(selectLocalCameraMode("firstPersonOverride", false)).toBe(true);
  expect(state().cameraMode).toBe("firstPersonOverride");
  expect(state().projectileFollow).toBe(armed);
  expect(callbacks.size).toBe(1);

  const spawn = { type: "spawn", timeSec: 15.2 } as const;
  emit({
    ...spawn,
    id: "other",
    sourceEntityId: "another-player",
  });
  emit({
    ...spawn,
    id: "old",
    sourceEntityId: player.id,
    launchTimeSec: 14,
  });
  expect(state().projectileFollow?.kind).toBe("armed");
  emit({
    ...spawn,
    id: "shot",
    sourceEntityId: player.id,
  });
  expect(state()).toMatchObject({
    cameraMode: "orbitOverride",
    followEntityId: null,
    projectileFollow: {
      kind: "tracking",
      projectileId: "shot",
      sourceName: "Scout",
    },
  });
  emit({ type: "end", id: "old", timeSec: 15.3, position: [0, 0, 0] });
  expect(state().projectileFollow).not.toHaveProperty("terminalPosition");
  emit({ type: "end", id: "shot", timeSec: 15.4, position: [10, 5, 1] });
  expect(state().projectileFollow).toMatchObject({
    terminalPosition: [10, 5, 1],
  });
  press();
  expect(state()).toMatchObject({
    cameraMode: "freeFly",
    projectileFollow: null,
  });
});

it("ignores P while following a loose flag even with a projectile nearby", () => {
  followTestFlag(looseFlag);
  press();
  expect(state()).toMatchObject({
    followFlagSlot: 1,
    followEntityId: looseFlag.id,
    projectileFollow: null,
  });
  expect(callbacks.size).toBe(0);
});

it("does not arm on the last carrier when the flag is out of scope", () => {
  followTestFlag(carrier);
  gameEntityStore.getState().setStreamEntity(player);
  expect(resolveWatchFollowTarget()).toBe(player.id);
  press();
  expect(state()).toMatchObject({
    followFlagSlot: 1,
    followEntityId: player.id,
    projectileFollow: null,
  });
  expect(callbacks.size).toBe(0);
});

it("arms on the held flag's carrier and follows only their next projectile", () => {
  followTestFlag(looseFlag);
  gameEntityStore.getState().setAllStreamEntities([carrier]);
  press();
  const armed = { kind: "armed", playerId: carrier.id };
  expect(state()).toMatchObject({
    followFlagSlot: 1,
    followEntityId: carrier.id,
    projectileFollow: armed,
  });

  emit({
    type: "spawn",
    id: "wrong-shot",
    timeSec: 15.2,
    sourceEntityId: "other-player",
  });
  expect(state().projectileFollow).toMatchObject(armed);

  emit({
    type: "spawn",
    id: "carrier-shot",
    timeSec: 15.3,
    sourceEntityId: carrier.id,
  });
  expect(state()).toMatchObject({
    followFlagSlot: null,
    projectileFollow: {
      kind: "tracking",
      projectileId: "carrier-shot",
      sourceName: "Scout",
    },
  });
});

it.each([
  ["is dropped", looseFlag],
  ["changes hands", { ...carrier, id: "next-carrier", targetId: 2 }],
  ["goes out of scope", null],
] as const)("disarms when the followed flag %s", (_change, newTarget) => {
  followTestFlag(carrier);
  press();
  expect(state().projectileFollow?.kind).toBe("armed");

  gameEntityStore
    .getState()
    .setStreamEntities(newTarget ? [player, newTarget] : [player]);
  expect(resolveWatchFollowTarget()).toBe(newTarget?.id ?? player.id);
  expect(state().projectileFollow).toBeNull();
  expect(callbacks.size).toBe(0);
});

it("selects the nearest visible projectile using the rendered positions", () => {
  function setShots(shots: StreamEntity[]) {
    streamRenderFrame.current = new Map(shots.map((shot) => [shot.id, shot]));
  }
  const farShot: StreamEntity = {
    id: "outside",
    type: "Projectile",
    position: [101, 0, 0],
  };
  setShots([farShot]);
  press();
  expect(state().projectileFollow).toBeNull();

  const turretShot: StreamEntity = {
    id: "turret-shot",
    type: "Projectile",
    position: [85, 0, 0],
    projectileSourceName: "Turret",
  };
  setShots([
    farShot,
    {
      id: "expired",
      type: "Projectile",
      position: [2, 0, 0],
      hasExploded: true,
    },
    { id: "beam", type: "Beam", position: [1, 0, 0] },
    { id: "visible", type: "Projectile", position: [60, 0, 0] },
    turretShot,
  ]);
  streamRenderFrame.previous = new Map([
    [turretShot.id, { ...turretShot, position: [25, 0, 0] }],
  ]);
  press();
  expect(state().projectileFollow).toEqual({
    kind: "tracking",
    projectileId: turretShot.id,
    sourceName: "Turret",
  });
});

it.each(["freeFly", "original"] as const)(
  "disarms when the camera changes to %s",
  (mode) => {
    followPlayer();
    press();
    expect(selectLocalCameraMode(mode, true)).toBe(true);
    expect(state()).toMatchObject({ cameraMode: mode, projectileFollow: null });
    expect(callbacks.size).toBe(0);
  },
);

it("disarms when cycling to another player in the same camera mode", () => {
  followPlayer();
  const otherPlayer = { ...player, id: "other", targetId: 2, ghostIndex: 2 };
  gameEntityStore.setState({
    streamEntities: new Map([
      [player.id, player],
      [otherPlayer.id, otherPlayer],
    ]),
  });
  press();
  cycleWatchFollow();
  expect(state()).toMatchObject({
    cameraMode: "firstPersonOverride",
    followEntityId: otherPlayer.id,
    projectileFollow: null,
  });
  expect(callbacks.size).toBe(0);
});

it("drops tracking when the stream enters a new world", () => {
  followPlayer();
  press();
  emit({
    type: "spawn",
    id: "shot",
    timeSec: 15.2,
    sourceEntityId: player.id,
  });
  stream.worldGeneration++;
  scheduler.run(FramePriority.CameraSelect, {} as FrameContext);
  expect(state()).toMatchObject({
    cameraMode: "freeFly",
    projectileFollow: null,
  });
});

it("disarms on seeks before old spawn events can fire", () => {
  followPlayer();
  press();
  engineStore.setState((s) => ({
    playback: {
      ...s.playback,
      seekNonce: s.playback.seekNonce + 1,
      status: "seeking",
    },
  }));
  expect(state().projectileFollow).toBeNull();
  expect(callbacks.size).toBe(0);
});

it("restores the shared orbit after a seek and listens for the restored flight's impact", () => {
  const orbit = { yaw: 1.2, pitch: 0.4, distance: 12 };
  const engine = engineStore.getState();
  engine.seekPlayback(15);
  expect(startProjectileTracking("restored", "Scout", orbit)).toBe(false);
  engine.completePlaybackSeek(
    recording,
    engineStore.getState().playback.seekNonce,
  );

  expect(startProjectileTracking("restored", "Scout", orbit)).toBe(true);
  expect(state()).toMatchObject({
    cameraMode: "orbitOverride",
    orbitOverrideYaw: 1.2,
    orbitOverridePitch: 0.4,
    orbitOverrideDistance: 12,
    projectileFollow: {
      kind: "tracking",
      projectileId: "restored",
      sourceName: "Scout",
    },
  });
  expect(callbacks.size).toBe(1);
  emit({ type: "end", id: "restored", timeSec: 15.5, position: [1, 3, 5] });
  expect(state().projectileFollow).toMatchObject({
    terminalPosition: [1, 3, 5],
  });
});
