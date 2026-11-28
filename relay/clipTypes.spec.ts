import { expect, it } from "vitest";
import {
  readClipCreateRequest,
  readClipTake,
  sampleClipTake,
  trimClipTake,
  MAX_CLIP_DURATION_MS,
  type ClipSample,
  type ClipTake,
} from "./clipTypes";

const frame = (
  timeMs: number,
  demoTimeSec: number,
  overrides: Partial<ClipSample> = {},
): ClipSample => ({
  timeMs,
  demoTimeSec,
  position: [timeMs, 2, 3],
  quaternion: [0, 0, 0, 1],
  fov: 70,
  aspect: 1.5,
  projection: "perspective",
  cameraMode: "freeFly",
  targetId: null,
  flagSlot: null,
  playing: true,
  rate: 1,
  ...overrides,
});
const take = (samples = [frame(0, 10), frame(1000, 11)]): ClipTake => ({
  version: 1,
  sourceDemo: "game.rec",
  samples,
});

it("accepts hosted source keys, normalizes quaternion data, and strips unknown fields", () => {
  const input = take([
    frame(0, 10, { quaternion: [0, 0, 0, 0.99] }),
    frame(1000, 11),
  ]);
  input.sourceDemo = "users/126767979894407168/upload.rec";
  const result = readClipTake({ ...input, malicious: "ignored" });
  expect(result.samples[0].quaternion).toEqual([0, 0, 0, 1]);
  expect(result).not.toHaveProperty("malicious");
  result.samples[0].position[0] = 123;
  expect(input.samples[0].position[0]).toBe(0);
});

it("preserves first-person freelook through trimming and camera cuts", () => {
  const clip = readClipTake(
    take([
      frame(0, 10, {
        cameraMode: "firstPersonOverride",
        headYaw: 0,
        firstPersonPose: false,
      }),
      frame(1000, 11, { cameraMode: "firstPersonOverride", headYaw: 0.6 }),
      frame(2000, 12, {
        cameraMode: "firstPersonOverride",
        headYaw: -0.6,
        cut: true,
      }),
    ]),
  );
  expect(sampleClipTake(clip, 500).headYaw).toBeCloseTo(0.3);
  expect(sampleClipTake(clip, 500).firstPersonPose).toBe(false);
  expect(sampleClipTake(clip, 1500).headYaw).toBe(0.6);
  expect(sampleClipTake(clip, 2000).headYaw).toBe(-0.6);
  expect(trimClipTake(clip, 500, 1800).samples[0].headYaw).toBeCloseTo(0.3);
  expect(readClipTake(take()).samples[0]).not.toHaveProperty("headYaw");
  expect(() =>
    readClipTake(take([frame(0, 10, { headYaw: 4 }), frame(1000, 11)])),
  ).toThrow("Invalid clip camera sample");
});

it.each([
  { cameraMode: "orbitOverride" },
  { cameraMode: "firstPersonOverride", firstPersonPose: false },
])(
  "uses the outside-eye pose as soon as the camera leaves the eye: %j",
  (end) => {
    const eye = frame(0, 10, {
      cameraMode: "firstPersonOverride",
      firstPersonPose: true,
      headYaw: 0.2,
      targetId: 7,
    });
    const transition = frame(32, 10.032, { targetId: 7, ...end });
    const clip = take([eye, transition]);
    expect(sampleClipTake(clip, 0)).toMatchObject({
      firstPersonPose: true,
      headYaw: 0.2,
    });
    const midpoint = sampleClipTake(clip, 16);
    expect(midpoint).toMatchObject({
      position: [16, 2, 3],
      firstPersonPose: false,
    });
    expect(midpoint).not.toHaveProperty("headYaw");
    expect(trimClipTake(clip, 12, 32).samples[0].firstPersonPose).toBe(false);

    const cut = take([eye, { ...transition, cut: true }]);
    expect(sampleClipTake(cut, 16)).toMatchObject({
      position: eye.position,
      firstPersonPose: true,
      headYaw: 0.2,
    });
  },
);

