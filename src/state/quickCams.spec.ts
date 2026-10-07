import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrthographicCamera, PerspectiveCamera } from "three";
import { casterStore } from "./casterStore";
import { saveQuickCam, restoreQuickCam } from "./quickCams";
import { cameraRegistry } from "./cameraRegistry";
import { liveConnectionStore } from "./liveConnectionStore";
import { gameEntityStore } from "./gameEntityStore";
import {
  streamPlaybackStore,
  resetStreamPlayback,
} from "./streamPlaybackStore";
import { setStreamSnapshot } from "./streamSnapshotStore";
import { commandCircuitStore } from "./commandCircuitStore";
import { cameraTourStore } from "./cameraTourStore";
import { demoDirectorStore } from "./demoDirectorStore";
import {
  enterWatchFollow,
  exitToFreeFly,
  exitWatchFollow,
  followFlag,
  resolveWatchFollowTarget,
  cycleDemoCameraMode,
  cycleWatchObserverMode,
  toggleWatchFollow,
} from "./watchFollow";
import { streamEntityToGameEntity } from "../stream/entityBridge";
import type { StreamSnapshot } from "../stream/types";

function body(
  id: string,
  targetId: number,
  damageState = 0,
  playerName = "Player",
  playerRawName?: string,
) {
  gameEntityStore.getState().setAllStreamEntities([
    streamEntityToGameEntity({
      id,
      targetId,
      damageState,
      type: "Player",
      className: "Player",
      playerName,
      playerRawName,
    }),
  ]);
}

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  gameEntityStore.getState().beginStreaming("live");
  liveConnectionStore.setState({ role: "watcher", liveReady: true });
  casterStore.getState().activate("test:28000", "1", "Katabatic");
  cameraRegistry.perspective = new PerspectiveCamera(60, 2);
  exitToFreeFly();
});
afterEach(() => {
  casterStore.getState().suspend();
  resetStreamPlayback();
  setStreamSnapshot(null);
  gameEntityStore.getState().endStreaming();
  liveConnectionStore.setState({ role: null, liveReady: false });
  cameraRegistry.perspective = null;
  cameraRegistry.ortho = null;
  commandCircuitStore.getState().deactivate();
  cameraTourStore.getState().cancel();
  demoDirectorStore.setState({ status: "idle" });
  vi.unstubAllGlobals();
});

it.each(["live", "demo"] as const)(
  "saves and restores a free camera in %s, including its orientation and FOV",
  (source) => {
    gameEntityStore.getState().beginStreaming(source);
    if (source === "demo")
      liveConnectionStore.setState({ role: null, liveReady: false });
    const camera = cameraRegistry.perspective!;
    camera.position.set(10, 20, 30);
    camera.rotation.set(0.4, 1, 0);
    const rotation = camera.quaternion.clone();
    saveQuickCam(0);
    const saveAction = casterStore.getState().lastCameraAction;
    camera.position.set(100, 200, 300);
    camera.rotation.set(0, 0, 0);
    restoreQuickCam(0);
    expect(camera.position.toArray()).toEqual([10, 20, 30]);
    expect(camera.quaternion.equals(rotation)).toBe(true);
    expect(casterStore.getState().fov).toBeCloseTo(98.2132, 3);
    const recallAction = casterStore.getState().lastCameraAction;
    expect(recallAction).toEqual({ slot: 0 });
    expect(recallAction).not.toBe(saveAction);
    restoreQuickCam(0);
    expect(casterStore.getState().lastCameraAction).not.toBe(recallAction);
  },
);

it.each([
  ["demo", "orbitOverride"],
  ["demo", "firstPersonOverride"],
  ["live", "orbitOverride"],
  ["live", "firstPersonOverride"],
] as const)(
  "saves and restores %s %s after a body replacement without consulting the roster",
  (source, mode) => {
    gameEntityStore.getState().beginStreaming(source);
    if (source === "demo")
      liveConnectionStore.setState({ role: null, liveReady: false });
    setStreamSnapshot({ playerRoster: [] } as unknown as StreamSnapshot);
    body("before-seek", 30);
    enterWatchFollow("before-seek");
    streamPlaybackStore.setState({ cameraMode: mode });
    saveQuickCam(3);
    expect(casterStore.getState().settings?.quickCams[3]).toMatchObject({
      kind: mode === "firstPersonOverride" ? "fp" : "follow",
      label: `Player · ${mode === "firstPersonOverride" ? "First person" : "Follow"}`,
      playerName: "Player",
    });
    exitToFreeFly();
    body("after-seek", 30);
    restoreQuickCam(3);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: mode,
      followCameraMode: mode,
      followEntityId: "after-seek",
      followTargetId: 30,
    });
  },
);

