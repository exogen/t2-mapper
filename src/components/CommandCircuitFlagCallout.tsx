import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import { FaHand } from "react-icons/fa6";
import { ImArrowDownRight, ImHome } from "react-icons/im";
import { Vector3 } from "three";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { ScreenRectTracker } from "./screenRectTracker";
import { resolveFlagTeam } from "./flagTeam";
import {
  isObserverView,
  resolveIffDisplay,
  rgbaString,
  IFF_NEUTRAL,
  type TeamColorScheme,
} from "./iffTheme";
import { useSettings } from "./SettingsProvider";
import type { GameEntity } from "../state/gameEntityTypes";
import styles from "./CommandCircuitTourCallout.module.css";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Circle radius — flags and carriers all read at about this size. */
const CIRCLE_RADIUS = 16;
/** Leader segments, matching the tour callout. */
const LEADER_DIAGONAL = 16;
const LEADER_RUN = 22;
const SQRT1_2 = Math.SQRT1_2;

/** Flag status shown as an icon after the label text. */
type FlagStatus = "home" | "held" | "field";

const _worldPos = new Vector3();

/**
 * Stroke color for the callout: teamed viewers get the flag's
 * viewer-relative IFF color; observers get the flag's TEAM color from
 * the selected scheme. The label keeps the tour callout's normal text
 * color either way.
 */
function resolveCalloutStroke(
  entity: GameEntity,
  flagTeamId: number | null,
  scheme: TeamColorScheme,
): string {
  const observer = isObserverView();
  const iff = "iffColor" in entity ? entity.iffColor : undefined;
  const display = observer
    ? resolveIffDisplay({ teamId: flagTeamId ?? undefined }, true, scheme)
    : iff
      ? resolveIffDisplay({ iffColor: iff }, false, scheme)
      : IFF_NEUTRAL;
  // mapColor matches the player dots/cones on the dark map terrain; the
  // stroke opacity keeps the outline style lighter than the solid dots.
  return rgbaString(display.mapColor, display.strokeOpacity);
}

/**
 * The flag's state from the real game state: a carrier callout is "held"
 * by definition; an item's home/field state comes from the CTF flag
 * messages tracked in the team scoreboard.
 */
function resolveFlagStatus(
  entity: GameEntity,
  teamId: number | null,
): FlagStatus {
  if (entity.renderType === "Player") return "held";
  return (
    streamSnapshotStore
      .getState()
      .snapshot?.teamScores?.find((t) => t.teamId === teamId)?.flagStatus ??
    "home"
  );
}

/**
 * Command circuit stand-in for FlagMarker: the tour callout's circle,
 * 45° leader line, and label, tinted with the flag's IFF color (green
 * friendly / red enemy) instead of the tour teal. Tracks the flag item
 * on the ground/stand, or the carrying player while the flag is held.
 * Geometry, color, and label update imperatively every frame.
 */
export function CommandCircuitFlagCallout({ entity }: { entity: GameEntity }) {
  const gl = useThree((state) => state.gl);
  const { observerTeamColors } = useSettings();
  const partsRef = useRef<{
    container: HTMLDivElement;
    svg: SVGSVGElement;
    circle: SVGCircleElement;
    leader: SVGPathElement;
    labelEl: HTMLDivElement;
    textSpan: HTMLSpanElement;
  } | null>(null);

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
    // Slightly smaller and more subdued than the tour callout's label.
    labelEl.style.fontSize = "9px";
    labelEl.style.opacity = "0.8";
    labelEl.style.display = "flex";
    labelEl.style.alignItems = "center";
    labelEl.style.gap = "3px";

    // Text plus a status icon (home / held / dropped), all inside the
    // label's backdrop. The icons live in their own react-dom root; the
    // per-frame code toggles them by data-icon attribute, never by ref,
    // so a deferred unmount of a previous root can't clobber anything.
    const textSpan = document.createElement("span");
    const iconMount = document.createElement("span");
    iconMount.style.display = "flex";
    labelEl.append(textSpan, iconMount);
    const iconRoot = createRoot(iconMount);
    iconRoot.render(
      <>
        <ImHome size={9} data-icon="home" style={{ display: "none" }} />
        <FaHand size={9} data-icon="held" style={{ display: "none" }} />
        <ImArrowDownRight
          size={8}
          data-icon="field"
          style={{ display: "none" }}
        />
      </>,
    );

    container.append(svg, labelEl);
    gl.domElement.parentElement?.appendChild(container);
    partsRef.current = { container, svg, circle, leader, labelEl, textSpan };
    return () => {
      partsRef.current = null;
      // Deferred: React disallows unmounting a root synchronously from
      // inside another root's commit phase.
      setTimeout(() => iconRoot.unmount());
      container.remove();
    };
  }, [gl]);

  const trackerRef = useRef<ScreenRectTracker | null>(null);
  const svgSize = useRef({ width: 0, height: 0 });

  useFrame(({ camera, scene, size }) => {
    const parts = partsRef.current;
    if (!parts) return;

    const tracker = (trackerRef.current ??= new ScreenRectTracker());
    const root = tracker.resolveTarget(null, entity.id, scene);
    if (!root) {
      tracker.reset();
      parts.container.style.display = "none";
      return;
    }

    // Project the entity origin (not its mesh bounds — a carrier's rect
    // wanders with animation) into screen space.
    camera.updateMatrixWorld();
    root.getWorldPosition(_worldPos);
    _worldPos.applyMatrix4(camera.matrixWorldInverse);
    if (_worldPos.z >= 0) {
      parts.container.style.display = "none";
      return;
    }
    _worldPos.applyMatrix4(camera.projectionMatrix);
    const cx = ((_worldPos.x + 1) / 2) * size.width;
    const cy = ((1 - _worldPos.y) / 2) * size.height;
    if (cx < 0 || cx > size.width || cy < 0 || cy > size.height) {
      parts.container.style.display = "none";
      return;
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

    const { teamId, name } = resolveFlagTeam(entity);

    // Tint the circle and leader strokes — entity fields are mutated in
    // place by streaming playback, so re-resolve every frame.
    const color = resolveCalloutStroke(entity, teamId, observerTeamColors);
    if (parts.circle.style.stroke !== color) {
      parts.circle.style.stroke = color;
      parts.leader.style.stroke = color;
    }

    const label = name ? `${name} Flag` : "Flag";
    if (parts.textSpan.textContent !== label) {
      parts.textSpan.textContent = label;
    }

    // Show the status icon matching the game state. Queried by attribute
    // each frame (the icon root commits asynchronously, so the icons may
    // not exist on the first few frames).
    const status = resolveFlagStatus(entity, teamId);
    for (const iconStatus of ["home", "held", "field"] as const) {
      const icon = parts.labelEl.querySelector<SVGElement>(
        `[data-icon="${iconStatus}"]`,
      );
      if (icon) {
        const display = iconStatus === status ? "" : "none";
        if (icon.style.display !== display) {
          icon.style.display = display;
        }
      }
    }

    const startX = cx + CIRCLE_RADIUS * SQRT1_2;
    const startY = cy + CIRCLE_RADIUS * SQRT1_2;
    const elbowX = startX + LEADER_DIAGONAL;
    const elbowY = startY + LEADER_DIAGONAL;
    const endX = elbowX + LEADER_RUN;

    parts.circle.setAttribute("cx", cx.toFixed(1));
    parts.circle.setAttribute("cy", cy.toFixed(1));
    parts.circle.setAttribute("r", String(CIRCLE_RADIUS));
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