it("preserves target-relative orbit distance and projectile identity through trimming", () => {
  const projectile = { ghostIndex: 0, spawnTick: 320 };
  const clip = readClipTake(
    take([
      frame(0, 11, {
        cameraMode: "orbitOverride",
        orbitDistance: 0,
        projectile,
      }),
      frame(1000, 12, {
        cameraMode: "orbitOverride",
        orbitDistance: 10,
        projectile,
      }),
    ]),
  );
  expect(clip.samples[0].orbitDistance).toBe(0);
  const trimmed = trimClipTake(clip, 250, 750);
  expect(readClipTake(JSON.parse(JSON.stringify(trimmed)))).toEqual(trimmed);
  expect(trimmed.samples.map(({ orbitDistance }) => orbitDistance)).toEqual([
    2.5, 7.5,
  ]);
  expect(trimmed.samples.map((sample) => sample.projectile)).toEqual([
    projectile,
    projectile,
  ]);
  expect(clip.samples[0].projectile).not.toBe(projectile);
  expect(readClipTake(take()).samples[0]).not.toHaveProperty("orbitDistance");
  expect(readClipTake(take()).samples[0]).not.toHaveProperty("projectile");
});

it.each<Partial<ClipSample>>([
  { targetId: 8 },
  { flagSlot: 1 },
  { projectile: { ghostIndex: 3, spawnTick: 320 } },
])(
  "keeps the camera with the old anchor until the target changes %j",
  (anchor) => {
    const initial = {
      cameraMode: "orbitOverride",
      orbitDistance: 5,
      ...(anchor.targetId && { targetId: 7 }),
      ...(anchor.flagSlot && { flagSlot: 0 }),
      ...(anchor.projectile && {
        projectile: { ghostIndex: 3, spawnTick: 310 },
      }),
    };
    const clip = take([
      frame(0, 10, initial),
      frame(1000, 11, { ...initial, ...anchor, orbitDistance: 20 }),
    ]);
    expect(sampleClipTake(clip, 500)).toMatchObject({
      ...initial,
      demoTimeSec: 10.5,
      position: clip.samples[0].position,
    });
    expect(sampleClipTake(clip, 1000)).toMatchObject({
      ...anchor,
      orbitDistance: 20,
    });
  },
);

it("retains the saved world path during an orbit-to-eye transition", () => {
  const clip = take([
    frame(0, 10, {
      cameraMode: "orbitOverride",
      orbitDistance: 6,
      targetId: 9,
    }),
    frame(1000, 11, {
      cameraMode: "firstPersonOverride",
      firstPersonPose: false,
      targetId: 9,
    }),
    frame(2000, 12, {
      cameraMode: "firstPersonOverride",
      firstPersonPose: true,
      targetId: 9,
    }),
  ]);
  expect(sampleClipTake(clip, 500)).toMatchObject({
    position: [500, 2, 3],
    firstPersonPose: false,
  });
  expect(sampleClipTake(clip, 500)).not.toHaveProperty("orbitDistance");
  expect(() => readClipTake(trimClipTake(clip, 500, 1500))).not.toThrow();
});

it("keeps the same trim samples for legacy world-space follow clips", () => {
  const clip = take([
    frame(0, 10, { cameraMode: "orbitOverride", targetId: 3 }),
    frame(1000, 11, { cameraMode: "orbitOverride", targetId: 9 }),
    frame(2000, 12, {
      cameraMode: "firstPersonOverride",
      firstPersonPose: false,
      targetId: 9,
    }),
  ]);
  const trimmed = trimClipTake(clip, 500, 1500);
  expect(trimmed.samples.map(({ position }) => position[0])).toEqual([
    500, 1000, 1500,
  ]);
  expect(trimmed.samples[2]).not.toHaveProperty("firstPersonPose");
});

