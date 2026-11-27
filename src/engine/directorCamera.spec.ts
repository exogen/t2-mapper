import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, PerspectiveCamera, Vector3 } from "three";
import type { FlagStatus } from "../../relay/serverMessageDecode";
import { CAST_CONTRACT_VERSION } from "../director/castContract";
import type { Shot } from "../director/types";
import { cameraRegistry } from "../state/cameraRegistry";
import { demoDirectorStore } from "../state/demoDirectorStore";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import type { StreamSnapshot } from "../stream/types";
import { installDirectorCamera } from "./directorCamera";
import type { FrameContext } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";

vi.mock("../state/inputControls", () => ({ subscribeAction: () => () => {} }));

function fixedFlagShot(framing: "establishing" | "room" | "archive") {
  const shot: Extract<Shot, { kind: "fixedOrbit" }> = {
    kind: "fixedOrbit",
    startSec: 0,
    endSec: 10,
    transitionIn: "cut",
    reason: "Framing the flag stand",
    center: [0, 0, 0],
    radius: 20,
    angularSpeed: 0,
    lookSubject: { type: "flag", slot: 1 },
    trackSubject: framing === "room",
    coverageCutIn: framing === "archive",
    staged: { angle: 0, radius: 20, liftFactor: 0.3, visibility: 1 },
  };
  const camera = new PerspectiveCamera();
  const root = new Group();
  const flag = new Group();
  flag.name = "flag";
  root.add(flag);
  cameraRegistry.perspective = camera;
  streamPlaybackStore.setState({ root });
  gameEntityStore.getState().setAllStreamEntities([
    {
      id: flag.name,
      className: "Item",
      renderType: "Shape",
      targetRenderFlags: 2,
      teamId: 1,
    },
  ]);
  demoDirectorStore.setState({
    status: "playing",
    plan: {
      contractVersion: CAST_CONTRACT_VERSION,
      gameMode: "ctf",
      shots: [shot],
      coverage: [],
    },
  });
  engineStore.setState((state) => ({
    playback: { ...state.playback, status: "playing", rate: 1 },
  }));
  let frame!: (context: Pick<FrameContext, "camera" | "delta">) => void;
  const invalidate = vi.fn();
  const dispose = installDirectorCamera({
    invalidate,
    scheduler: {
      add: (_priority: number, callback: typeof frame) => {
        frame = callback;
        return () => {};
      },
    },
  } as unknown as GameEngine);
  const step = (time: number) => {
    streamClock.time = time;
    frame({ camera, delta: 1 / 60 });
  };
  const setStatus = (status: FlagStatus) => {
    setStreamSnapshot({ flags: [{ teamId: 1, status }] } as StreamSnapshot);
  };
  return { camera, flag, shot, step, setStatus, dispose, invalidate };
}

afterEach(() => {
  streamClock.time = 0;
  cameraRegistry.perspective = null;
  setStreamSnapshot(null);
  demoDirectorStore.setState(demoDirectorStore.getInitialState(), true);
  engineStore.setState(engineStore.getInitialState(), true);
  gameEntityStore.setState(gameEntityStore.getInitialState(), true);
  streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
});

describe("fixed flag framing", () => {
  it.each([
    { status: "held", framing: "establishing", holds: true },
    { status: "field", framing: "establishing", holds: false },
    { status: "held", framing: "room", holds: false },
    { status: "held", framing: "archive", holds: false },
  ] as const)(
    "holds=$holds for a $status flag in an $framing shot",
    ({ status, framing, holds }) => {
      const { camera, flag, step, setStatus, dispose } = fixedFlagShot(framing);
      try {
        setStatus("home");
        for (let n = 0; n <= 120; n++) step(n / 60);
        const directionAtTouch = camera.getWorldDirection(new Vector3());
        const eyeAtTouch = camera.position.clone();
        setStatus(status);
        for (let n = 1; n <= 120; n++) {
          flag.position.z = n * 0.9;
          step(2 + n / 60);
        }
        const turn = directionAtTouch.angleTo(
          camera.getWorldDirection(new Vector3()),
        );
        if (holds) {
          expect(turn).toBeCloseTo(0);
          expect(camera.position.toArray()).toEqual(eyeAtTouch.toArray());
        } else {
          expect(turn).toBeGreaterThan(0.2);
        }
      } finally {
        dispose();
      }
    },
  );
});

it("renders a replacement cast with fewer shots at the same playhead", () => {
  const { camera, shot, step, dispose, invalidate } =
    fixedFlagShot("establishing");
  try {
    const plan = demoDirectorStore.getState().plan!;
    demoDirectorStore.setState({
      plan: {
        ...plan,
        shots: [
          { ...shot, endSec: 3 },
          { ...shot, startSec: 3, endSec: 6 },
          { ...shot, startSec: 6 },
        ],
      },
    });
    step(8);
    const before = camera.position.clone();

    engineStore.getState().setPlaybackStatus("paused");
    invalidate.mockClear();
    demoDirectorStore.setState({
      plan: {
        ...plan,
        shots: [{ ...shot, center: [200, 0, 0] }],
      },
    });
    expect(invalidate).toHaveBeenCalledOnce();
    step(8);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(100);
  } finally {
    dispose();
  }
});
