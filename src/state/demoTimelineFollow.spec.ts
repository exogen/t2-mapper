import { afterEach, beforeEach, expect, it } from "vitest";
import type { StreamRecording, StreamSnapshot } from "../stream/types";
import type { TimelineEvent } from "./demoTimelineStore";
import type { PlayerEntity } from "./gameEntityTypes";
import { seekToTimelineEvent } from "./demoTimelineFollow";
import { engineStore } from "./engineStore";
import { gameEntityStore } from "./gameEntityStore";
import { demoDirectorStore, resetDirector } from "./demoDirectorStore";
import { cameraTourStore } from "./cameraTourStore";
import { setStreamSnapshot } from "./streamSnapshotStore";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "./streamPlaybackStore";
import {
  enterWatchFollow,
  exitToFreeFly,
  resolveWatchFollowTarget,
} from "./watchFollow";

let recording: StreamRecording;
const engine = () => engineStore.getState();
const camera = () => streamPlaybackStore.getState();
const player = (
  id: string,
  name: string,
  targetId: number,
  props: Partial<PlayerEntity> = {},
): PlayerEntity => ({
  id,
  playerName: name,
  targetId,
  ghostIndex: Number(id),
  renderType: "Player",
  className: "Player",
  ...props,
});
const event = (fields: Partial<TimelineEvent> = {}): TimelineEvent => ({
  type: "kill",
  timeSec: 100,
  description: "An event",
  killer: "Alice",
  ...fields,
});
const publish = (timeSec: number) =>
  setStreamSnapshot({
    timeSec,
    playerRoster: [],
    connectedClientId: null,
  } as unknown as StreamSnapshot);
const completeSeek = () => {
  publish(engine().playback.seekTime);
  engine().completePlaybackSeek(recording, engine().playback.seekNonce);
};

beforeEach(() => {
  recording = {
    source: "demo",
    recorderName: "Recorder",
    duration: 1000,
    streamingPlayback: {},
  } as StreamRecording;
  engine().setRecording(recording);
  engine().setPlaybackStatus("paused");
  gameEntityStore.getState().beginStreaming("demo");
  gameEntityStore.getState().setMissionInfo({ recorderName: "Recorder" });
  gameEntityStore
    .getState()
    .setAllStreamEntities([
      player("1", "Alice", 10),
      player("2", "Bob", 20),
      player("3", "Recorder", 30),
    ]);
});

afterEach(() => {
  // Unloading also cancels any follow still waiting for a spawned body.
  engine().setRecording(null);
  gameEntityStore.getState().endStreaming();
  resetDirector();
  resetStreamPlayback();
  cameraTourStore.getState().cancel();
});

it.each([
  { type: "kill", killer: "Alice", victim: "Bob", expected: "1" },
  { type: "death", killer: "Bob", victim: "Recorder", expected: "2" },
  { type: "flag-grab", actor: "Bob", expected: "2" },
  { type: "flag-cap", capturer: "Bob", expected: "2" },
  { type: "flag-return", actor: "Bob", expected: "2" },
  { type: "flag-drop", actor: "Bob", expected: "2" },
  { type: "generator-offline", actor: "Bob", expected: "2" },
  { type: "generator-online", actor: "Bob", expected: "2" },
] as const)(
  "follows the responsible player for $type",
  ({ expected, ...fields }) => {
    seekToTimelineEvent(recording, event(fields));
    expect(engine().playback.seekTime).toBe(97);
    expect(camera().followEntityId).toBeNull();
    completeSeek();
    expect(camera().followEntityId).toBe(expected);
    expect(camera().cameraMode).toBe("orbitOverride");
    expect(engine().playback.status).toBe("paused");
  },
);

it("lets each repair entry at the same timestamp follow its own player", () => {
  for (const [actor, expected] of [
    ["Alice", "1"],
    ["Bob", "2"],
  ]) {
    seekToTimelineEvent(recording, event({ type: "generator-online", actor }));
    completeSeek();
    expect(camera().followEntityId).toBe(expected);
  }
});

it("does not substitute another repairer when the selected player is unavailable", () => {
  seekToTimelineEvent(
    recording,
    event({ type: "generator-online", actor: "Missing player" }),
  );
  completeSeek();
  publish(100);
  expect(camera().followEntityId).toBeNull();
});

const generator = {
  position: [10, 20, 30] as [number, number, number],
  dataBlockId: 100,
};

