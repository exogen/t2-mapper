import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useInputAction } from "./InputControls";
import {
  Box3,
  Camera,
  CatmullRomCurve3,
  Euler,
  Vector3,
  Quaternion,
  Matrix4,
  Scene,
} from "three";
import { cameraTourStore } from "../state/cameraTourStore";
import type { TourAnimation } from "../state/cameraTourStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import type { TourTarget } from "./mapTourCategories";
import { globalFogUniforms } from "../globalFogUniforms";
import { createLogger } from "../logger";

const log = createLogger("CameraTourConsumer");

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const FALLBACK_ORBIT_RADIUS = 3;
/** Orbit radius for entities without geometry (WayPoints, markers, etc.). */
const POINT_ORBIT_RADIUS = 10;
const DEFAULT_ORBIT_HEIGHT = 2;
const MIN_ORBIT_RADIUS = 1.8;
/** Orbit radius above which fog starts reducing during tours. */
const FOG_REDUCE_THRESHOLD = 50;
/** Divisor for fog scale: fogDistanceScale = orbitRadius / FOG_REDUCE_DIVISOR.
 *  Smaller values = more aggressive fog reduction. */
const FOG_REDUCE_DIVISOR = 200;
/** Speed at which fogDistanceScale animates (per second). */
const FOG_SCALE_SPEED = 2;
/** Extra orbit radius added beyond half the object's height. */
const ORBIT_PAD_VERTICAL = 1.8;
/** Extra orbit radius added beyond half the object's spread (width/length). */
const ORBIT_PAD_HORIZONTAL = 1.2;
const ORBIT_ANGULAR_SPEED = 0.6; // rad/s
const ORBIT_SWEEP = (3 / 4) * (2 * Math.PI); // 270 degrees
const ORBIT_CONSTANT_DURATION = ORBIT_SWEEP / ORBIT_ANGULAR_SPEED;
const ORBIT_EASE_OUT_DURATION = 1.5; // seconds to decelerate to stop
const MIN_TRAVEL_DURATION = 1.5;
const MAX_TRAVEL_DURATION = 6.0;
const TRAVEL_SPEED = 180; // units/s for duration calc
/** Orientation completes at this fraction of total travel time (runs ahead of position). */
const LOOK_LEAD = 1.4;

// Reusable temp objects to avoid GC pressure.
const _box = new Box3();
const _localBox = new Box3();
const _childBox = new Box3();
const _childMat = new Matrix4();
const _center = new Vector3();
const _size = new Vector3();
const _v = new Vector3();
const _v3 = new Vector3();
const _vFocus = new Vector3();
const _q = new Quaternion();
const _qTarget = new Quaternion();
const _mat = new Matrix4();
const _euler = new Euler();

/** Get the orbit focus point: resolved bounding box center or raw position. */
function orbitFocus(animation: TourAnimation): Vector3 {
  if (animation.orbitCenter) {
    return _vFocus.set(
      animation.orbitCenter[0],
      animation.orbitCenter[1],
      animation.orbitCenter[2],
    );
  }
  const target = animation.targets[animation.currentIndex];
  return _vFocus.set(
    target.position[0],
    target.position[1],
    target.position[2],
  );
}

function getOrbitRadius(animation: TourAnimation): number {
  return animation.orbitRadius ?? FALLBACK_ORBIT_RADIUS;
}

function getOrbitHeight(animation: TourAnimation): number {
  const r = getOrbitRadius(animation);
  return r * (DEFAULT_ORBIT_HEIGHT / FALLBACK_ORBIT_RADIUS);
}

function orbitPoint(
  animation: TourAnimation,
  angle: number,
  out: Vector3,
): Vector3 {
  const focus = orbitFocus(animation);
  const r = getOrbitRadius(animation);
  const h = getOrbitHeight(animation);
  return out.set(
    focus.x + Math.cos(angle) * r,
    focus.y + h,
    focus.z + Math.sin(angle) * r,
  );
}