it.each([
  { orbitDistance: -1 },
  { orbitDistance: Infinity },
  { orbitDistance: 1e8 },
  { orbitDistance: 5, cameraMode: "freeFly" },
  { orbitDistance: 5, firstPersonPose: false },
  { projectile: null },
  { projectile: { ghostIndex: -1, spawnTick: 310 } },
  { projectile: { ghostIndex: 2, spawnTick: 320.5 } },
])("rejects invalid clip orbit metadata %j", (overrides) => {
  const clip = take([
    frame(0, 10, { cameraMode: "orbitOverride" }),
    { ...frame(1000, 11, { cameraMode: "orbitOverride" }), ...overrides },
  ] as ClipSample[]);
  expect(() => readClipTake(clip)).toThrow("Invalid clip camera orbit");
});

it("retains the creator's four interpolation values through validation and trimming", () => {
  const settings = {
    maxLatencyTicks: 1.5,
    maxPredictionTicks: 10,
    maxWarpTicks: 1,
    minWarpTicks: 1.25,
  };
  const clip = readClipTake({ ...take(), playerInterpolation: settings });
  expect(trimClipTake(clip, 100, 900).playerInterpolation).toEqual(settings);
  expect(readClipTake(take())).not.toHaveProperty("playerInterpolation");
  for (const invalid of [
    null,
    {},
    { ...settings, maxLatencyTicks: -1 },
    { ...settings, maxWarpTicks: 1.25 },
    { ...settings, maxWarpTicks: "3" },
  ]) {
    expect(() =>
      readClipTake({ ...take(), playerInterpolation: invalid }),
    ).toThrow("Invalid clip player interpolation");
  }
});

it("preserves and copies creator HUD settings through validation and trimming", () => {
  const input = {
    ...take(),
    hud: {
      showChat: false,
      chatHudStyle: "transparent" as const,
      showMatchHud: true,
      matchHudStyle: "broadcast" as const,
    },
  };
  const normalized = readClipTake({
    ...input,
    hud: { ...input.hud, unknown: "ignored" },
  });
  expect(normalized.hud).toEqual(input.hud);
  expect(normalized.hud).not.toBe(input.hud);
  const trimmed = trimClipTake(normalized, 100, 900);
  expect(trimmed.hud).toEqual(input.hud);
  expect(trimmed.hud).not.toBe(normalized.hud);
  trimmed.hud!.showChat = true;
  expect(normalized.hud!.showChat).toBe(false);
});

it.each([
  null,
  {},
  { showChat: "false", showMatchHud: true, matchHudStyle: "classic" },
  { showChat: true, showMatchHud: 1, matchHudStyle: "classic" },
  { showChat: true, showMatchHud: true, matchHudStyle: "unknown" },
  {
    showChat: true,
    chatHudStyle: "unknown",
    showMatchHud: true,
    matchHudStyle: "classic",
  },
  {
    showChat: true,
    chatHudStyle: null,
    showMatchHud: true,
    matchHudStyle: "classic",
  },
])("rejects invalid creator HUD settings %j", (hud) => {
  expect(() => readClipTake({ ...take(), hud })).toThrow("Invalid clip HUD");
});

it("leaves HUD settings absent for legacy clips", () => {
  const legacy = readClipTake(take());
  expect(legacy).not.toHaveProperty("hud");
  expect(trimClipTake(legacy, 100, 900)).not.toHaveProperty("hud");
});

it("preserves older HUD settings without a chat style", () => {
  const hud = { showChat: true, showMatchHud: false, matchHudStyle: "classic" };
  const normalized = readClipTake({ ...take(), hud });
  expect(normalized.hud).toEqual(hud);
  expect(trimClipTake(normalized, 100, 900).hud).toEqual(hud);
});