it("saves Original demo view as the recorder's camera rather than a frozen pose", () => {
  gameEntityStore.getState().beginStreaming("demo");
  streamPlaybackStore.setState({ cameraMode: "original" });
  saveQuickCam(0);
  expect(casterStore.getState().settings?.quickCams[0]).toMatchObject({
    kind: "original",
    label: "Original view",
  });
  exitToFreeFly();
  restoreQuickCam(0);
  expect(streamPlaybackStore.getState().cameraMode).toBe("original");
  expect(casterStore.getState().fov).toBeNull();
});

it.each(["orbitOverride", "firstPersonOverride"] as const)(
  "restores %s after player and viewer reconnects with new target ids and clan tags",
  (mode) => {
    body("old-body", 30, 0, "[OLD]Player", "\x10\x0b[OLD]\x08Player\x11");
    enterWatchFollow("old-body");
    streamPlaybackStore.setState({
      cameraMode: mode,
      orbitOverrideYaw: 0.8,
      orbitOverridePitch: 0.4,
      orbitOverrideDistance: 40,
    });
    saveQuickCam(1);
    casterStore.getState().suspend();
    casterStore.getState().activate("test:28000", "1", "Katabatic");
    body("new-body", 90, 0, "Player[NEW]", "\x10\x08Player\x0b[NEW]\x11");
    gameEntityStore.getState().setStreamEntity(
      streamEntityToGameEntity({
        id: "reused-target",
        targetId: 30,
        type: "Player",
        className: "Player",
        playerName: "Other player",
      }),
    );
    exitToFreeFly();
    restoreQuickCam(1);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: mode,
      followEntityId: "new-body",
      followTargetId: 90,
      followFlagSlot: null,
      orbitOverrideYaw: 0.8,
      orbitOverridePitch: 0.4,
      orbitOverrideDistance: 40,
    });
  },
);

it("waits for the saved player without following someone who reused their target id", () => {
  body("old-body", 30);
  enterWatchFollow("old-body");
  saveQuickCam(3);
  exitToFreeFly();
  body("dead-body", 30, 1);
  restoreQuickCam(3);
  expect(streamPlaybackStore.getState().cameraMode).toBe("freeFly");
  expect(streamPlaybackStore.getState().pendingFollowPlayerName).toBe("Player");
  body("reused-body", 30, 0, "Someone else");
  expect(resolveWatchFollowTarget()).toBeNull();
  expect(streamPlaybackStore.getState().pendingFollowPlayerName).toBe("Player");
  expect(streamPlaybackStore.getState().cameraMode).toBe("freeFly");
});

it.each([
  ["demo", "orbitOverride"],
  ["demo", "firstPersonOverride"],
  ["live", "orbitOverride"],
  ["live", "firstPersonOverride"],
] as const)(
  "arms %s %s on a dead player, preserves framing, and follows subsequent respawns",
  (source, mode) => {
    gameEntityStore.getState().beginStreaming(source);
    body("saved-body", 30);
    enterWatchFollow("saved-body");
    streamPlaybackStore.setState({
      cameraMode: mode,
      orbitOverrideYaw: 0.8,
      orbitOverridePitch: 0.4,
      orbitOverrideDistance: 40,
    });
    saveQuickCam(3, true);
    exitToFreeFly();
    body("corpse", 30, 1);
    const camera = cameraRegistry.perspective!;
    camera.position.set(10, 20, 30);
    camera.rotation.set(0.3, 1.2, 0);
    const position = camera.position.clone();
    const orientation = camera.quaternion.clone();
    expect(restoreQuickCam(3)?.followBehindPlayer).toBe(true);
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: "freeFly",
      followCameraMode: mode,
      followEntityId: null,
      followTargetId: null,
      pendingFollowPlayerName: "Player",
    });
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(orientation)).toBe(true);
    const waiting = streamPlaybackStore.getState();
    expect(resolveWatchFollowTarget()).toBeNull();
    expect(streamPlaybackStore.getState()).toBe(waiting);
    gameEntityStore.getState().clearStreamEntities();
    expect(resolveWatchFollowTarget()).toBeNull();

    body("respawn", 90, 0, "Player[NEW]", "\x10\x08Player\x0b[NEW]\x11");
    expect(resolveWatchFollowTarget()).toBe("respawn");
    expect(streamPlaybackStore.getState()).toMatchObject({
      cameraMode: mode,
      followCameraMode: mode,
      followEntityId: "respawn",
      followTargetId: 90,
      pendingFollowPlayerName: null,
      orbitOverrideYaw: 0.8,
      orbitOverridePitch: 0.4,
      orbitOverrideDistance: 40,
    });
    expect(casterStore.getState().fov).toBeCloseTo(98.2132, 3);

    body("corpse-again", 90, 1);
    expect(resolveWatchFollowTarget()).toBeNull();
    body("respawn-again", 90);
    expect(resolveWatchFollowTarget()).toBe("respawn-again");
    expect(streamPlaybackStore.getState().followCameraMode).toBe(mode);
  },
);