/** Resolve bounding box of the target entity from the scene graph. */
function resolveTargetBounds(
  scene: Scene,
  target: TourTarget,
  animation: TourAnimation,
): void {
  const obj = scene.getObjectByName(target.entityId);
  // Check if the scene object has any geometry to compute bounds from.
  let hasGeometry = false;
  if (obj) {
    obj.traverse((child: any) => {
      if (child.geometry) hasGeometry = true;
    });
  }
  if (obj && !hasGeometry) {
    // Entity exists but has no geometry (WayPoints, markers, etc.).
    // Use target position directly with a wider orbit.
    animation.orbitCenter = [...target.position];
    animation.orbitRadius = POINT_ORBIT_RADIUS;
    return;
  }
  if (obj && hasGeometry) {
    // World-space AABB center for the orbit focus (where the camera looks).
    _box.setFromObject(obj);
    _box.getCenter(_center);
    animation.orbitCenter = [_center.x, _center.y, _center.z];

    // Local-space AABB for sizing. World-space boxes inflate with rotation,
    // giving different sizes for identical models at different orientations.
    // Instead, transform each child geometry's box into the root object's
    // local frame so the size is rotation-independent.
    const invWorld = _mat.copy(obj.matrixWorld).invert();
    _localBox.makeEmpty();
    obj.traverse((child: any) => {
      if (!child.geometry) return;
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
      _childBox.copy(child.geometry.boundingBox);
      _childMat.multiplyMatrices(invWorld, child.matrixWorld);
      _childBox.applyMatrix4(_childMat);
      _localBox.union(_childBox);
    });
    _localBox.getSize(_size);
    // Pad each dimension's half-extent, then take the larger result.
    // This gives a consistent standoff distance regardless of object size.
    const height = _size.y; // Three.js Y-up
    const spread = Math.max(_size.x, _size.z);
    const fromHeight = height / 2 + ORBIT_PAD_VERTICAL;
    const fromSpread = spread / 2 + ORBIT_PAD_HORIZONTAL;
    const computed = Math.max(fromHeight, fromSpread);
    // For very large objects (terrain, water), use target position as orbit
    // center and compute a stable radius from the single-tile geometry bounds
    // (setFromObject includes dynamic instanced tiles that vary with camera).
    const isLarge = computed > 200;
    if (isLarge) {
      animation.orbitCenter = [...target.position];
      // Use only the first geometry child's bounds for stable sizing.
      let stableSpread = 0;
      obj.traverse((child: any) => {
        if (stableSpread > 0 || !child.geometry) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const bb = child.geometry.boundingBox;
        const sx = bb.max.x - bb.min.x;
        const sy = bb.max.y - bb.min.y;
        const sz = bb.max.z - bb.min.z;
        stableSpread = Math.max(sx, sy, sz);
      });
      const stableRadius = (stableSpread / 2 + ORBIT_PAD_HORIZONTAL) * 0.75;
      animation.orbitRadius = Math.max(MIN_ORBIT_RADIUS, stableRadius);
    } else {
      animation.orbitRadius = Math.max(MIN_ORBIT_RADIUS, computed);
    }
    const driver = fromHeight >= fromSpread ? "height" : "spread";
    const clamp = computed < MIN_ORBIT_RADIUS ? " (clamped)" : "";
    log.debug(
      "%s: size=%s height→%s spread→%s driven by %s → radius=%d%s",
      target.label,
      `${_size.x.toFixed(1)}×${_size.y.toFixed(1)}×${_size.z.toFixed(1)}`,
      fromHeight.toFixed(1),
      fromSpread.toFixed(1),
      driver,
      animation.orbitRadius,
      clamp,
    );
  } else {
    animation.orbitCenter = null;
    animation.orbitRadius = null;
    log.debug(
      "%s: no scene object, fallback radius=%d",
      target.label,
      FALLBACK_ORBIT_RADIUS,
    );
  }
}

/** Strip roll from a quaternion, keeping only yaw and pitch. */
function stripRoll(q: Quaternion): Quaternion {
  _euler.setFromQuaternion(q, "YXZ");
  _euler.z = 0;
  return q.setFromEuler(_euler);
}