it("retains only active graphics effects and their strengths through trimming", () => {
  const graphicsEffects = {
    intensity: { bloom: 0.6, grain: 0, unknown: 0.9 },
    grade: { name: "Fuji Velvia 50", intensity: 0.4 },
  };
  const normalized = readClipTake({ ...take(), graphicsEffects });
  expect(trimClipTake(normalized, 100, 900).graphicsEffects).toEqual({
    intensity: { bloom: 0.6 },
    grade: { name: "Fuji Velvia 50", intensity: 0.4 },
  });
  graphicsEffects.intensity.bloom = 0;
  graphicsEffects.grade.intensity = 0;
  expect(normalized.graphicsEffects?.intensity.bloom).toBe(0.6);
  expect(normalized.graphicsEffects?.grade?.intensity).toBe(0.4);
});

it("distinguishes a clip with effects off from a clip using the viewer's effects", () => {
  const legacy = readClipTake(take());
  expect(trimClipTake(legacy, 100, 900)).not.toHaveProperty("graphicsEffects");
  const blank = readClipTake({ ...take(), graphicsEffects: { intensity: {} } });
  expect(trimClipTake(blank, 100, 900).graphicsEffects).toEqual({
    intensity: {},
  });
});

it.each([
  null,
  {},
  { intensity: [] },
  { intensity: { bloom: NaN } },
  { intensity: { grain: -0.1 } },
  { intensity: { tiltShift: "0.5" } },
  { intensity: {}, grade: { name: "Bourbon 64", intensity: 1.1 } },
  {
    intensity: {},
    grade: { name: "https://example.com/lut.png", intensity: 1 },
  },
  { intensity: {}, grade: { name: "constructor", intensity: 1 } },
])("rejects invalid clip effects %j", (graphicsEffects) => {
  expect(() => readClipTake({ ...take(), graphicsEffects })).toThrow(
    "Invalid clip graphics effects",
  );
});

it.each([
  { sourceDemo: "../private.rec" },
  { version: 2 },
  { samples: [] },
  { samples: [frame(0, 10), frame(1000, 9)] },
  { samples: [frame(0, 10), frame(0, 10)] },
  { samples: [frame(0, 10), frame(MAX_CLIP_DURATION_MS + 1, 11)] },
  { samples: [frame(0, 10), frame(1000, 11, { position: [Infinity, 0, 0] })] },
  { samples: [frame(0, 10), frame(1000, 11, { quaternion: [0, 0, 0, 0] })] },
  { samples: [frame(0, 10), frame(1000, 11, { fov: 180 })] },
  {
    samples: [frame(0, 10), { ...frame(1000, 11), fovInterpolation: "linear" }],
  },
  {
    samples: [
      frame(0, 10),
      frame(1000, 11, {
        projection: "orthographic",
        viewHeight: 100,
        fovInterpolation: "step",
      }),
    ],
  },
  { samples: [frame(0, 10), frame(1000, 11, { projection: "orthographic" })] },
])("rejects invalid clip data (%j)", (overrides) => {
  expect(() => readClipTake({ ...take(), ...overrides })).toThrow(/Invalid/);
});

it("trims at interpolated camera boundaries while retaining paused source time and camera motion", () => {
  const original = take([
    frame(0, 10),
    frame(1000, 10, { playing: false }),
    frame(2000, 11),
  ]);
  const trimmed = trimClipTake(original, 250, 1500);
  expect(
    trimmed.samples.map((sample) => [
      sample.timeMs,
      sample.demoTimeSec,
      sample.position[0],
    ]),
  ).toEqual([
    [0, 10, 250],
    [750, 10, 1000],
    [1250, 10.5, 1500],
  ]);
  expect(original.samples[0].position[0]).toBe(0);
  trimmed.samples[1].position[0] = 999;
  expect(original.samples[1].position[0]).toBe(1000);
});