it("can arm a saved player with no entities and see their existing body become alive in place", () => {
  body("saved-body", 30);
  enterWatchFollow("saved-body");
  saveQuickCam(3);
  exitToFreeFly();
  gameEntityStore.getState().clearStreamEntities();
  restoreQuickCam(3);
  expect(resolveWatchFollowTarget()).toBeNull();
  body("new-body", 90, 1);
  expect(resolveWatchFollowTarget()).toBeNull();
  const entity = gameEntityStore.getState().streamEntities.get("new-body")!;
  if (entity.renderType !== "Player") throw Error("Expected a player");
  entity.damageState = 0;
  expect(resolveWatchFollowTarget()).toBe("new-body");
  expect(streamPlaybackStore.getState().pendingFollowPlayerName).toBeNull();
});

it("does not resolve a pending name collision until only one player matches", () => {
  body("saved-body", 30);
  enterWatchFollow("saved-body");
  saveQuickCam(3);
  gameEntityStore.getState().clearStreamEntities();
  restoreQuickCam(3);
  body("first-body", 90);
  gameEntityStore.getState().setStreamEntity(
    streamEntityToGameEntity({
      id: "second-body",
      targetId: 91,
      type: "Player",
      className: "Player",
      playerName: "Player",
    }),
  );
  expect(resolveWatchFollowTarget()).toBeNull();
  expect(streamPlaybackStore.getState().pendingFollowPlayerName).toBe("Player");
  gameEntityStore.getState().deleteStreamEntity("second-body");
  expect(resolveWatchFollowTarget()).toBe("first-body");
});

it.each([
  ["free-fly", exitToFreeFly],
  ["follow exit", exitWatchFollow],
  ["demo camera cycle", cycleDemoCameraMode],
  ["watch camera cycle", cycleWatchObserverMode],
  ["command circuit follow toggle", toggleWatchFollow],
  ["stream reset", resetStreamPlayback],
  [
    "next mission",
    () => casterStore.getState().activate("test:28000", "2", "Katabatic"),
  ],
  ["disconnect", () => casterStore.getState().suspend()],
  ["another player", () => enterWatchFollow("another-player")],
  ["flag", () => followFlag(2)],
  ["another quick cam", () => restoreQuickCam(0)],
  [
    "tour",
    () =>
      cameraTourStore
        .getState()
        .flyTo({ entityId: "test", label: "Test", position: [1, 2, 3] }),
  ],
] as const)("cancels a pending quick cam on %s", (_name, cancel) => {
  saveQuickCam(0);
  body("saved-body", 30);
  enterWatchFollow("saved-body");
  saveQuickCam(3);
  exitToFreeFly();
  body("another-player", 91, 0, "Someone else");
  gameEntityStore.getState().setStreamEntity({
    id: "flag",
    teamId: 2,
    renderType: "Shape",
    className: "Item",
    targetRenderFlags: 2,
  });
  restoreQuickCam(3);
  expect(streamPlaybackStore.getState().pendingFollowPlayerName).toBe("Player");
  cancel();
  expect(streamPlaybackStore.getState().pendingFollowPlayerName).toBeNull();
  gameEntityStore.getState().setStreamEntity(
    streamEntityToGameEntity({
      id: "late-body",
      targetId: 90,
      type: "Player",
      className: "Player",
      playerName: "Player",
    }),
  );
  expect(resolveWatchFollowTarget()).not.toBe("late-body");
});

