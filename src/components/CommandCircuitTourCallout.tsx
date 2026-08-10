import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Object3D, OrthographicCamera } from "three";
import { useCameraTour } from "../state/cameraTourStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { ScreenRectTracker } from "./screenRectTracker";
import { tourFlash } from "./commandCircuitTourFlash";
import styles from "./CommandCircuitTourCallout.module.css";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Minimum circle radius, so tiny objects (flags, items) still read.
 */
const MIN_RADIUS = 20;
/**
 * Padding between the object's screen rect and the circle.
 */
const RADIUS_PADDING = 10;
/**
 * Length of the 45° leader segment off the circle, and of the horizontal
 * run to the label.
 */
const LEADER_DIAGONAL = 16;
const LEADER_RUN = 22;
const SQRT1_2 = Math.SQRT1_2;

/**
 * Fade in/out lengths; must cover the CSS animation durations so the
 * class isn't removed mid-animation.
 */
const FADE_IN_DURATION = 0.35;
const FADE_DURATION = 0.7;
/**
 * How long after the green flash ends before the callout fades itself out.
 */
const EXPIRE_DELAY = 0.5;

interface CalloutTarget {
  objectName: string;
  label: string;
}

/**
 * "fade" is the retarget fade-out (swaps targets when finished); "expire"
 * is the post-flash fade-out, settling into "done" until the next target.
 */
type PhaseName = "hidden" | "fadeIn" | "steady" | "fade" | "expire" | "done";

/**
 * Futuristic callout for the active tour target in command circuit mode:
 * a circle enclosing the object's rendered bounds, a 45° leader line, and
 * the tour label at the end of a horizontal run. Geometry updates
 * imperatively every frame; the circle grows with the object's screen
 * footprint (a clipped label glides into view as the tour centers on the
 * target). The callout fades in on activation and out when the tour
 * moves on (still tracking the old target while it fades).
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
  const gl = useThree((state) => state.gl);
  const partsRef = useRef<{
    container: HTMLDivElement;
    svg: SVGSVGElement;
    circle: SVGCircleElement;
    leader: SVGPathElement;
    labelEl: HTMLDivElement;
  } | null>(null);

  const targetRef = useRef<CalloutTarget | null>(null);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const container = document.createElement("div");
    container.className = styles.Callout;
    container.style.display = "none";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", styles.Lines);
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", styles.Circle);
    const leader = document.createElementNS(SVG_NS, "path");
    leader.setAttribute("class", styles.Leader);
    svg.append(circle, leader);

    const labelEl = document.createElement("div");
    labelEl.className = styles.Label;

    container.append(svg, labelEl);
    gl.domElement.parentElement?.appendChild(container);
    partsRef.current = { container, svg, circle, leader, labelEl };
    return () => {
      partsRef.current = null;
      container.remove();
    };
  }, [gl]);

  const trackerRef = useRef<ScreenRectTracker | null>(null);
  const svgSize = useRef({ width: 0, height: 0 });
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

  useFrame(({ camera, scene, size }, delta) => {
    const parts = partsRef.current;
    if (!parts) return;
    const phase = phaseRef.current;
    phase.elapsed += delta;

    const setPhase = (name: PhaseName) => {
      phase.name = name;
      phase.elapsed = 0;
      parts.container.className =
        name === "fadeIn"
          ? `${styles.Callout} ${styles.FadeIn}`
          : name === "fade" || name === "expire"
            ? `${styles.Callout} ${styles.Fade}`
            : styles.Callout;
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
      parts.container.style.display = "none";
      return;
    }

    const display = shownRef.current;
    if (!display) {
      parts.container.style.display = "none";
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
      parts.container.style.display = "none";
      if (phase.name === "fadeIn") setPhase("hidden");
      return;
    }

    // Visible: fade in, settle to steady, and expire once the green flash
    // has been over for a beat. A target first seen after that window
    // never activates at all.
    if (phase.name === "hidden") {
      if (tourFlash.idleTime >= EXPIRE_DELAY) {
        parts.container.style.display = "none";
        return;
      }
      parts.labelEl.textContent = display.label;
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

    if (
      svgSize.current.width !== size.width ||
      svgSize.current.height !== size.height
    ) {
      svgSize.current.width = size.width;
      svgSize.current.height = size.height;
      parts.svg.setAttribute("width", String(size.width));
      parts.svg.setAttribute("height", String(size.height));
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
    const radius = Math.min(
      Math.max(MIN_RADIUS, snapshot.worldRadius * zoom + RADIUS_PADDING),
      Math.min(size.width, size.height) * 0.35,
    );

    // Always the canonical down-right orientation: the tour centers on the
    // target, so a clipped label just glides into view.
    const startX = cx + radius * SQRT1_2;
    const startY = cy + radius * SQRT1_2;
    const elbowX = startX + LEADER_DIAGONAL;
    const elbowY = startY + LEADER_DIAGONAL;
    const endX = elbowX + LEADER_RUN;

    parts.circle.setAttribute("cx", cx.toFixed(1));
    parts.circle.setAttribute("cy", cy.toFixed(1));
    parts.circle.setAttribute("r", radius.toFixed(1));
    parts.leader.setAttribute(
      "d",
      `M${startX.toFixed(1)} ${startY.toFixed(1)}` +
        `L${elbowX.toFixed(1)} ${elbowY.toFixed(1)}` +
        `L${endX.toFixed(1)} ${elbowY.toFixed(1)}`,
    );
    parts.labelEl.style.transform =
      `translate3d(${endX.toFixed(1)}px, ${elbowY.toFixed(1)}px, 0) ` +
      `translate(0, -50%)`;
    parts.container.style.display = "";
  });

  return null;
}