it("keeps camera cuts abrupt and quaternions normalized across the shortest rotation", () => {
  const original = take([
    frame(0, 10),
    frame(1000, 11, {
      cut: true,
      position: [500, 0, 0],
      quaternion: [0, 0, 0, -1],
    }),
  ]);
  expect(sampleClipTake(original, 999).position).toEqual([0, 2, 3]);
  expect(sampleClipTake(original, 1000).position).toEqual([500, 0, 0]);
  delete original.samples[1].cut;
  expect(sampleClipTake(original, 500).quaternion).toEqual([0, 0, 0, 1]);
});

it("keeps an instant FOV change separate from camera motion", () => {
  const original = readClipTake(
    take([
      frame(0, 10),
      frame(1000, 11, {
        fov: 40,
        aspect: 2,
        quaternion: [0, 1, 0, 0],
        fovInterpolation: "step",
      }),
      frame(2000, 12, { fov: 80, aspect: 2 }),
    ]),
  );
  const halfway = sampleClipTake(original, 500);
  expect(halfway).toMatchObject({
    fov: 70,
    aspect: 1.5,
    position: [500, 2, 3],
  });
  expect(halfway.quaternion[1]).toBeCloseTo(Math.SQRT1_2);
  expect(halfway.quaternion[3]).toBeCloseTo(Math.SQRT1_2);
  expect(halfway).not.toHaveProperty("fovInterpolation");
  expect(sampleClipTake(original, 1000)).toMatchObject({
    fov: 40,
    aspect: 2,
    fovInterpolation: "step",
  });
  // The step affects its incoming segment; the unmarked segment after it
  // still uses legacy vertical interpolation.
  const afterStep = sampleClipTake(original, 1500);
  expect(afterStep.fov).toBe(60);
  expect(afterStep).not.toHaveProperty("fovInterpolation");

  const trimmed = trimClipTake(original, 250, 1250);
  expect(sampleClipTake(trimmed, 749).fov).toBe(70);
  expect(sampleClipTake(trimmed, 750).fov).toBe(40);
});

it("keeps a constant angular zoom speed through aspect changes and trimming", () => {
  const verticalFov = (horizontal: number, aspect: number) =>
    (Math.atan(Math.tan((horizontal * Math.PI) / 360) / aspect) * 360) /
    Math.PI;
  const original = readClipTake(
    take([
      frame(0, 10, { fov: verticalFov(90, 2), aspect: 2 }),
      frame(1000, 11, {
        fov: verticalFov(45, 1),
        aspect: 1,
        fovInterpolation: "horizontal",
      }),
    ]),
  );
  const halfway = sampleClipTake(original, 500);
  expect(halfway.aspect).toBe(1.5);
  expect(halfway.fov).toBeCloseTo(verticalFov(67.5, 1.5), 12);
  expect(halfway.fovInterpolation).toBe("horizontal");

  const trimmed = readClipTake(
    JSON.parse(JSON.stringify(trimClipTake(original, 250, 750))),
  );
  expect(trimmed.samples.at(-1)?.fovInterpolation).toBe("horizontal");
  expect(sampleClipTake(trimmed, 250).fov).toBeCloseTo(halfway.fov, 12);

  original.samples[1].cut = true;
  const beforeCut = sampleClipTake(original, 500);
  expect(beforeCut.fov).toBe(original.samples[0].fov);
  expect(beforeCut.aspect).toBe(2);
  expect(beforeCut.position).toEqual(original.samples[0].position);
  expect(beforeCut).not.toHaveProperty("fovInterpolation");
});

it("keeps trimmed zoom samples within the valid FOV range across aspect changes", () => {
  const original = readClipTake(
    take([
      frame(0, 10, { fov: 0.01, aspect: 0.1 }),
      frame(1000, 11, {
        fov: 0.01,
        aspect: 10,
        fovInterpolation: "horizontal",
      }),
    ]),
  );
  const trimmed = readClipTake(trimClipTake(original, 250, 750));
  expect(trimmed.samples.map((sample) => sample.fov)).toEqual([0.01, 0.01]);
});