function computeLookAtQuat(from: Vector3, to: Vector3): Quaternion {
  _mat.lookAt(from, to, _v3.set(0, 1, 0));
  _qTarget.setFromRotationMatrix(_mat);
  return stripRoll(_qTarget);
}

function buildCurve(
  startPos: Vector3,
  animation: TourAnimation,
  entryAngle: number,
): CatmullRomCurve3 {
  const focus = orbitFocus(animation);
  const entry = orbitPoint(animation, entryAngle, _v.clone());

  const distance = startPos.distanceTo(entry);

  // For short distances, skip the midpoint arc entirely – a direct Catmull-Rom
  // between start and end gives a smooth enough transition without flying up.
  if (distance < 20) {
    return new CatmullRomCurve3(
      [startPos.clone(), entry],
      false,
      "centripetal",
    );
  }

  // Midpoint: halfway between start and entry, elevated proportionally.
  const mid = new Vector3().addVectors(startPos, entry).multiplyScalar(0.5);
  // Pull midpoint toward the focus — but only if it won't create a dip
  // closer than the orbit entry. For large orbits where the camera is
  // already far out, pulling toward focus causes an unnecessary zoom-in.
  const midDistToFocus = mid.distanceTo(focus);
  const entryDistToFocus = entry.distanceTo(focus);
  if (midDistToFocus > entryDistToFocus) {
    mid.lerp(focus, 0.3);
  }
  mid.y += distance * 0.15;

  return new CatmullRomCurve3(
    [startPos.clone(), mid, entry],
    false,
    "centripetal",
  );
}

function computeEntryAngle(fromPos: Vector3, animation: TourAnimation): number {
  const focus = orbitFocus(animation);
  return Math.atan2(fromPos.z - focus.z, fromPos.x - focus.x);
}

function computeTravelDuration(distance: number): number {
  return Math.max(
    MIN_TRAVEL_DURATION,
    Math.min(MAX_TRAVEL_DURATION, distance / TRAVEL_SPEED),
  );
}

function advanceTravel(
  animation: TourAnimation,
  camera: Camera,
  delta: number,
  scene: Scene,
): void {
  const target = animation.targets[animation.currentIndex];

  // First frame: capture start state, resolve bounds, and build curve.
  if (!animation.curve) {
    animation.startPos = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ];
    stripRoll(_q.copy(camera.quaternion));
    animation.startQuat = [_q.x, _q.y, _q.z, _q.w];

    resolveTargetBounds(scene, target, animation);

    const startVec = camera.position.clone();
    const entryAngle = computeEntryAngle(startVec, animation);
    animation.curve = buildCurve(startVec, animation, entryAngle);

    const distance = animation.curve.getLength();
    animation.phaseDuration = computeTravelDuration(distance);
    animation.elapsed = 0;
    return;
  }

  animation.elapsed += delta;
  const t = Math.min(
    1,
    easeInOutCubic(animation.elapsed / animation.phaseDuration),
  );

  // Move along the curve.
  animation.curve.getPointAt(t, _v);
  camera.position.copy(_v);

  // Orientation: slerp from start toward lookAt(target), leading position.
  // lookT runs ahead of t so the camera turns before the body arrives.
  const rawLookT = Math.min(
    1,
    (animation.elapsed / animation.phaseDuration) * LOOK_LEAD,
  );
  const lookT = easeInOutCubic(rawLookT);

  const focus = orbitFocus(animation);
  const lookQ = computeLookAtQuat(_v, focus);

  if (lookT < 1 && animation.startQuat) {
    _q.set(
      animation.startQuat[0],
      animation.startQuat[1],
      animation.startQuat[2],
      animation.startQuat[3],
    );
    _q.slerp(lookQ, lookT);
    camera.quaternion.copy(_q);
  } else {
    camera.quaternion.copy(lookQ);
  }

  // Transition to orbit when travel completes.
  if (animation.elapsed >= animation.phaseDuration) {
    animation.phase = "orbiting";
    animation.elapsed = 0;
    // Derive start angle from current position.
    animation.orbitStartAngle = computeEntryAngle(camera.position, animation);
  }
}

