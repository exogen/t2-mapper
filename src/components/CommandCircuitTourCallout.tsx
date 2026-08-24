import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Object3D, OrthographicCamera } from "three";
import { useCameraTour } from "../state/cameraTourStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { ScreenRectTracker } from "./screenRectTracker";
import { tourFlash } from "./commandCircuitTourFlash";
import { drawCalloutLines, drawLabelChip } from "./canvasLabel";
import { useOverlayLabel, type OverlayLabel } from "./LabelOverlay";

/**
 * Minimum circle radius, so tiny objects (flags, items) still read.
 */
const MIN_RADIUS = 20;
/**
 * Padding between the object's screen rect and the circle.
 */
const RADIUS_PADDING = 10;
/**
 * Fade in/out lengths (seconds).
 */
const FADE_IN_DURATION = 0.35;
const FADE_DURATION = 0.7;
/**
 * How long after the green flash ends before the callout fades itself out.
 */
const EXPIRE_DELAY = 0.5;

/** The tour accent teal (the old .Circle/.Leader CSS stroke). */
const TOUR_STROKE = "rgba(130, 225, 232, 0.65)";
const LABEL_FONT_SIZE = 12;

interface CalloutTarget {
  objectName: string;
  label: string;
}

/**
 * "fade" is the retarget fade-out (swaps targets when finished); "expire"
 * is the post-flash fade-out, settling into "done" until the next target.
 */
type PhaseName = "hidden" | "fadeIn" | "steady" | "fade" | "expire" | "done";

/** Ease-out progress, matching the old CSS animations' feel. */
function easeOut(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) * (1 - clamped);
}

/**
 * Futuristic callout for the active tour target in command circuit mode:
 * a circle enclosing the object's rendered bounds, a 45° leader line, and
 * the tour label at the end of a horizontal run — drawn by the shared
 * LabelOverlay in the unified label style. The circle grows with the
 * object's screen footprint (a clipped label glides into view as the tour
 * centers on the target). The callout fades in on activation and out when
 * the tour moves on (still tracking the old target while it fades).
 */
export function CommandCircuitTourCallout() {
  const animation = useCameraTour((s) => s.animation);
  const target = animation ? animation.targets[animation.currentIndex] : null;
  return (
    <TourCallout
      target={
        target
          ? { objectName: target.entityId, label: calloutLabel(target) }
          : null
      }
    />
  );
}

/**
 * Flags get their team-qualified label ("Storm Flag"), matching the
 * non-tour floating labels; everything else keeps its tour-panel label.
 */
function calloutLabel(target: { entityId: string; label: string }): string {
  const entity = gameEntityStore
    .getState()
    .missionEntities.get(target.entityId);
  if (
    entity?.renderType === "Shape" &&
    entity.dataBlock?.toLowerCase() === "flag" &&
    entity.teamId &&
    entity.teamId > 0
  ) {
    return `${DEFAULT_TEAM_NAMES[entity.teamId]} Flag`;
  }
  return target.label;
}

