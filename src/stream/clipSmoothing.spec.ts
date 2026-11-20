import { expect, it } from "vitest";
import {
  readClipTake,
  sampleClipTake,
  trimClipTake,
  type ClipSample,
  type ClipTake,
} from "../../relay/clipTypes";
import { smoothClipTake } from "./clipSmoothing";

function sample(
  timeMs: number,
  overrides: Partial<ClipSample> = {},
): ClipSample {
  return {
    timeMs,
    demoTimeSec: 10 + timeMs / 1000,
    position: [timeMs / 1000, 2, 3],
    quaternion: [0, 0, 0, 1],
    fov: 75,
    aspect: 16 / 9,
    projection: "perspective",
    cameraMode: "freeFly",
    targetId: null,
    flagSlot: null,
    rate: 1,
    playing: true,
    ...overrides,
  };
}

function take(samples: ClipSample[]): ClipTake {
  return {
    version: 1,
    sourceDemo: "test.rec",
    samples,
    hud: { showChat: false, showMatchHud: true, matchHudStyle: "classic" },
  };
}

it("keeps Off exact and leaves the original take untouched at every strength", () => {
  const input = take([
    sample(0),
    sample(100, { position: [10, 2, 3] }),
    sample(200),
  ]);
  const before = structuredClone(input);
  expect(smoothClipTake(input, 0)).toBe(input);
  for (const level of [1, 2] as const) {
    const smoothed = smoothClipTake(input, level);
    expect(smoothed).not.toBe(input);
    expect(smoothed.samples[1].position[0]).toBeLessThan(10);
    smoothed.samples[0].position[0] = 100;
    smoothed.hud!.showChat = true;
    expect(input).toEqual(before);
  }
});

it("progressively damps jitter while preserving endpoint poses and transport", () => {
  const input = take(
    Array.from({ length: 121 }, (_, index) => {
      const timeMs = (index * 1000) / 30;
      const jitter = Math.sin((timeMs / 1000) * 2 * Math.PI * 5);
      return sample(timeMs, {
        demoTimeSec: index < 60 ? 10 : 10 + (timeMs - 2000) * 0.002,
        playing: index >= 60,
        rate: index < 60 ? 0.25 : 2,
        position: [timeMs / 1000 + jitter, 2, 3],
        fov: 75 + jitter,
      });
    }),
  );
  const residual = (smoothed: ClipTake) =>
    smoothed.samples
      .slice(30, 90)
      .reduce(
        (total, frame) =>
          total + (frame.position[0] - frame.timeMs / 1000) ** 2,
        0,
      );
  let previous = residual(input);
  for (const level of [1, 2] as const) {
    const result = smoothClipTake(input, level);
    expect(residual(result)).toBeLessThan(previous);
    previous = residual(result);
    expect(result.samples[0]).toEqual(input.samples[0]);
    expect(result.samples.at(-1)).toEqual(input.samples.at(-1));
    for (const [index, frame] of result.samples.entries()) {
      const {
        position: _position,
        quaternion: _quaternion,
        fov: _fov,
        ...unchanged
      } = frame;
      const {
        position: _p,
        quaternion: _q,
        fov: _f,
        ...original
      } = input.samples[index];
      expect(unchanged).toEqual(original);
    }
    expect(() => readClipTake(result)).not.toThrow();
  }
});

