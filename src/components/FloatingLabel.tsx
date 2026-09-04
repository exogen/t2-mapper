import { memo, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Object3D, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useCameraTour } from "../state/cameraTourStore";
import { resolveRootState } from "./r3fRootState";
import { makeTextLabel, type CanvasLabel } from "./canvasLabel";
import { isBehindCamera, useOverlayLabel } from "./LabelOverlay";
import { useDebug } from "./SettingsProvider";

const DEFAULT_POSITION = [0, 0, 0] as [x: number, y: number, z: number];
const _worldPos = new Vector3();

/** Default fade distance for fadeWithDistance labels. */
const DEFAULT_FADE_DISTANCE = 200;

/**
 * Frames a label must stay out of view before it unmounts. Showing is
 * immediate; hiding is delayed so a camera hovering at the fade boundary
 * (or rotating an object in/out of view) doesn't thrash mount state
 * every few frames. The label is already at opacity 0 while it waits.
 */
const HIDE_DELAY_FRAMES = 15;

/** Gap between a label chip and its debug-mode distance chip. */
const DEBUG_DISTANCE_GAP = 1;

/** Debug-mode distance chips, shared by every label (keyed by meters). */
const _distanceChips = new Map<number, CanvasLabel>();

function distanceChip(meters: number): CanvasLabel {
  let chip = _distanceChips.get(meters);
  if (!chip) {
    chip = makeTextLabel(`${meters} m`);
    _distanceChips.set(meters, chip);
  }
  return chip;
}

/**
 * Hook that manages visibility and opacity fading for a floating label group.
 * Attach `groupRef` to a `<group>` so world-position lookups work. Apply
 * `opacityRef.current` to overlay labels each frame for smooth fading.
 * `distanceRef` holds the camera distance (Infinity behind the camera).
 */
export function useFloatingLabelFade({
  opacity: opacityProp = "fadeWithDistance" as number | "fadeWithDistance",
  fadeDistance = DEFAULT_FADE_DISTANCE,
} = {}) {
  const fadeWithDistance = opacityProp === "fadeWithDistance";
  const groupRef = useRef<Object3D>(null);
  const [isVisible, setIsVisible] = useState(opacityProp !== 0);
  const opacityRef = useRef(0);
  const distanceRef = useRef(Infinity);
  const hideCountdownRef = useRef(HIDE_DELAY_FRAMES);

  function applyVisibility(shouldBeVisible: boolean) {
    if (shouldBeVisible) {
      hideCountdownRef.current = HIDE_DELAY_FRAMES;
      if (!isVisible) setIsVisible(true);
    } else if (isVisible && --hideCountdownRef.current <= 0) {
      setIsVisible(false);
    }
  }

  // During a command circuit tour, world-anchored labels get out of the
  // way — the active target gets a screen-space label instead (see
  // CommandCircuitTourLabel).
  const commandCircuitActive = useCommandCircuit((s) => s.active);
  const tourActive = useCameraTour((s) => s.animation !== null);
  const suppressed = commandCircuitActive && tourActive;

  useFrame((state) => {
    // Resolve the root store's camera: inside an r3f portal (e.g. a
    // nameplate on a player mounted in a vehicle) the portal state's
    // camera snapshot misses later makeDefault switches, which would keep
    // labels fading against the wrong camera.
    const { camera } = resolveRootState(state);
    if (suppressed) {
      if (isVisible) setIsVisible(false);
      opacityRef.current = 0;
      return;
    }
    const group = groupRef.current;
    if (!group) return;

    group.getWorldPosition(_worldPos);
    const behind = isBehindCamera(
      camera,
      _worldPos.x,
      _worldPos.y,
      _worldPos.z,
    );

    const distance = behind ? Infinity : camera.position.distanceTo(_worldPos);
    distanceRef.current = distance;

    if (fadeWithDistance) {
      const shouldBeVisible = distance < fadeDistance;
      applyVisibility(shouldBeVisible);
      opacityRef.current = shouldBeVisible
        ? Math.max(0, Math.min(1, 1 - distance / fadeDistance))
        : 0;
    } else {
      applyVisibility(!behind && opacityProp !== 0);
      // Opacity drops immediately; only the unmount is delayed.
      opacityRef.current = behind ? 0 : (opacityProp as number);
    }
  });

  return { groupRef, isVisible, opacityRef, distanceRef };
}

/** Flatten label children (strings, numbers, arrays thereof) to plain text. */
function textFromChildren(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  return "";
}

/**
 * A world-anchored text label drawn by the shared LabelOverlay at a
 * constant screen-pixel size and native display resolution.
 */
export const FloatingLabel = memo(function FloatingLabel({
  children,
  // Default foreground: the unified label fill (canvasLabel).
  color = undefined,
  position = DEFAULT_POSITION,
  opacity = "fadeWithDistance",
  fadeDistance,
}: {
  children: ReactNode;
  color?: string;
  position?: [x: number, y: number, z: number];
  opacity?: number | "fadeWithDistance";
  fadeDistance?: number;
}) {
  const { groupRef, isVisible, opacityRef, distanceRef } = useFloatingLabelFade(
    { opacity, fadeDistance },
  );
  const { debugMode } = useDebug();
  const item = useOverlayLabel(() => ({
    object: null,
    bitmap: null,
    anchorX: 0,
    anchorY: 0,
    opacity: 0,
  }));

  const text = textFromChildren(children);
  const label = useMemo(
    () => (isVisible && text ? makeTextLabel(text, color) : null),
    [isVisible, text, color],
  );
  useEffect(() => {
    item.bitmap = label;
    if (label) {
      item.anchorX = label.width / 2;
      item.anchorY = label.height / 2;
    }
  }, [item, label]);

  // Debug mode: paint the chip ourselves with the camera distance under
  // it. The painter reads the distance at draw time, so only the (shared,
  // per-meter cached) distance chip changes — the label never re-rasters.
  useEffect(() => {
    if (!debugMode || !label) return;
    item.cullRadius = Math.max(label.width, label.height);
    item.draw = (ctx, x, y) => {
      ctx.drawImage(
        label.canvas,
        x - label.width / 2,
        y - label.height / 2,
        label.width,
        label.height,
      );
      const distance = distanceRef.current;
      if (!Number.isFinite(distance)) return;
      const chip = distanceChip(Math.round(distance));
      ctx.drawImage(
        chip.canvas,
        x - chip.width / 2,
        y + label.height / 2 + DEBUG_DISTANCE_GAP,
        chip.width,
        chip.height,
      );
    };
    return () => {
      item.draw = undefined;
      item.cullRadius = undefined;
    };
  }, [item, label, debugMode, distanceRef]);

  useFrame(() => {
    item.opacity = opacityRef.current;
  });

  return (
    <group ref={groupRef}>
      <object3D
        position={position}
        ref={(node) => {
          item.object = node;
        }}
      />
    </group>
  );
});
