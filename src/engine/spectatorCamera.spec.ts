import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../state/inputControls", () => ({ subscribeAction: () => () => {} }));
import { PerspectiveCamera } from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { engineStore } from "../state/engineStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { replayConnectionStore } from "../state/replayConnectionStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { ReplayStreamAdapter } from "../stream/replayStreaming";
import type { RelayClient } from "../stream/relayClient";
import type { StreamSnapshot } from "../stream/types";
import type { ReplayState } from "../../relay/replayTypes";
import type { GameEngine } from "./gameEngine";
import type { FrameContext } from "./frameScheduler";
import { installSpectator } from "./spectatorCamera";

describe("replay spectator camera lifecycle", () => {
  let dispose: (() => void) | null = null;
  let frame: () => void;
  beforeEach(() => {
    replayConnectionStore.getState().leave();
    liveConnectionStore.setState({
      adapter: null,
      watchStatus: null,
      liveReady: false,
      role: null,
    });
    streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
    cameraRegistry.perspective = new PerspectiveCamera();
    const engine = {
      scheduler: {
        add: (_priority: number, callback: (context: FrameContext) => void) => {
          frame = () => callback({} as FrameContext);
          return () => {};
        },
      },
    } as unknown as GameEngine;
    dispose = installSpectator(engine);
  });
  afterEach(() => {
    dispose?.();
    replayConnectionStore.getState().leave();
    engineStore.getState().setRecording(null);
    cameraRegistry.perspective = null;
  });

  it("places once and preserves the entirely local camera across pause, seek and reconnect hydration", () => {
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    adapter.missionName = "Katabatic";
    adapter.hasControlObject = () => true;
    adapter.getSnapshot = () =>
      ({
        timeSec: 0,
        entities: [],
        camera: { position: [10, 20, 30], yaw: 0, pitch: 0 },
      }) as unknown as StreamSnapshot;
    replayConnectionStore.setState({
      adapter,
      sessionId: "room",
      missionIdentity: JSON.stringify(["7", "katabatic"]),
      ready: true,
      state: { sessionId: "room", status: "paused" } as ReplayState,
    });
    frame();
    expect(cameraRegistry.perspective!.position.toArray()).toEqual([
      20, 30, 10,
    ]);
    cameraRegistry.perspective!.position.set(100, 200, 300);
    for (const status of ["seeking", "paused", "playing"] as const) {
      replayConnectionStore.setState({
        ready: false,
        state: { sessionId: "room", status } as ReplayState,
      });
      frame();
      replayConnectionStore.setState({ ready: true });
      frame();
      expect(cameraRegistry.perspective!.position.toArray()).toEqual([
        100, 200, 300,
      ]);
    }
    expect(engineStore.getState().playback.recording?.streamingPlayback).toBe(
      adapter,
    );
  });

  it("keeps EOF attached for inspection and places afresh only for a changed mission", () => {
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    adapter.missionName = "Katabatic";
    adapter.hasControlObject = () => true;
    adapter.getSnapshot = () =>
      ({
        timeSec: 0,
        entities: [],
        camera: { position: [10, 20, 30], yaw: 0, pitch: 0 },
      }) as unknown as StreamSnapshot;
    replayConnectionStore.setState({
      adapter,
      sessionId: "room",
      missionIdentity: JSON.stringify(["7", "katabatic"]),
      ready: true,
      state: { sessionId: "room", status: "paused" } as ReplayState,
    });
    frame();
    cameraRegistry.perspective!.position.set(100, 200, 300);
    replayConnectionStore.setState({
      state: { sessionId: "room", status: "ended" } as ReplayState,
    });
    frame();
    expect(engineStore.getState().playback.recording?.streamingPlayback).toBe(
      adapter,
    );
    expect(cameraRegistry.perspective!.position.toArray()).toEqual([
      100, 200, 300,
    ]);
    adapter.missionName = "Riverdance";
    replayConnectionStore.setState({ ready: false });
    replayConnectionStore.setState({
      ready: true,
      missionIdentity: JSON.stringify(["8", "riverdance"]),
    });
    frame();
    expect(cameraRegistry.perspective!.position.toArray()).toEqual([
      20, 30, 10,
    ]);
  });

  it("places afresh when a streamed mission restarts on the same map", () => {
    const adapter = new ReplayStreamAdapter({} as RelayClient);
    adapter.missionName = "Katabatic";
    adapter.hasControlObject = () => true;
    adapter.getSnapshot = () =>
      ({
        timeSec: 0,
        entities: [],
        camera: { position: [10, 20, 30], yaw: 0, pitch: 0 },
      }) as unknown as StreamSnapshot;
    replayConnectionStore.setState({
      adapter,
      sessionId: "room",
      missionIdentity: JSON.stringify(["7", "katabatic"]),
      ready: true,
      state: { sessionId: "room", status: "playing" } as ReplayState,
    });
    frame();
    cameraRegistry.perspective!.position.set(100, 200, 300);
    replayConnectionStore.setState({
      missionIdentity: JSON.stringify(["8", "katabatic"]),
    });
    frame();
    expect(cameraRegistry.perspective!.position.toArray()).toEqual([
      20, 30, 10,
    ]);
  });
});