it("can save the pending player and view into another slot", () => {
  body("saved-body", 30);
  enterWatchFollow("saved-body");
  streamPlaybackStore.setState({ cameraMode: "firstPersonOverride" });
  saveQuickCam(3);
  gameEntityStore.getState().clearStreamEntities();
  restoreQuickCam(3);
  saveQuickCam(4);
  expect(casterStore.getState().settings?.quickCams[4]).toMatchObject({
    kind: "fp",
    playerName: "Player",
  });
});

it("matches base names regardless of casing", () => {
  body("old-body", 30, 0, "Player");
  enterWatchFollow("old-body");
  saveQuickCam(3);
  body("new-body", 90, 0, "PLAYER");
  exitToFreeFly();
  restoreQuickCam(3);
  expect(streamPlaybackStore.getState().followEntityId).toBe("new-body");
});

it("leaves the camera alone when multiple players share the saved base name", () => {
  body("saved-body", 30);
  enterWatchFollow("saved-body");
  saveQuickCam(3);
  exitToFreeFly();
  body("first-body", 90, 0, "[A]Player", "\x10\x0b[A]\x08Player\x11");
  gameEntityStore.getState().setStreamEntity(
    streamEntityToGameEntity({
      id: "second-body",
      targetId: 91,
      type: "Player",
      className: "Player",
      playerName: "[B]Player",
      playerRawName: "\x10\x0b[B]\x08Player\x11",
    }),
  );
  const current = streamPlaybackStore.getState();
  const action = casterStore.getState().lastCameraAction;
  restoreQuickCam(3);
  expect(streamPlaybackStore.getState()).toBe(current);
  expect(casterStore.getState().lastCameraAction).toBe(action);
});

it("resolves respawn overlaps to the newest living body for the same player", () => {
  body("old-body", 30);
  enterWatchFollow("old-body");
  saveQuickCam(3);
  exitToFreeFly();
  gameEntityStore.getState().setStreamEntity(
    streamEntityToGameEntity({
      id: "new-body",
      targetId: 30,
      ghostIndex: 10,
      type: "Player",
      className: "Player",
      playerName: "Player",
    }),
  );
  restoreQuickCam(3);
  expect(streamPlaybackStore.getState().followEntityId).toBe("new-body");
});

it("saves the chosen follow view while waiting for a respawn", () => {
  body("dead-body", 30, 1);
  enterWatchFollow("dead-body");
  streamPlaybackStore.setState({
    cameraMode: "freeFly",
    followCameraMode: "firstPersonOverride",
  });
  saveQuickCam(3);
  expect(casterStore.getState().settings?.quickCams[3]).toMatchObject({
    kind: "fp",
    playerName: "Player",
  });
});

it.each(["live", "demo"] as const)(
  "clearing a custom camera restores the flag default in %s",
  (source) => {
    gameEntityStore.getState().beginStreaming(source);
    saveQuickCam(1);
    restoreQuickCam(1);
    expect(streamPlaybackStore.getState().cameraMode).toBe("freeFly");
    gameEntityStore.getState().setAllStreamEntities([
      {
        id: "flag",
        teamId: 1,
        targetRenderFlags: 2,
        className: "Item",
        renderType: "Shape",
      },
    ]);
    casterStore.getState().saveCamera(1, null);
    restoreQuickCam(1);
    expect(streamPlaybackStore.getState()).toMatchObject({
      followEntityId: "flag",
      followFlagSlot: 1,
    });
    expect(casterStore.getState().lastCameraAction).toEqual({ slot: 1 });
  },
);

it.each(["live", "demo"] as const)(
  "restores command circuit pan/zoom and stops automatic camera owners in %s",
  (source) => {
    gameEntityStore.getState().beginStreaming(source);
    cameraRegistry.ortho = new OrthographicCamera();
    cameraRegistry.ortho.position.set(40, 2500, 60);
    cameraRegistry.ortho.zoom = 4;
    commandCircuitStore.getState().activate();
    saveQuickCam(9);
    commandCircuitStore.getState().deactivate();
    cameraTourStore
      .getState()
      .flyTo({ entityId: "test", label: "Test", position: [1, 2, 3] });
    demoDirectorStore.setState({ status: "playing" });
    restoreQuickCam(9);
    expect(commandCircuitStore.getState()).toMatchObject({
      active: true,
      viewRequest: { x: 40, z: 60, zoom: 4 },
    });
    expect(cameraTourStore.getState().animation).toBeNull();
    expect(demoDirectorStore.getState().status).toBe("ready");
  },
);