it.each(["generator-offline", "generator-online"] as const)(
  "flies to an unattributed %s after the destination scene arrives",
  (type) => {
    enterWatchFollow("1");
    seekToTimelineEvent(
      recording,
      event({ type, generator, generatorLabel: "Storm generator" }),
    );
    expect(cameraTourStore.getState().animation).toBeNull();
    gameEntityStore.getState().setAllStreamEntities([
      {
        id: "new-generator",
        renderType: "Shape",
        className: "StaticShape",
        ...generator,
      },
      {
        id: "reused-ghost",
        renderType: "Shape",
        className: "StaticShape",
        dataBlockId: 100,
        position: [100, 200, 300],
      },
    ]);
    completeSeek();
    expect(camera().cameraMode).toBe("freeFly");
    expect(camera().followEntityId).toBeNull();
    expect(cameraTourStore.getState().animation?.targets).toEqual([
      {
        entityId: "new-generator",
        label: "Storm generator",
        position: [20, 30, 10],
      },
    ]);
  },
);

it("uses the recorded generator position when it is outside the lead-in scene's scope", () => {
  seekToTimelineEvent(
    recording,
    event({ type: "generator-offline", generator }),
  );
  completeSeek();
  expect(cameraTourStore.getState().animation?.targets[0]).toMatchObject({
    position: [20, 30, 10],
  });
});

it("prefers the credited player over the generator and cancels a previous flight", () => {
  cameraTourStore
    .getState()
    .flyTo({ entityId: "old", label: "Old", position: [0, 0, 0] });
  seekToTimelineEvent(
    recording,
    event({ type: "generator-online", actor: "Bob", generator }),
  );
  completeSeek();
  expect(cameraTourStore.getState().animation).toBeNull();
  expect(camera().followEntityId).toBe("2");
});

it.each(["failed", "superseded", "camera choice"])(
  "does not start a generator flight after a %s seek",
  (reason) => {
    publish(10);
    seekToTimelineEvent(
      recording,
      event({ type: "generator-offline", generator }),
    );
    if (reason === "failed")
      engine().completePlaybackSeek(
        recording,
        engine().playback.seekNonce,
        "paused",
      );
    if (reason === "superseded") engine().seekPlayback(200);
    if (reason === "camera choice") enterWatchFollow("2");
    completeSeek();
    expect(cameraTourStore.getState().animation).toBeNull();
  },
);

it.each(["flag-grab", "flag-return", "flag-drop"] as const)(
  "uses Original view for the recorder's unnamed friendly %s",
  (type) => {
    enterWatchFollow("1");
    seekToTimelineEvent(
      recording,
      event({ type, teamAffinity: "friendly", isRecorder: true }),
    );
    completeSeek();
    expect(camera()).toMatchObject({
      cameraMode: "original",
      followEntityId: null,
      followTargetId: null,
    });
  },
);

it.each([
  { type: "kill", killer: "Recorder" },
  { type: "death", killer: undefined },
  { type: "flag-cap", capturer: "Recorder" },
  { type: "rename", previousName: "Recorder", actor: "New name" },
  { type: "generator-offline", actor: "Recorder" },
  { type: "generator-online", actor: "Recorder" },
] as const)("uses Original view for the recorder's $type", (fields) => {
  enterWatchFollow("1");
  streamPlaybackStore.setState({ followFlagSlot: 1 });
  seekToTimelineEvent(recording, event({ ...fields, isRecorder: true }));
  expect(camera().cameraMode).toBe("orbitOverride");
  completeSeek();
  expect(camera()).toMatchObject({
    cameraMode: "original",
    followEntityId: null,
    followTargetId: null,
    followFlagSlot: null,
  });
});

it("uses Original view without a living recorder body and exits the director", () => {
  enterWatchFollow("1");
  demoDirectorStore.setState({ status: "playing" });
  gameEntityStore.getState().deleteStreamEntity("3");
  seekToTimelineEvent(recording, event({ type: "death", isRecorder: true }));
  completeSeek();
  expect(camera().cameraMode).toBe("original");
  expect(camera().followEntityId).toBeNull();
  expect(demoDirectorStore.getState().status).toBe("ready");
});

it("does not enter Original view for the relay recorder's own rename", () => {
  recording.recorderName = "MapGenius";
  exitToFreeFly();
  seekToTimelineEvent(
    recording,
    event({ type: "rename", actor: "MapGenius", isRecorder: true }),
  );
  completeSeek();
  publish(100);
  expect(camera().cameraMode).toBe("freeFly");
  expect(camera().followEntityId).toBeNull();
});

