import { afterEach, expect, it } from "vitest";
import { Group } from "three";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { engineStore } from "../state/engineStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import type {
  StreamRecording,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import type { GameEngine } from "./gameEngine";
import { sampleMissileLockView } from "./missileLockView";

function fixture(
  source: StreamRecording["source"] = "demo",
  warnTarget = false,
) {
  const playback = {
    getDataBlockData: () => ({ boxSize: { z: 2 }, useTargetAudio: warnTarget }),
  } as unknown as StreamingPlayback;
  const recording = { source, streamingPlayback: playback } as StreamRecording;
  engineStore.getState().setRecording(recording);
  streamPlaybackStore.setState({ playback, cameraMode: "original" });
  const snapshot = {
    entities: [
      { id: "recipient", type: "Player" },
      { id: "rider", type: "Player", mountObjectId: "vehicle", dataBlockId: 1 },
      { id: "vehicle", type: "Vehicle" },
    ],
    camera: null,
    controlPlayerGhostId: "recipient",
  } as StreamSnapshot;
  const targets = new Map<string, { root: Group }>();
  const engine = {
    streamSnapshot: { current: snapshot },
    entities: targets,
  } as unknown as GameEngine;
  return { engine, snapshot, targets, playback };
}

afterEach(() => {
  engineStore.getState().setRecording(null);
  streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
  commandCircuitStore.getState().deactivate();
});

function followSeeker(source: StreamRecording["source"] = "demo") {
  const view = fixture(source);
  const subject = view.snapshot.entities[1];
  subject.mountObjectId = undefined;
  const imageState = {
    dataBlockId: 5,
    target: true,
    wet: false,
    loaded: true,
    ammo: true,
    triggerDown: false,
    fireCount: 0,
  };
  subject.imageSlots = [
    {
      dataBlockId: 5,
      shapeName: "weapon_missile.dts",
      mountPoint: 0,
      imageState,
    },
  ];
  view.playback.getDataBlockData = () => ({ isSeeker: true });
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: subject.id,
  });
  return { ...view, subject, imageState };
}

it.each(["demo", "live"] as const)(
  "shows nonpositional seeker activity from the followed player's packet in %s",
  (source) => {
    const { engine, snapshot, imageState, subject } = followSeeker(source);
    expect(sampleMissileLockView(engine)).toEqual({
      subjectId: subject.id,
      outgoing: { kind: "targeting" },
      incomingLock: false,
      inbound: false,
    });
    snapshot.inferredMissileLocks = [
      { shooterId: subject.id, targetId: "recipient", warnTarget: true },
    ];
    expect(sampleMissileLockView(engine)?.outgoing).toEqual({ kind: "locked" });
    snapshot.inferredMissileLocks = undefined;
    imageState.target = false;
    expect(sampleMissileLockView(engine)).toBeUndefined();
  },
);

it("keeps seeker activity off outside the remote player's first-person view", () => {
  const { engine, snapshot, subject, imageState } = followSeeker();
  streamPlaybackStore.setState({ cameraMode: "orbitOverride" });
  expect(sampleMissileLockView(engine)).toBeUndefined();
  streamPlaybackStore.setState({ cameraMode: "firstPersonOverride" });
  engine.recordingFollowEye = false;
  expect(sampleMissileLockView(engine)).toBeUndefined();
  engine.recordingFollowEye = true;
  commandCircuitStore.setState({ active: true });
  expect(sampleMissileLockView(engine)).toBeUndefined();
  commandCircuitStore.getState().deactivate();
  subject.mountObjectId = "vehicle";
  expect(sampleMissileLockView(engine)).toBeUndefined();
  subject.mountObjectId = undefined;
  imageState.wet = true;
  expect(sampleMissileLockView(engine)).toBeUndefined();
  imageState.wet = false;
  snapshot.controlPlayerGhostId = subject.id;
  snapshot.missileLock = { selfHomed: false, selfLocked: false };
  expect(sampleMissileLockView(engine)?.outgoing).toBeUndefined();
});

it("requires a known seeker in the active weapon slot", () => {
  const { engine, playback, subject } = followSeeker();
  playback.getDataBlockData = () => ({ isSeeker: false });
  expect(sampleMissileLockView(engine)).toBeUndefined();
  playback.getDataBlockData = () => ({ isSeeker: true });
  const [weapon] = subject.imageSlots!;
  subject.imageSlots = [undefined, weapon];
  expect(sampleMissileLockView(engine)).toBeUndefined();
});

it("uses inferred outgoing and incoming state only for remote subjects", () => {
  const { engine, snapshot } = fixture("live");
  snapshot.inferredMissileLocks = [
    { shooterId: "rider", targetId: "recipient", warnTarget: true },
    { shooterId: "vehicle", targetId: "rider", warnTarget: true },
  ];
  snapshot.missileLock = { selfLocked: false, selfHomed: false };
  expect(sampleMissileLockView(engine)?.incomingLock).toBe(false);
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: "rider",
  });
  expect(sampleMissileLockView(engine)).toEqual({
    subjectId: "rider",
    outgoing: { kind: "locked" },
    incomingLock: true,
    inbound: false,
  });
});

