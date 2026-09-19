import { afterEach, beforeEach, expect, it } from "vitest";
import type { StreamRecording, StreamSnapshot } from "../stream/types";
import type { TimelineEvent } from "./demoTimelineStore";
import type { PlayerEntity } from "./gameEntityTypes";
import { seekToTimelineEvent } from "./demoTimelineFollow";
import { engineStore } from "./engineStore";
import { gameEntityStore } from "./gameEntityStore";
import { demoDirectorStore, resetDirector } from "./demoDirectorStore";
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
});

it.each([
  { type: "kill", killer: "Alice", victim: "Bob", expected: "1" },
  { type: "death", killer: "Bob", victim: "Recorder", expected: "2" },
  { type: "flag-grab", actor: "Bob", expected: "2" },
  { type: "flag-cap", capturer: "Bob", expected: "2" },
  { type: "flag-return", actor: "Bob", expected: "2" },
  { type: "flag-drop", actor: "Bob", expected: "2" },
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

it.each(["flag-grab", "flag-return", "flag-drop"] as const)(
  "follows the recorder for an unnamed friendly %s",
  (type) => {
    seekToTimelineEvent(recording, event({ type, teamAffinity: "friendly" }));
    completeSeek();
    expect(camera().followEntityId).toBe("3");
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

it("uses the recorder's destination roster name for unnamed flag events", () => {
  seekToTimelineEvent(
    recording,
    event({ type: "flag-return", teamAffinity: "friendly" }),
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
  expect(camera().followEntityId).toBe("4");
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