it("retains smooth movement when a trim ends after a camera cut", () => {
  const original = take([
    frame(0, 10),
    frame(1000, 11, { cut: true }),
    frame(2000, 12),
  ]);
  const trimmed = trimClipTake(original, 500, 1500);
  expect(sampleClipTake(trimmed, 499).position).toEqual([0, 2, 3]);
  expect(sampleClipTake(trimmed, 500).position).toEqual([1000, 2, 3]);
  expect(sampleClipTake(trimmed, 750).position).toEqual([1250, 2, 3]);
  expect(trimmed.samples.at(-1)).not.toHaveProperty("cut");
  expect(trimClipTake(original, 0, 1000).samples.at(-1)?.cut).toBe(true);
});

it("keeps jump markers only at their samples and preserves transition progress through trimming", () => {
  const clip = readClipTake({
    ...take([
      frame(0, 10),
      frame(200, 10.2, { cut: true, jump: "quickCam" }),
      frame(1800, 11.8),
    ]),
    transitions: [
      {
        startMs: 200,
        durationMs: 1000,
        position: [1, 2, 3],
        quaternion: [0, 0, 0, 1],
        fov: 70,
        aspect: 1.5,
        projection: "perspective",
      },
    ],
  });
  expect(sampleClipTake(clip, 200).jump).toBe("quickCam");
  expect(sampleClipTake(clip, 201).jump).toBeUndefined();
  expect(readClipTake(trimClipTake(clip, 300, 800)).transitions).toEqual([
    { ...clip.transitions![0], startMs: -100 },
  ]);
  expect(readClipTake(trimClipTake(clip, 100, 400)).transitions).toEqual([
    { ...clip.transitions![0], startMs: 100 },
  ]);
  const trimmed = trimClipTake(clip, 1100, 1500);
  expect(readClipTake(JSON.parse(JSON.stringify(trimmed))).transitions).toEqual(
    [{ ...clip.transitions![0], startMs: -900 }],
  );
  expect(trimClipTake(clip, 1200, 1500).transitions).toBeUndefined();
  expect(() =>
    readClipTake({
      ...clip,
      transitions: [{ ...clip.transitions![0], durationMs: 1001 }],
    }),
  ).toThrow("Invalid clip camera transition");
});

it("reloads adjacent transitions after trimming while rejecting real overlaps", () => {
  const clip = readClipTake({
    ...take([
      frame(0, 10),
      frame(100.111, 10.1, { cut: true, jump: "quickCam" }),
      frame(250.019, 10.25, { cut: true, jump: "quickCam" }),
      frame(1000, 11),
    ]),
    transitions: [
      {
        ...frame(0, 10),
        startMs: 100.111,
        durationMs: 250.019 - 100.111,
      },
      { ...frame(100.111, 10.1), startMs: 250.019, durationMs: 600 },
    ],
  });
  const trimmed = trimClipTake(clip, 124, 700);
  expect(readClipTake(JSON.parse(JSON.stringify(trimmed)))).toEqual(trimmed);

  const [first, next] = trimmed.transitions!;
  expect(() =>
    readClipTake({
      ...trimmed,
      transitions: [first, { ...next, startMs: next.startMs - 0.001 }],
    }),
  ).toThrow("Invalid clip camera transition");
});

it.each([undefined, 0, 0.25])(
  "preserves camera aim timing %s through trimming and reload",
  (aimLead) => {
    const clip = readClipTake({
      ...take(),
      transitions: [
        { ...frame(0, 10), startMs: 100, durationMs: 300, aimLead },
      ],
    });
    const trimmed = trimClipTake(clip, 200, 900);
    const reloaded = readClipTake(JSON.parse(JSON.stringify(trimmed)));
    expect(reloaded.transitions?.[0]).toMatchObject({
      startMs: -100,
      durationMs: 300,
    });
    expect(reloaded.transitions?.[0].aimLead).toBe(aimLead);
  },
);