it.each(["failed", "superseded", "camera choice"])(
  "does not switch to Original view after a %s seek",
  (reason) => {
    publish(10);
    enterWatchFollow("1");
    seekToTimelineEvent(recording, event({ isRecorder: true }));
    if (reason === "failed")
      engine().completePlaybackSeek(
        recording,
        engine().playback.seekNonce,
        "paused",
      );
    if (reason === "superseded") engine().seekPlayback(200);
    if (reason === "camera choice") enterWatchFollow("2");
    completeSeek();
    expect(camera().cameraMode).toBe("orbitOverride");
  },
);

it("resolves the destination body and retains its identity through respawn", () => {
  seekToTimelineEvent(recording, event());
  gameEntityStore
    .getState()
    .setAllStreamEntities([
      player("1", "Someone else", 99),
      player("4", "\x10\x0bALICE\x11", 10, { damageState: 1 }),
      player("5", "\x10\x0bALICE\x11", 10),
    ]);
  completeSeek();
  expect(camera()).toMatchObject({ followEntityId: "5", followTargetId: 10 });
  gameEntityStore.getState().setAllStreamEntities([player("6", "Alice", 10)]);
  expect(resolveWatchFollowTarget()).toBe("6");
});

it("uses scan-time recorder identity despite different names at the destination", () => {
  enterWatchFollow("1");
  seekToTimelineEvent(
    recording,
    event({ type: "generator-online", actor: "Event name", isRecorder: true }),
  );
  gameEntityStore
    .getState()
    .setAllStreamEntities([player("4", "Renamed recorder", 30)]);
  setStreamSnapshot({
    timeSec: 97,
    connectedClientId: 123,
    playerRoster: [{ clientId: 123, name: "Renamed recorder" }],
  } as StreamSnapshot);
  engine().completePlaybackSeek(recording, engine().playback.seekNonce);
  expect(camera().cameraMode).toBe("original");
  expect(camera().followEntityId).toBeNull();
});

it.each(["Old name", "New name"])(
  "follows a rename body still named %s",
  (name) => {
    gameEntityStore.getState().setAllStreamEntities([player("1", name, 10)]);
    seekToTimelineEvent(
      recording,
      event({ type: "rename", previousName: "Old name", actor: "New name" }),
    );
    completeSeek();
    expect(camera().followEntityId).toBe("1");
  },
);

it.each([
  "match-start",
  "match-end",
  "match-countdown",
  "flag-return",
  "rename",
  "generator-offline",
  "generator-online",
] as const)("leaves the camera unchanged for a playerless %s", (type) => {
  enterWatchFollow("1");
  const before = camera();
  // Even an observer's camera ghost or an old corpse is not a spawned player.
  gameEntityStore
    .getState()
    .setStreamEntities([
      { id: "8", renderType: "Camera", className: "Camera" },
      player("9", "Observer", 90, { damageState: 1 }),
    ]);
  seekToTimelineEvent(
    recording,
    event({ type, actor: type === "rename" ? "Observer" : undefined }),
  );
  completeSeek();
  expect(camera()).toBe(before);
  expect(engine().playback.seekTime).toBe(97);
});

it("follows a player who spawns during the lead-in", () => {
  gameEntityStore.getState().clearStreamEntities();
  seekToTimelineEvent(recording, event());
  completeSeek();
  expect(camera().followEntityId).toBeNull();
  gameEntityStore.getState().setAllStreamEntities([player("4", "Alice", 10)]);
  publish(99);
  expect(camera().followEntityId).toBe("4");
});

it("stops waiting when a rename's player has no body at the event", () => {
  gameEntityStore.getState().clearStreamEntities();
  seekToTimelineEvent(recording, event({ type: "rename", actor: "Observer" }));
  completeSeek();
  publish(100);
  gameEntityStore
    .getState()
    .setAllStreamEntities([player("4", "Observer", 40)]);
  publish(101);
  expect(camera().followEntityId).toBeNull();
});

it("expires before matching when playback skips past the event", () => {
  gameEntityStore.getState().clearStreamEntities();
  seekToTimelineEvent(recording, event({ type: "rename", actor: "Observer" }));
  completeSeek();
  gameEntityStore
    .getState()
    .setAllStreamEntities([player("4", "Observer", 40)]);
  // Fast playback and throttled snapshots need not publish the event's tick.
  publish(101);
  expect(camera().followEntityId).toBeNull();
});