function advanceOrbit(
  animation: TourAnimation,
  camera: Camera,
  delta: number,
): void {
  const isSingleTarget = animation.targets.length === 1;
  const isLastTarget = animation.currentIndex >= animation.targets.length - 1;

  animation.elapsed += delta;

  const startAngle = animation.orbitStartAngle;
  const totalDuration = ORBIT_CONSTANT_DURATION + ORBIT_EASE_OUT_DURATION;

  // Compute angle: constant speed sweep, then ease-out deceleration.
  let angle: number;
  if (animation.elapsed <= ORBIT_CONSTANT_DURATION) {
    angle = startAngle + animation.elapsed * ORBIT_ANGULAR_SPEED;
  } else {
    const easeElapsed = animation.elapsed - ORBIT_CONSTANT_DURATION;
    const t = Math.min(1, easeElapsed / ORBIT_EASE_OUT_DURATION);
    // Integral of (1 - t): distance = elapsed * speed * (1 - t/2)
    const easedDistance = easeElapsed * ORBIT_ANGULAR_SPEED * (1 - t / 2);
    angle = startAngle + ORBIT_SWEEP + easedDistance;
  }

  orbitPoint(animation, angle, _v);
  camera.position.copy(_v);

  const focus = orbitFocus(animation);
  const lookQ = computeLookAtQuat(_v, focus);
  camera.quaternion.copy(lookQ);

  // Handle orbit completion.
  if (animation.elapsed >= totalDuration) {
    if (isSingleTarget) {
      // Single flyTo: just stop.
      cameraTourStore.getState().cancel();
    } else if (isLastTarget) {
      // Last target in tour: done.
      cameraTourStore.getState().cancel();
    } else {
      // Mid-tour: advance to next target (via set() to notify subscribers).
      cameraTourStore.getState().advanceTarget();
    }
  }
}

export function CameraTourConsumer() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const prevAnimationRef = useRef<TourAnimation | null>(null);

  // Click to advance to next stop, or exit if on the last target.
  useInputAction("nextStop", () => {
    const animation = cameraTourStore.getState().animation;
    if (!animation) return;
    const isLastTarget = animation.currentIndex >= animation.targets.length - 1;
    if (isLastTarget) {
      cameraTourStore.getState().cancel();
    } else {
      cameraTourStore.getState().advanceTarget();
    }
  });

  // Escape to exit tour.
  useInputAction("exitTour", () => {
    cameraTourStore.getState().cancel();
  });

  useFrame((_state, delta) => {
    // In command circuit mode the ortho rig drives the camera (top-down
    // pans) and tour phase progression; only the click/Escape handlers
    // above stay in play.
    if (commandCircuitStore.getState().active) return;

    const animation = cameraTourStore.getState().animation;

    // Reduce fog when orbiting far targets. fogDistanceScale divides all
    // distance-based fog calculations (both haze and volumetric volumes),
    // making geometry appear closer to the camera for fog purposes.
    const orbitR = animation ? getOrbitRadius(animation) : 0;
    const targetScale =
      animation && orbitR >= FOG_REDUCE_THRESHOLD
        ? Math.max(1, orbitR / FOG_REDUCE_DIVISOR)
        : 1;
    const currentScale = globalFogUniforms.fogDistanceScale.value;
    if (currentScale !== targetScale) {
      const step = FOG_SCALE_SPEED * delta;
      if (targetScale > currentScale) {
        globalFogUniforms.fogDistanceScale.value = Math.min(
          currentScale + step,
          targetScale,
        );
      } else {
        globalFogUniforms.fogDistanceScale.value = Math.max(
          currentScale - step,
          targetScale,
        );
      }
    }

    if (!animation) {
      if (prevAnimationRef.current) {
        stripRoll(camera.quaternion);
        prevAnimationRef.current = null;
      }
      return;
    }

    prevAnimationRef.current = animation;

    if (animation.phase === "traveling") {
      advanceTravel(animation, camera, delta, scene);
    } else {
      advanceOrbit(animation, camera, delta);
    }
  });

  return null;
}