it("does not alter the current view on an empty slot, unavailable flag or while disconnected", () => {
  const current = streamPlaybackStore.getState();
  restoreQuickCam(4);
  restoreQuickCam(2);
  expect(streamPlaybackStore.getState()).toBe(current);
  expect(casterStore.getState().lastCameraAction).toBeNull();
  saveQuickCam(0);
  const action = casterStore.getState().lastCameraAction;
  liveConnectionStore.setState({ liveReady: false });
  restoreQuickCam(0);
  expect(casterStore.getState().lastCameraAction).toBe(action);
  expect(streamPlaybackStore.getState()).toBe(current);
  casterStore.getState().saveCamera(0, null);
  saveQuickCam(0);
  expect(casterStore.getState().settings?.quickCams[0]).toBeUndefined();
});

it("keeps default flag cameras usable with a relay that does not supply mission identity", () => {
  casterStore.getState().suspend();
  gameEntityStore.getState().setAllStreamEntities([
    {
      id: "flag",
      teamId: 2,
      targetRenderFlags: 2,
      className: "Item",
      renderType: "Shape",
    },
  ]);
  restoreQuickCam(2);
  expect(streamPlaybackStore.getState().followFlagSlot).toBe(2);
});

it("uses only the available neutral flag in Rabbit, including carrier hand-offs", () => {
  gameEntityStore.getState().setAllStreamEntities([
    {
      id: "rabbit",
      teamId: 0,
      targetRenderFlags: 2,
      className: "Item",
      renderType: "Shape",
    },
  ]);
  restoreQuickCam(1);
  expect(streamPlaybackStore.getState()).toMatchObject({
    followEntityId: "rabbit",
    followFlagSlot: 1,
  });
  const current = streamPlaybackStore.getState();
  restoreQuickCam(2);
  expect(streamPlaybackStore.getState()).toBe(current);
  saveQuickCam(1);
  expect(casterStore.getState().settings?.quickCams[1]).toMatchObject({
    kind: "flag",
    slot: 1,
  });
  gameEntityStore.getState().setAllStreamEntities([
    streamEntityToGameEntity({
      id: "carrier",
      type: "Player",
      className: "Player",
      targetRenderFlags: 2,
      playerName: "Rabbit",
      teamId: 1,
      imageSlots: [{ shapeName: "flag", mountPoint: 0, dataBlockId: 1 }],
    }),
  ]);
  expect(resolveWatchFollowTarget()).toBe("carrier");
  exitToFreeFly();
  restoreQuickCam(1);
  expect(streamPlaybackStore.getState()).toMatchObject({
    followEntityId: "carrier",
    followFlagSlot: 1,
  });
});

it("supports default flag slots beyond the two CTF teams", () => {
  gameEntityStore.getState().setAllStreamEntities([
    {
      id: "third",
      teamId: 3,
      targetRenderFlags: 2,
      className: "Item",
      renderType: "Shape",
    },
  ]);
  restoreQuickCam(3);
  expect(streamPlaybackStore.getState()).toMatchObject({
    followEntityId: "third",
    followFlagSlot: 3,
  });
});

it("captures the rendered camera during a tour and remembers the follow framing preference", () => {
  body("body", 30);
  enterWatchFollow("body");
  saveQuickCam(3, true);
  expect(restoreQuickCam(3)?.followBehindPlayer).toBe(true);
  const nonce = streamPlaybackStore.getState().orbitSnapNonce;
  restoreQuickCam(3);
  expect(streamPlaybackStore.getState().orbitSnapNonce).toBe(nonce + 1);
  cameraTourStore
    .getState()
    .flyTo({ entityId: "test", label: "Test", position: [1, 2, 3] });
  cameraRegistry.perspective!.position.set(40, 50, 60);
  saveQuickCam(4);
  expect(casterStore.getState().settings?.quickCams[4]).toMatchObject({
    kind: "fly",
    position: [40, 50, 60],
  });
});