it.each(["firstPersonOverride", "original"])(
  "keeps %s samples exact while smoothing the surrounding camera segments",
  (cameraMode) => {
    const input = take(
      Array.from({ length: 63 }, (_, index) =>
        sample(index * 50, {
          cameraMode: index >= 21 && index < 42 ? cameraMode : "freeFly",
          cut: index === 21 || index === 42,
          position: [index % 2 ? 10 : 0, 2, 3],
          quaternion: index % 2 ? [0, 0.7071068, 0, 0.7071068] : [0, 0, 0, 1],
          fov: index % 2 ? 100 : 75,
        }),
      ),
    );
    for (const level of [1, 2] as const) {
      const result = smoothClipTake(input, level);
      expect(result.samples.slice(21, 42)).toEqual(input.samples.slice(21, 42));
      for (const index of [10, 52]) {
        expect(result.samples[index].position).not.toEqual(
          input.samples[index].position,
        );
        expect(result.samples[index].quaternion).not.toEqual(
          input.samples[index].quaternion,
        );
        expect(result.samples[index].fov).not.toBe(input.samples[index].fov);
      }
      for (const time of [1050, 1123, 1555, 2049]) {
        expect(sampleClipTake(result, time)).toEqual(
          sampleClipTake(input, time),
        );
      }
      const protectedTake = take(
        input.samples.slice(21, 42).map((sample) => ({
          ...sample,
          timeMs: sample.timeMs - 1050,
        })),
      );
      const protectedResult = smoothClipTake(protectedTake, level);
      expect(protectedResult).toEqual(protectedTake);
      expect(readClipTake(trimClipTake(result, 1050, 2050))).toEqual(
        readClipTake(trimClipTake(input, 1050, 2050)),
      );
      protectedResult.samples[1].quaternion[0] = 1;
      expect(protectedTake.samples[1].quaternion[0]).toBe(0);
    }
  },
);

it("does not smooth a pullback into the surrounding steady orbit", () => {
  const input = take(
    Array.from({ length: 14 }, (_, index) =>
      sample(index * 25, {
        cameraMode: index === 0 ? "firstPersonOverride" : "orbitOverride",
        ...(index === 0 && { firstPersonPose: true }),
        ...(index >= 1 && index <= 4 && { firstPersonPose: false }),
        ...(index > 4 && { orbitDistance: index % 2 ? 2 : 8 }),
        position: [index % 2 ? 10 : 0, 0, 0],
      }),
    ),
  );

  for (const level of [1, 2] as const) {
    const smoothed = smoothClipTake(input, level);
    expect(smoothed.samples.slice(0, 6)).toEqual(input.samples.slice(0, 6));
    expect(smoothed.samples[8].position).toEqual(input.samples[8].position);
    expect(smoothed.samples[8].orbitDistance).toBeLessThan(8);
    expect(sampleClipTake(smoothed, 113)).toEqual(sampleClipTake(input, 113));
  }
});

it.each<Partial<ClipSample>>([
  { targetId: 12 },
  { flagSlot: 1 },
  { projectile: { ghostIndex: 6, spawnTick: 309 } },
])("smooths the orbit independently of follow target motion %j", (anchor) => {
  const input = take(
    Array.from({ length: 9 }, (_, index) =>
      sample(index * 50, {
        ...anchor,
        cameraMode: "orbitOverride",
        orbitDistance: index === 4 ? 16 : 4,
        position: [index * 8, index % 2, 0],
        quaternion: index === 4 ? [0, 0.7071068, 0, 0.7071068] : [0, 0, 0, 1],
        fov: 75 + (index % 2),
      }),
    ),
  );
  const smoothed = smoothClipTake(input, 2);
  expect(smoothed.samples.map((frame) => frame.position)).toEqual(
    input.samples.map((frame) => frame.position),
  );
  expect(smoothed.samples.map((frame) => frame.fov)).toEqual(
    input.samples.map((frame) => frame.fov),
  );
  expect(smoothed.samples[4].quaternion[1]).toBeLessThan(0.7071068);
  if (anchor.projectile) {
    expect(smoothed.samples[4].orbitDistance).toBe(16);
  } else {
    expect(smoothed.samples[4].orbitDistance).toBeLessThan(16);
    expect(smoothed.samples[4].orbitDistance).toBeGreaterThan(4);
  }
  expect(() => readClipTake(smoothed)).not.toThrow();
});

it("separates reused projectile ghost slots into separate orbit segments", () => {
  const input = take(
    Array.from({ length: 10 }, (_, index) =>
      sample(index * 40, {
        cameraMode: "orbitOverride",
        projectile: { ghostIndex: 3, spawnTick: index < 5 ? 300 : 306 },
        orbitDistance: 6,
        quaternion: index < 5 ? [0, 0, 0, 1] : [0, 1, 0, 0],
      }),
    ),
  );
  expect(smoothClipTake(input, 2)).toEqual(input);
});

it("preserves straight motion with uneven sample spacing instead of favoring dense frames", () => {
  const input = take(
    [0, 2, 5, 25, 50, 100, 220, 250, 400, 1000].map((timeMs) => sample(timeMs)),
  );
  const result = smoothClipTake(input, 2);
  result.samples.forEach((frame, index) => {
    expect(frame.position[0]).toBeCloseTo(input.samples[index].position[0], 12);
  });
});