it.each([-0.001, 0.251, NaN, Infinity, null, "0.2"])(
  "rejects invalid camera aim timing %j",
  (aimLead) => {
    expect(() =>
      readClipTake({
        ...take(),
        transitions: [
          { ...frame(0, 10), startMs: 100, durationMs: 300, aimLead },
        ],
      }),
    ).toThrow("Invalid clip camera transition");
  },
);

it("copies the outgoing camera anchor when reading and trimming a take", () => {
  const anchor = {
    kind: "orbit",
    distance: 8,
    targetId: null,
    flagSlot: null,
    projectile: { ghostIndex: 42, spawnTick: 100 },
  } as const;
  const clip = readClipTake({
    ...take(),
    transitions: [{ ...frame(0, 10), startMs: 100, durationMs: 300, anchor }],
  });
  const readAnchor = clip.transitions?.[0].anchor;
  const trimmedAnchor = trimClipTake(clip, 200, 900).transitions?.[0].anchor;
  expect(readAnchor).toEqual(anchor);
  expect(readAnchor).not.toBe(anchor);
  expect(trimmedAnchor).toEqual(anchor);
  expect(trimmedAnchor).not.toBe(readAnchor);
  expect(trimmedAnchor?.kind === "orbit" && trimmedAnchor.projectile).not.toBe(
    readAnchor?.kind === "orbit" && readAnchor.projectile,
  );
});

it.each([
  { kind: "playerEye", targetId: null },
  { kind: "playerEye", targetId: 65_536 },
  { kind: "orbit", distance: -1, targetId: 1, flagSlot: null },
  { kind: "orbit", distance: 8, targetId: null, flagSlot: null },
  {
    kind: "orbit",
    distance: 8,
    targetId: null,
    flagSlot: null,
    projectile: { ghostIndex: 42, spawnTick: -1 },
  },
])("rejects an invalid outgoing camera anchor %j", (anchor) => {
  expect(() =>
    readClipTake({
      ...take(),
      transitions: [{ ...frame(0, 10), startMs: 100, durationMs: 300, anchor }],
    }),
  ).toThrow("Invalid clip camera transition");
});

it("accepts a 60-second clip and rejects one past the recording limit", () => {
  expect(MAX_CLIP_DURATION_MS).toBe(60_000);
  expect(() =>
    readClipTake(take([frame(0, 10), frame(60_000, 70)])),
  ).not.toThrow();
  expect(() => readClipTake(take([frame(0, 10), frame(60_001, 70)]))).toThrow(
    /Invalid/,
  );
});

it("validates an idempotent create request and rejects invalid trim ranges", () => {
  const request = {
    requestId: "12345678-1234-4123-8123-123456789abc",
    sourceBytes: 1024,
    take: take(),
    trimStartMs: 0,
    trimEndMs: 1000,
  };
  expect(readClipCreateRequest(request)).toEqual(request);
  expect(() =>
    readClipCreateRequest({ ...request, trimStartMs: 1000 }),
  ).toThrow(/start and end/);
  expect(() => readClipCreateRequest({ ...request, requestId: "bad" })).toThrow(
    /request ID/,
  );
  expect(() =>
    readClipCreateRequest({ ...request, sourceSha256: "bad" }),
  ).toThrow(/source fingerprint/);
  const legacy = {
    ...request,
    sourceBytes: undefined,
    sourceSha256: "a".repeat(64),
  };
  expect(readClipCreateRequest(legacy)).toEqual(legacy);
  for (const sourceBytes of [undefined, null, 0, -1, 1.5, "1024", 2 ** 53])
    expect(() => readClipCreateRequest({ ...request, sourceBytes })).toThrow(
      /source size/,
    );
});
