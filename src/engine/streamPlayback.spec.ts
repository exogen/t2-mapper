import { BoxGeometry, Group, Mesh, Scene, type WebGLRenderer } from "three";
import { expect, it, vi } from "vitest";
import {
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  liveDirectorStore,
  resetLiveDirector,
} from "../state/liveDirectorStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { LiveStreamAdapter } from "../stream/liveStreaming";
import type { RelayClient } from "../stream/relayClient";
import type { StreamRecording } from "../stream/types";
import { FramePriority } from "./framePriority";
import { GameEngine } from "./gameEngine";
import { StreamPlaybackSession } from "./streamPlayback";

it("retracts and restores the same follow arm for manual and directed live shots", () => {
  const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
  const snapshot = stream.getSnapshot();
  vi.spyOn(stream, "getSnapshot").mockReturnValue({
    ...snapshot,
    entities: [
      { id: "player", type: "Player", ghostIndex: 3, position: [0, 0, 0] },
    ],
  });
  const recording: StreamRecording = {
    source: "live",
    duration: Infinity,
    missionName: null,
    gameType: null,
    serverDisplayName: null,
    recorderName: null,
    recordingDate: null,
    streamingPlayback: stream,
  };
  const engine = new GameEngine();
  const scene = new Scene();
  const camera = engine.cameras.perspective;
  const root = new Group();
  const player = new Group();
  player.name = "player";
  root.add(player);
  scene.add(root);
  const wall = new Mesh(new BoxGeometry(0.5, 8, 20));
  wall.position.set(-4, 2, 0);
  wall.updateMatrixWorld();
  let frame = 0;
  const draw = () => {
    const context = {
      camera,
      delta: 1 / 60,
      elapsed: ++frame / 60,
      frame,
      renderer: {} as WebGLRenderer,
      scene,
    };
    engine.scheduler.run(FramePriority.StreamPlayback, context);
    engine.scheduler.run(FramePriority.CameraStream, context);
  };

  engineStore.getState().setRecording(recording);
  const previousRole = liveConnectionStore.getState().role;
  liveConnectionStore.setState({ role: "watcher" });
  const session = new StreamPlaybackSession(engine, recording);
  try {
    const blockedPositions = [];
    for (const directed of [false, true]) {
      if (directed) liveDirectorStore.setState({ status: "playing" });
      registerInteriorCollider("follow-wall", [wall]);
      streamPlaybackStore.setState((state) => ({
        root,
        cameraMode: "orbitOverride",
        followEntityId: player.name,
        orbitOverrideDistance: 24,
        orbitOverridePitch: 0,
        orbitOverrideYaw: 0,
        orbitSnapNonce: state.orbitSnapNonce + 1,
      }));
      draw();
      expect(camera.position.x).toBeGreaterThan(-3.75);
      expect(camera.position.x).toBeLessThan(-1);
      blockedPositions.push(camera.position.toArray());

      unregisterInteriorCollider("follow-wall");
      for (let i = 0; i < 60; i++) draw();
      expect(camera.position.x).toBeLessThan(-23);
    }
    expect(blockedPositions[0]).toEqual(blockedPositions[1]);
  } finally {
    unregisterInteriorCollider("follow-wall");
    wall.geometry.dispose();
    session.dispose();
    resetLiveDirector();
    liveConnectionStore.setState({ role: previousRole });
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
  }
});