it.each([true, false])(
  "uses an explicitly locked target's warning only when target audio is %s",
  (warnTarget) => {
    const { engine, snapshot } = fixture("demo", warnTarget);
    const [recipient] = snapshot.entities;
    recipient.imageSlots = [
      { dataBlockId: 9, shapeName: "weapon_missile.dts", mountPoint: 0 },
    ];
    snapshot.missileLock = {
      selfLocked: false,
      selfHomed: false,
      outgoing: { kind: "object", targetId: "vehicle" },
    };
    streamPlaybackStore.setState({
      cameraMode: "firstPersonOverride",
      followEntityId: "rider",
    });
    expect(!!sampleMissileLockView(engine)?.incomingLock).toBe(warnTarget);
  },
);

it.each([true, false])(
  "uses the controlled turret's target audio setting (%s) for an exact outgoing lock",
  (warnTarget) => {
    const { engine, snapshot, playback } = fixture();
    const [recipient] = snapshot.entities;
    recipient.imageSlots = [
      { dataBlockId: 1, shapeName: "weapon_missile.dts", mountPoint: 0 },
    ];
    snapshot.entities.push({
      id: "turret",
      type: "Ghost",
      className: "Turret",
      rotation: [0, 0, 0, 1],
      imageSlots: [
        {
          dataBlockId: 2,
          shapeName: "turret_missile_large.dts",
          mountPoint: 0,
        },
      ],
    });
    playback.getDataBlockData = (id) => ({
      useTargetAudio: id === 2 ? warnTarget : !warnTarget,
    });
    snapshot.camera = {
      time: 0,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      fov: 90,
      mode: "first-person",
      controlEntityId: "turret",
    };
    snapshot.missileLock = {
      selfLocked: true,
      selfHomed: false,
      outgoing: { kind: "object", targetId: "rider" },
    };
    expect(sampleMissileLockView(engine)).toMatchObject({
      subjectId: "recipient",
      outgoing: { kind: "locked" },
      incomingLock: true,
    });
    streamPlaybackStore.setState({
      cameraMode: "firstPersonOverride",
      followEntityId: "rider",
    });
    expect(!!sampleMissileLockView(engine)?.incomingLock).toBe(warnTarget);
  },
);

it.each(["demo", "live"] as const)(
  "shows the recipient's real lock state in %s",
  (source) => {
    const { engine, snapshot } = fixture(source);
    snapshot.missileLock = {
      selfLocked: true,
      selfHomed: false,
      outgoing: { kind: "tracking", position: [1, 2, 3] },
    };
    expect(sampleMissileLockView(engine)).toEqual({
      subjectId: "recipient",
      incomingLock: true,
      inbound: false,
      outgoing: { kind: "tracking", position: [2, 3, 1] },
    });
    snapshot.missileLock = {
      selfLocked: false,
      selfHomed: true,
      outgoing: { kind: "position", position: [4, 5, 6] },
    };
    expect(sampleMissileLockView(engine)).toMatchObject({
      incomingLock: false,
      inbound: true,
      outgoing: { kind: "locked", position: [5, 6, 4] },
    });
  },
);

it("uses the scoped target's rendered center and keeps the tone when it leaves scope", () => {
  const { engine, snapshot, targets } = fixture();
  const root = new Group();
  const rider = new Group();
  root.position.set(10, 20, 30);
  rider.position.set(1, 2, 3);
  root.add(rider);
  targets.set("rider", { root: rider });
  snapshot.missileLock = {
    selfLocked: false,
    selfHomed: false,
    outgoing: { kind: "object", targetId: "rider" },
  };
  expect(sampleMissileLockView(engine)?.outgoing).toEqual({
    kind: "locked",
    position: [11, 23, 33],
  });

  snapshot.entities = snapshot.entities.filter(
    (entity) => entity.id !== "rider",
  );
  expect(sampleMissileLockView(engine)?.outgoing).toEqual({ kind: "locked" });
});

it("warns for a missile targeting the followed player's mount without leaking the recipient's lock", () => {
  const { engine, snapshot } = fixture();
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: "rider",
  });
  snapshot.missileLock = {
    selfLocked: true,
    selfHomed: false,
    outgoing: { kind: "object", targetId: "rider" },
  };
  expect(sampleMissileLockView(engine)).toBeUndefined();
  snapshot.inboundMissileTargetIds = ["vehicle"];
  expect(sampleMissileLockView(engine)).toEqual({
    subjectId: "rider",
    incomingLock: false,
    inbound: true,
  });
  streamPlaybackStore.setState({ followEntityId: "recipient" });
  expect(sampleMissileLockView(engine)).toMatchObject({
    subjectId: "recipient",
    incomingLock: true,
    inbound: false,
  });
  snapshot.missileLock = undefined;
  snapshot.inboundMissileTargetIds = ["recipient"];
  expect(sampleMissileLockView(engine)).toBeUndefined();
  streamPlaybackStore.setState({ cameraMode: "freeFly" });
  expect(sampleMissileLockView(engine)).toBeUndefined();
});