it.each([
  { fov: 0.01, position: [-1e7, -1e7, -1e7], viewHeight: 0.001 },
  { fov: 179, position: [1e7, 1e7, 1e7], viewHeight: 1e7 },
])("keeps constant camera values valid at the format limits: %j", (limits) => {
  const input = take(
    Array.from({ length: 31 }, (_, index) =>
      sample((index * 1000) / 30, {
        ...limits,
        position: limits.position as ClipSample["position"],
        projection: "orthographic",
      }),
    ),
  );
  for (const level of [1, 2] as const) {
    const smoothed = smoothClipTake(input, level);
    expect(smoothed).toEqual(input);
    expect(() => readClipTake(smoothed)).not.toThrow();
  }
});

it.each<Partial<ClipSample>>([
  { cut: true },
  { cameraMode: "orbitOverride" },
  { targetId: 7 },
  { flagSlot: 1 },
  { projection: "orthographic", viewHeight: 100 },
  { aspect: 1 },
])("does not mix the poses across a camera boundary %j", (boundary) => {
  const samples = Array.from({ length: 12 }, (_, index) =>
    sample(index * 50, {
      position: [index < 6 ? 0 : 1000, 0, 0],
      ...(index >= 6 && boundary),
      ...(index !== 6 && { cut: false }),
    }),
  );
  const result = smoothClipTake(take(samples), 2);
  result.samples.forEach((frame, index) => {
    expect(frame.position[0]).toBeCloseTo(index < 6 ? 0 : 1000, 10);
    expect(frame.cut).toBe(samples[index].cut);
  });
});

it("smooths rotation across the quaternion sign boundary without a full turn", () => {
  const input = take(
    Array.from({ length: 31 }, (_, index) => {
      const angle = ((175 + (index % 2 ? 10 : 0)) * Math.PI) / 180;
      const sign = index % 3 ? 1 : -1;
      return sample((index * 1000) / 30, {
        quaternion: [
          0,
          Math.sin(angle / 2) * sign,
          0,
          Math.cos(angle / 2) * sign,
        ],
      });
    }),
  );
  const result = smoothClipTake(input, 2);
  for (const frame of result.samples.slice(7, 23)) {
    expect(Math.hypot(...frame.quaternion)).toBeCloseTo(1, 12);
    expect(Math.abs(frame.quaternion[1])).toBeGreaterThan(0.999);
    expect(Math.abs(frame.quaternion[3])).toBeLessThan(0.01);
  }
});

it("preserves single-frame segments and smooths orthographic zoom safely", () => {
  const input = take([
    sample(0),
    ...Array.from({ length: 9 }, (_, index) =>
      sample((index + 1) * 50, {
        cameraMode: "commandCircuit",
        cut: index === 0,
        projection: "orthographic",
        viewHeight: index === 4 ? 200 : 100,
      }),
    ),
  ]);
  const result = smoothClipTake(input, 2);
  expect(result.samples[0]).toEqual(input.samples[0]);
  expect(result.samples[5].viewHeight).toBeGreaterThan(100);
  expect(result.samples[5].viewHeight).toBeLessThan(200);
  expect(() => readClipTake(result)).not.toThrow();
});

it("produces the same camera samples after validation, persistence and trimming", () => {
  const input = take(
    Array.from({ length: 31 }, (_, index) =>
      sample((index * 1000) / 30, {
        position: [index % 2, index, 0],
      }),
    ),
  );
  const preview = smoothClipTake(input, 2);
  const persisted = readClipTake(
    JSON.parse(JSON.stringify(trimClipTake(preview, 123, 876))),
  );
  const expected = sampleClipTake(preview, 500);
  const actual = sampleClipTake(persisted, 500 - 123);
  expect(actual.position).toEqual(expected.position);
  actual.quaternion.forEach((value, index) =>
    expect(value).toBeCloseTo(expected.quaternion[index], 12),
  );
  expect(persisted.hud).toEqual(input.hud);
  expect(smoothClipTake(input, 2)).toEqual(preview);
  expect(smoothClipTake(input, 0)).toBe(input);
});
