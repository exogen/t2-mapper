import {
  sampleClipTake,
  sameClipFollowTarget,
  type ClipSample,
  type ClipTake,
} from "../../relay/clipTypes";

export type ClipSmoothingLevel = 0 | 1 | 2;

const WINDOW_RADIUS_MS = [0, 250, 750] as const;
const TAP_INTERVAL_MS = 1000 / 60;
const kernels = new Map<
  number,
  readonly { offset: number; weight: number }[]
>();

/** Preserve first person, perspective transitions, and the recorder's original view. */
export function canSmoothClipCamera(
  cameraMode: string,
  firstPersonPose?: boolean,
): boolean {
  return (
    cameraMode !== "firstPersonOverride" &&
    cameraMode !== "original" &&
    !(cameraMode === "orbitOverride" && firstPersonPose !== undefined)
  );
}

function kernel(steps: number) {
  let result = kernels.get(steps);
  if (!result) {
    const taps = Array.from({ length: 2 * steps + 1 }, (_, index) => {
      const offset = (index - steps) / steps;
      return { offset, weight: Math.exp(-3 * offset * offset) };
    });
    const total = taps.reduce((sum, tap) => sum + tap.weight, 0);
    result = taps.map((tap) => ({ ...tap, weight: tap.weight / total }));
    kernels.set(steps, result);
  }
  return result;
}

function startsSegment(previous: ClipSample, sample: ClipSample): boolean {
  return (
    !!sample.cut ||
    sample.cameraMode !== previous.cameraMode ||
    !sameClipFollowTarget(previous, sample) ||
    (sample.orbitDistance === undefined) !==
      (previous.orbitDistance === undefined) ||
    sample.projection !== previous.projection ||
    sample.aspect !== previous.aspect ||
    canSmoothClipCamera(sample.cameraMode, sample.firstPersonPose) !==
      canSmoothClipCamera(previous.cameraMode, previous.firstPersonPose)
  );
}

function copySample(sample: ClipSample): ClipSample {
  return {
    ...sample,
    position: [...sample.position],
    quaternion: [...sample.quaternion],
  };
}

/** Bake camera motion independently of playback. Follow targets stay in the demo. */
export function smoothClipTake(
  take: ClipTake,
  level: ClipSmoothingLevel,
): ClipTake {
  if (level === 0) return take;
  const samples = take.samples.map(copySample);
  let start = 0;
  for (let end = 1; end <= samples.length; end++) {
    if (
      end < samples.length &&
      !startsSegment(take.samples[end - 1], take.samples[end])
    )
      continue;
    const { cameraMode, firstPersonPose } = take.samples[start];
    if (!canSmoothClipCamera(cameraMode, firstPersonPose)) {
      start = end;
      continue;
    }
    const followOrbit = cameraMode === "orbitOverride";
    for (let index = start + 1; index < end - 1; index++) {
      const original = take.samples[index];
      const radius = Math.min(
        WINDOW_RADIUS_MS[level],
        original.timeMs - take.samples[start].timeMs,
        take.samples[end - 1].timeMs - original.timeMs,
      );
      const position: ClipSample["position"] = [...original.position];
      const quaternion: ClipSample["quaternion"] = [0, 0, 0, 0];
      let fov = original.fov;
      let viewHeight = original.viewHeight ?? 0;
      let orbitDistance = original.orbitDistance ?? 0;
      for (const { offset, weight } of kernel(
        Math.ceil(radius / TAP_INTERVAL_MS),
      )) {
        const timeMs = Math.max(
          take.samples[start].timeMs,
          Math.min(
            take.samples[end - 1].timeMs,
            original.timeMs + radius * offset,
          ),
        );
        const nearby = sampleClipTake(take, timeMs);
        if (!followOrbit) {
          for (let axis = 0; axis < 3; axis++)
            position[axis] +=
              (nearby.position[axis] - original.position[axis]) * weight;
          fov += (nearby.fov - original.fov) * weight;
          if (original.projection === "orthographic")
            viewHeight += (nearby.viewHeight! - original.viewHeight!) * weight;
        } else if (
          !original.projectile &&
          original.orbitDistance !== undefined &&
          nearby.orbitDistance !== undefined
        ) {
          orbitDistance +=
            (nearby.orbitDistance - original.orbitDistance) * weight;
        }
        // q and -q represent the same rotation; average one local hemisphere.
        const sign =
          nearby.quaternion.reduce(
            (dot, value, axis) => dot + value * original.quaternion[axis],
            0,
          ) < 0
            ? -1
            : 1;
        for (let axis = 0; axis < 4; axis++)
          quaternion[axis] += nearby.quaternion[axis] * sign * weight;
      }
      const length = Math.hypot(...quaternion);
      samples[index] = {
        ...original,
        position,
        quaternion: quaternion.map(
          (value) => value / length,
        ) as ClipSample["quaternion"],
        fov,
        ...(original.projection === "orthographic" && { viewHeight }),
        ...(original.orbitDistance !== undefined && {
          orbitDistance,
        }),
      };
    }
    start = end;
  }
  return {
    ...take,
    ...(take.hud && { hud: { ...take.hud } }),
    samples,
  };
}