function TourCallout({ target }: { target: CalloutTarget | null }) {
  const targetRef = useRef<CalloutTarget | null>(null);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  const trackerRef = useRef<ScreenRectTracker | null>(null);
  // The target currently on screen — lags the prop while fading out.
  const shownRef = useRef<CalloutTarget | null>(null);
  // The circle's size is snapshotted per target in world units (so the
  // bounds of rotating objects don't make it pulse) and only re-derived
  // when the object's scale changes or its meshes are swapped.
  const radiusSnapshotRef = useRef<{
    root: Object3D;
    meshesVersion: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    worldRadius: number;
  } | null>(null);
  const phaseRef = useRef<{ name: PhaseName; elapsed: number }>({
    name: "hidden",
    elapsed: 0,
  });
  // What draw() paints, refreshed by the frame handler below.
  const displayRef = useRef({ radius: MIN_RADIUS, label: "" });

  const item = useOverlayLabel(() => {
    const it: OverlayLabel = {
      object: null,
      screenSpace: true,
      bitmap: null,
      anchorX: 0,
      anchorY: 0,
      opacity: 0,
      // Line-work sits under text labels.
      layer: -1,
      // Visibility is managed here (rect-vs-viewport, fades) — never let
      // the driver cull by the anchor point alone.
      cullRadius: Number.POSITIVE_INFINITY,
      draw: (ctx, x, y) => {
        const { radius, label } = displayRef.current;
        const anchor = drawCalloutLines(ctx, x, y, radius, TOUR_STROKE);
        drawLabelChip(ctx, label, anchor.x, anchor.y, {
          fontSize: LABEL_FONT_SIZE,
          anchor: "left",
        });
      },
    };
    return it;
  });

  useFrame(({ camera, scene, size }, delta) => {
    const phase = phaseRef.current;
    phase.elapsed += delta;

    const setPhase = (name: PhaseName) => {
      phase.name = name;
      phase.elapsed = 0;
    };
    const hide = () => {
      item.opacity = 0;
    };

    // Retarget: fade out what's shown, then swap and fade back in. (An
    // in-flight fade/expire completes first and swaps on completion.)
    const desired = targetRef.current;
    const shown = shownRef.current;
    if (shown && (!desired || desired.objectName !== shown.objectName)) {
      if (phase.name === "fadeIn" || phase.name === "steady") {
        setPhase("fade");
      } else if (phase.name === "hidden" || phase.name === "done") {
        shownRef.current = desired;
        setPhase("hidden");
      }
    } else if (!shown && desired) {
      shownRef.current = desired;
      setPhase("hidden");
    }
    if (
      (phase.name === "fade" || phase.name === "expire") &&
      phase.elapsed >= FADE_DURATION
    ) {
      const desiredNow = targetRef.current;
      if (
        phase.name === "expire" &&
        desiredNow &&
        desiredNow.objectName === shownRef.current?.objectName
      ) {
        // Expired in place; stay dark until the tour moves on.
        setPhase("done");
      } else {
        shownRef.current = desiredNow;
        setPhase("hidden");
      }
    }

    if (phase.name === "done") {
      hide();
      return;
    }

    const display = shownRef.current;
    if (!display) {
      hide();
      return;
    }

    const tracker = (trackerRef.current ??= new ScreenRectTracker());
    const root = tracker.resolveTarget(null, display.objectName, scene);
    const rect = tracker.rect;
    const onScreen =
      root !== null &&
      tracker.update(root, scene, camera, size.width, size.height) &&
      rect.maxX >= 0 &&
      rect.minX <= size.width &&
      rect.maxY >= 0 &&
      rect.minY <= size.height;
    if (!onScreen) {
      if (!root) tracker.reset();
      hide();
      if (phase.name === "fadeIn") setPhase("hidden");
      return;
    }

    // Visible: fade in, settle to steady, and expire once the green flash
    // has been over for a beat. A target first seen after that window
    // never activates at all.
    if (phase.name === "hidden") {
      if (tourFlash.idleTime >= EXPIRE_DELAY) {
        hide();
        return;
      }
      displayRef.current.label = display.label;
      setPhase("fadeIn");
    } else if (phase.name === "fadeIn" && phase.elapsed >= FADE_IN_DURATION) {
      setPhase("steady");
    }
    if (
      (phase.name === "fadeIn" || phase.name === "steady") &&
      tourFlash.idleTime >= EXPIRE_DELAY
    ) {
      setPhase("expire");
    }

    const cx = (rect.minX + rect.maxX) / 2;
    const cy = (rect.minY + rect.maxY) / 2;
    // Ortho zoom is pixels per world unit; converting the snapshot back at
    // the current zoom keeps the circle steady under object rotation while
    // still following the tour's zoom animation.
    const zoom = (camera as OrthographicCamera).zoom || 1;
    let snapshot = radiusSnapshotRef.current;
    if (
      !snapshot ||
      snapshot.root !== root ||
      snapshot.meshesVersion !== tracker.meshesVersion ||
      snapshot.scaleX !== root.scale.x ||
      snapshot.scaleY !== root.scale.y ||
      snapshot.scaleZ !== root.scale.z
    ) {
      const halfDiagonal =
        Math.hypot(rect.maxX - rect.minX, rect.maxY - rect.minY) / 2;
      snapshot = {
        root,
        meshesVersion: tracker.meshesVersion,
        scaleX: root.scale.x,
        scaleY: root.scale.y,
        scaleZ: root.scale.z,
        worldRadius: halfDiagonal / zoom,
      };
      radiusSnapshotRef.current = snapshot;
    }
    displayRef.current.radius = Math.min(
      Math.max(MIN_RADIUS, snapshot.worldRadius * zoom + RADIUS_PADDING),
      Math.min(size.width, size.height) * 0.35,
    );

    item.screenX = cx;
    item.screenY = cy;
    item.opacity =
      phase.name === "fadeIn"
        ? easeOut(phase.elapsed / FADE_IN_DURATION)
        : phase.name === "fade" || phase.name === "expire"
          ? 1 - easeOut(phase.elapsed / FADE_DURATION)
          : 1;
  });

  return null;
}