it("does not follow the old scene when seeking fails before publication", () => {
  publish(10);
  seekToTimelineEvent(recording, event());
  // advancePlaybackFrame also completes a failed seek to clear loading.
  engine().completePlaybackSeek(
    recording,
    engine().playback.seekNonce,
    "paused",
  );
  expect(camera().followEntityId).toBeNull();
  publish(98);
  expect(camera().followEntityId).toBeNull();
});

it("lets a newer player selection cancel a pending event follow", () => {
  gameEntityStore.getState().deleteStreamEntity("1");
  seekToTimelineEvent(recording, event());
  completeSeek();
  enterWatchFollow("2");
  gameEntityStore.getState().setStreamEntity(player("4", "Alice", 10));
  publish(99);
  expect(camera().followEntityId).toBe("2");
});

it("lets switching to free-fly cancel a pending event follow", () => {
  gameEntityStore.getState().deleteStreamEntity("1");
  seekToTimelineEvent(recording, event());
  completeSeek();
  exitToFreeFly();
  gameEntityStore.getState().setStreamEntity(player("4", "Alice", 10));
  publish(99);
  expect(camera().followEntityId).toBeNull();
  expect(camera().cameraMode).toBe("freeFly");
});

it("keeps waiting through automatic respawn relocks of the previous follow", () => {
  enterWatchFollow("2");
  gameEntityStore.getState().deleteStreamEntity("1");
  seekToTimelineEvent(recording, event());
  completeSeek();
  gameEntityStore.getState().setAllStreamEntities([player("5", "Bob", 20)]);
  expect(resolveWatchFollowTarget()).toBe("5");
  gameEntityStore.getState().setStreamEntity(player("4", "Alice", 10));
  publish(99);
  expect(camera().followEntityId).toBe("4");
});

it("keeps waiting through automatic director camera selections", () => {
  demoDirectorStore.setState({ status: "playing" });
  gameEntityStore.getState().deleteStreamEntity("1");
  seekToTimelineEvent(recording, event());
  completeSeek();
  enterWatchFollow("2");
  gameEntityStore.getState().setStreamEntity(player("4", "Alice", 10));
  publish(99);
  expect(camera().followEntityId).toBe("4");
  expect(demoDirectorStore.getState().status).toBe("ready");
});

it("does not follow when a truncated recording ends before the requested scene", () => {
  seekToTimelineEvent(recording, event());
  publish(50);
  engine().completePlaybackSeek(
    recording,
    engine().playback.seekNonce,
    "paused",
  );
  expect(camera().followEntityId).toBeNull();
});

it("allows the destination snapshot to bracket the event's tick", () => {
  gameEntityStore.getState().deleteStreamEntity("1");
  seekToTimelineEvent(recording, event());
  completeSeek();
  gameEntityStore.getState().setStreamEntity(player("4", "Alice", 10));
  publish(100.016);
  expect(camera().followEntityId).toBe("4");
});

it.each(["seek", "match", "unload", "replace"])(
  "cancels the old follow on %s",
  (action) => {
    seekToTimelineEvent(recording, event());
    if (action === "seek") engine().seekPlayback(200);
    if (action === "match")
      seekToTimelineEvent(recording, event({ type: "match-end" }));
    if (action === "unload") engine().setRecording(null);
    if (action === "replace") engine().setRecording({ ...recording });
    completeSeek();
    expect(camera().followEntityId).toBeNull();
  },
);

it("uses only the latest event when clicked rapidly", () => {
  seekToTimelineEvent(recording, event());
  seekToTimelineEvent(recording, event({ killer: "Bob" }));
  completeSeek();
  expect(camera().followEntityId).toBe("2");
});

it("takes the camera from the director when a player resolves", () => {
  demoDirectorStore.setState({ status: "playing" });
  seekToTimelineEvent(recording, event());
  completeSeek();
  expect(demoDirectorStore.getState().status).toBe("ready");
  expect(camera().followEntityId).toBe("1");
});

it("ignores clicks from an obsolete recording and clamps the lead-in to zero", () => {
  seekToTimelineEvent({ ...recording }, event());
  expect(engine().playback.status).toBe("paused");
  seekToTimelineEvent(recording, event({ timeSec: 1 }));
  expect(engine().playback.seekTime).toBe(0);
});
