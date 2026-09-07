import { describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import {
  DirectorObservationReplay,
  observeDirectorPoint,
} from "./liveObservation";
import { captureDirectorCamera } from "./cameraObservation";
import type {
  DirectorCameraFrame,
  DirectorStateFrame,
} from "./observationContract";

const state = (t: number, availableAtSec = t): DirectorStateFrame => ({
  streamId: "match",
  sequence: t + 1,
  timeSec: t,
  availableAtSec,
  players: [
    {
      timeSec: t,
      targetId: 42,
      targetGeneration: 0,
      clientId: 5,
      name: t < 2 ? "Runner" : "Renamed",
      teamId: 1,
      pos: [t * 10, 0, 0],
      health: 1 - t * 0.1,
    },
  ],
  flags: [
    {
      slot: 2,
      teamId: 2,
      pos: [t * 10, 0, 0],
      carrierTargetId: 42,
      status: "held",
    },
  ],
  teams: [{ teamId: 1, name: "Storm", score: t < 2 ? 0 : 1 }],
  match: { clockMs: -60000 + t * 1000, started: true, ended: false },
});
const camera = (timeSec: number): DirectorCameraFrame => ({
  streamId: "match",
  timeSec,
  availableAtSec: timeSec,
  shot: {
    id: "shot:1",
    revision: 1,
    kind: "followFlag",
    subject: { type: "flag", slot: 2 },
  },
  commitment: "committed",
  poseSource: "rendered",
  view: {
    eye: [-10, 0, 0],
    forward: [1, 0, 0],
    up: [0, 0, 1],
    verticalFovDeg: 90,
    aspect: 1,
    near: 0.1,
    far: 1000,
  },
});
const request = (timeSec: number, availableThroughSec = timeSec) => ({
  timeSec,
  availableThroughSec,
  camera: camera(timeSec),
});

describe("fresh director observations", () => {
  it("refreshes an open shot without exposing the nearer future sample", () => {
    const replay = new DirectorObservationReplay("match", [
      state(0),
      state(1),
      state(2),
    ]);
    const before = replay.observe(request(0));
    const during = replay.observe(request(1.9, 3));
    expect(during.camera?.shot).toEqual(before.camera?.shot);
    expect(during.state?.players[0]).toMatchObject({
      pos: [10, 0, 0],
      name: "Runner",
      health: 0.9,
      focus: true,
    });
    expect(during.state?.teams[0].score).toBe(0);
    expect(during.state?.match.clockMs).toBe(-59000);
    expect(during.state?.ageSec).toBeCloseTo(0.9);
    expect(before.state?.players[0].pos).toEqual([0, 0, 0]);
  });

  it("respects both picture time and evidence availability, including seeks", () => {
    const replay = new DirectorObservationReplay("match", [
      state(0),
      state(1, 3),
      state(2, 4),
    ]);
    expect(replay.observe(request(1, 2)).state?.timeSec).toBe(0);
    expect(replay.observe(request(1, 3)).state?.timeSec).toBe(1);
    expect(replay.observe(request(2, 4)).state?.timeSec).toBe(2);
    expect(replay.observe(request(0, 4)).state?.timeSec).toBe(0);
    expect(replay.observe(request(-1, 0)).state).toBeNull();
  });

  it("gives the same observations from incremental appends and batch traces", () => {
    const frames = [state(0), state(1), state(2)];
    const batch = new DirectorObservationReplay("match", frames);
    const live = new DirectorObservationReplay("match");
    for (const frame of frames) {
      live.append([frame]);
      for (const offset of [0, 0.75]) {
        const input = request(frame.timeSec + offset);
        expect(live.observe(input)).toEqual(batch.observe(input));
      }
    }
  });

  it("detaches historical identities and returned observations from mutations", () => {
    const frame = state(0);
    const replay = new DirectorObservationReplay("match", [frame]);
    const input = request(0);
    const observed = replay.observe(input);
    frame.players[0].name = "New occupant";
    frame.players[0].pos[0] = 999;
    input.camera.shot.revision = 2;
    replay.append([state(1)]);
    expect(replay.observe(request(0))).toEqual(observed);
    expect(Object.isFrozen(observed.state?.players[0].pos)).toBe(true);
    expect(Object.isFrozen(observed.camera?.shot)).toBe(true);
  });

  it("marks stale state and camera poses explicitly and declines visibility", () => {
    const replay = new DirectorObservationReplay("match", [state(0)]);
    const sight = vi.fn(() => "clear" as const);
    const oldState = replay.observe({ ...request(2), lineOfSight: sight });
    expect(oldState.state).toMatchObject({ ageSec: 2, fresh: false });
    expect(oldState.state?.players[0].camera.visibility).toBe("unknown");
    const oldCamera = replay.observe({
      ...request(0.5),
      camera: camera(0),
      lineOfSight: sight,
    });
    expect(oldCamera.camera).toMatchObject({ ageSec: 0.5, fresh: false });
    expect(oldCamera.state?.players[0].camera.visibility).toBe("unknown");
    expect(sight).not.toHaveBeenCalled();
  });

  it("does not claim a future, unavailable, provisional, or planned camera is the picture", () => {
    const replay = new DirectorObservationReplay("match", [state(0)]);
    expect(
      replay.observe({ ...request(0), camera: camera(1) }).camera,
    ).toBeNull();
    expect(
      replay.observe({
        ...request(0),
        camera: { ...camera(0), availableAtSec: 1 },
      }).camera,
    ).toBeNull();
    for (const change of [
      { commitment: "provisional" as const },
      { poseSource: "planned" as const },
    ]) {
      const result = replay.observe({
        ...request(0),
        camera: { ...camera(0), ...change },
        lineOfSight: () => "clear",
      });
      expect(result.state?.players[0].camera.visibility).toBe("unknown");
    }
  });

  it("rejects mixed epochs, gaps, reversed availability, and invalid clocks atomically", () => {
    const replay = new DirectorObservationReplay("match", [state(0)]);
    for (const frame of [
      state(2),
      { ...state(1), streamId: "other" },
      state(1, 0),
      { ...state(1), timeSec: NaN },
    ]) {
      expect(() => replay.append([frame])).toThrow();
    }
    expect(() =>
      replay.append([state(1), { ...state(2), sequence: 9 }]),
    ).toThrow();
    replay.append([state(1)]);
    expect(() => replay.observe(request(2, 1))).toThrow();
    expect(() =>
      replay.observe({
        ...request(1),
        camera: { ...camera(1), streamId: "other" },
      }),
    ).toThrow();
    expect(() =>
      replay.observe({ ...request(1), maxStateAgeSec: -1 }),
    ).toThrow();
  });
});

describe("literal camera geometry", () => {
  const view = camera(0).view!;
  it("keeps frustum inclusion separate from actual sight", () => {
    expect(observeDirectorPoint([0, 0, 0], view)).toEqual({
      inFrustum: true,
      lineOfSight: "unknown",
      visibility: "unknown",
    });
    expect(
      observeDirectorPoint([0, 0, 0], view, () => "blocked").visibility,
    ).toBe("off-camera");
    expect(
      observeDirectorPoint([0, 0, 0], view, () => "clear").visibility,
    ).toBe("estimated-visible");
  });

  it("rejects points behind, above, beside, too near, or beyond the camera", () => {
    const sight = vi.fn(() => "clear" as const);
    for (const point of [
      [-20, 0, 0],
      [0, 0, 20],
      [0, 20, 0],
      [-9.99, 0, 0],
      [1001, 0, 0],
    ] as [number, number, number][]) {
      expect(observeDirectorPoint(point, view, sight).visibility).toBe(
        "off-camera",
      );
    }
    expect(sight).not.toHaveBeenCalled();
  });

  it("handles aspect, zoom, roll, and invalid views", () => {
    expect(
      observeDirectorPoint([0, 15, 0], { ...view, aspect: 2 }).inFrustum,
    ).toBe(true);
    expect(
      observeDirectorPoint([0, 0, 8], { ...view, verticalFovDeg: 45 })
        .inFrustum,
    ).toBe(false);
    expect(
      observeDirectorPoint([0, 0, 15], { ...view, aspect: 2, up: [0, 1, 0] })
        .inFrustum,
    ).toBe(true);
    expect(
      observeDirectorPoint([0, 0, 0], { ...view, up: view.forward }).visibility,
    ).toBe("unknown");
    expect(observeDirectorPoint([NaN, 0, 0], view).visibility).toBe("unknown");
  });

  it("captures the actual camera without changing it or solving a shot", () => {
    const rendered = new PerspectiveCamera(90, 2, 0.1, 1000);
    rendered.position.set(0, 0, -10); // Torque [-10, 0, 0]
    rendered.lookAt(0, 0, 0);
    rendered.zoom = 2;
    rendered.updateProjectionMatrix();
    rendered.updateMatrixWorld();
    const before = rendered.toJSON();
    const frame = captureDirectorCamera(rendered, camera(0));
    expect(rendered.toJSON()).toEqual(before);
    expect(frame.view?.eye).toEqual([-10, 0, 0]);
    expect(frame.view?.forward[0]).toBeCloseTo(1);
    expect(frame.view?.verticalFovDeg).toBeCloseTo(53.1301);
    expect(observeDirectorPoint([0, 0, 0], frame.view!).inFrustum).toBe(true);
    rendered.setViewOffset(200, 100, 100, 0, 100, 100);
    expect(captureDirectorCamera(rendered, camera(0)).view).toBeNull();
  });
});
