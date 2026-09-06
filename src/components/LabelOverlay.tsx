import { useEffect, useState } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { labelDpr, type CanvasLabel } from "./canvasLabel";

/**
 * A single 2D canvas layered over the WebGL canvas that draws every
 * world-anchored label (floating labels, nameplates, flag markers, command
 * circuit markers) once per rendered frame: project each label's anchor to
 * screen, then blit its cached bitmap or run its custom painter. Compared
 * to per-label DOM overlays (no DOM nodes, no style/layout recalc) and
 * in-scene sprites (no extra draw calls, and — crucially — native display
 * resolution independent of the 3D render scale, so text never blurs when
 * the user lowers Render scale).
 *
 * Interactive labels (hitRadius + onClick/onHoverChange) get screen-space
 * circular hit-testing against the last drawn positions; a capture-phase
 * mousedown interceptor keeps clicks on them from also starting a map pan.
 */

export interface OverlayLabel {
  /** World anchor the label is drawn at; null skips drawing. */
  object: Object3D | null;
  /**
   * Screen-space anchoring: the owner maintains screenX/screenY itself
   * (e.g. a label tied to a projected bounding RECT, not a world point)
   * and the driver skips projection and behind-camera culling. `object`
   * is ignored.
   */
  screenSpace?: boolean;
  /** Bitmap to draw (ignored when `draw` is set); null hides the label. */
  bitmap: CanvasLabel | null;
  /** Where the projected point lands within the bitmap (CSS pixels). */
  anchorX: number;
  anchorY: number;
  opacity: number;
  /**
   * Custom painter, replacing the bitmap blit: called with the projected
   * anchor in CSS pixels, globalAlpha preset to `opacity`, wrapped in
   * save/restore.
   */
  draw?: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
  /** Screen-space cull margin for `draw` labels (anchor must be within
   *  the viewport expanded by this many pixels). Default 0. */
  cullRadius?: number;
  /**
   * Draw order: lower layers paint first (underneath). Callout line-work
   * uses -1 so text labels (default 0) always read on top of it; ties
   * keep registration order.
   */
  layer?: number;
  /** Interactive: hit-test radius around the anchor (CSS pixels). */
  hitRadius?: number;
  /** Pointer cursor while hovered (interactive labels only). */
  cursor?: string;
  onClick?: () => void;
  onHoverChange?: (hovering: boolean) => void;
  /** Driver-written: last projected anchor + whether it was drawn. */
  screenX?: number;
  screenY?: number;
  onScreen?: boolean;
}

// Stored on globalThis so dev-server HMR can't split the registry: a hot
// reload of this module would otherwise give re-registered labels a fresh
// Set while the mounted driver keeps drawing the old one.
const _labels = ((
  globalThis as { __labelOverlayRegistry?: Set<OverlayLabel> }
).__labelOverlayRegistry ??= new Set<OverlayLabel>());

export function registerOverlayLabel(label: OverlayLabel): void {
  _labels.add(label);
}

export function unregisterOverlayLabel(label: OverlayLabel): void {
  label.onScreen = false;
  _labels.delete(label);
}

/**
 * Create an overlay label once and keep it registered for the component's
 * lifetime. The initializer runs once; mutate the returned item (object,
 * bitmap, opacity, …) from effects and frame handlers.
 */
export function useOverlayLabel(create: () => OverlayLabel): OverlayLabel {
  const [label] = useState(create);
  useEffect(() => {
    registerOverlayLabel(label);
    return () => unregisterOverlayLabel(label);
  }, [label]);
  return label;
}

/** Reusable draw-order scratch (sorted by layer each frame). */
const _drawOrder: OverlayLabel[] = [];

/** Check if a world position is behind the camera using only scalar math. */
export function isBehindCamera(
  camera: { matrixWorld: { elements: number[] } },
  wx: number,
  wy: number,
  wz: number,
): boolean {
  const e = camera.matrixWorld.elements;
  // Dot product of (objectPos - cameraPos) with camera forward (-Z column).
  return (
    (wx - e[12]) * -e[8] + (wy - e[13]) * -e[9] + (wz - e[14]) * -e[10] < 0
  );
}

const _worldPos = new Vector3();

/** Distance from a mouse event to a label's last drawn anchor. */
function hitDistance(label: OverlayLabel, x: number, y: number): number {
  return Math.hypot(x - (label.screenX ?? 0), y - (label.screenY ?? 0));
}

/**
 * Mount once inside the Canvas. Creates the overlay canvas as a sibling of
 * the WebGL canvas and redraws it after every rendered frame (camera
 * matrices are final by then, so labels can't lag the view).
 */
export function LabelOverlay() {
  const gl = useThree((state) => state.gl);
  const getRootState = useThree((state) => state.get);

  useEffect(() => {
    const glCanvas = gl.domElement;
    const parent = glCanvas.parentElement;
    if (!parent) return;

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    parent.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;

    const unsubscribe = addAfterEffect(() => {
      const { camera, size } = getRootState();
      const dpr = labelDpr();
      const deviceWidth = Math.max(1, Math.ceil(size.width * dpr));
      const deviceHeight = Math.max(1, Math.ceil(size.height * dpr));
      if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
        canvas.width = deviceWidth;
        canvas.height = deviceHeight;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, deviceWidth, deviceHeight);
      if (_labels.size === 0) return true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Paint in layer order (stable within a layer) so callout line-work
      // never covers text labels.
      _drawOrder.length = 0;
      for (const label of _labels) _drawOrder.push(label);
      _drawOrder.sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));

      for (const label of _drawOrder) {
        const { object, bitmap, draw } = label;
        label.onScreen = false;
        if ((!bitmap && !draw) || label.opacity <= 0) continue;
        let sx: number;
        let sy: number;
        if (label.screenSpace) {
          // Owner-maintained screen anchor.
          if (label.screenX == null || label.screenY == null) continue;
          sx = label.screenX;
          sy = label.screenY;
        } else {
          if (!object) continue;
          // This runs after the render, so every matrixWorld is final —
          // read it directly instead of getWorldPosition's redundant
          // ancestor update walk.
          _worldPos.setFromMatrixPosition(object.matrixWorld);
          if (isBehindCamera(camera, _worldPos.x, _worldPos.y, _worldPos.z)) {
            continue;
          }
          // Beyond the camera's far plane the projected x/y are still
          // right, only NDC z exceeds 1: labels (flags, waypoints) stay
          // visible past the render distance, unlike the geometry.
          _worldPos.project(camera);
          sx = (_worldPos.x * 0.5 + 0.5) * size.width;
          sy = (-_worldPos.y * 0.5 + 0.5) * size.height;
        }

        if (draw) {
          const r = label.cullRadius ?? 0;
          if (
            sx < -r ||
            sy < -r ||
            sx > size.width + r ||
            sy > size.height + r
          ) {
            continue;
          }
          label.screenX = sx;
          label.screenY = sy;
          label.onScreen = true;
          ctx.save();
          ctx.globalAlpha = label.opacity;
          try {
            draw(ctx, sx, sy);
          } catch (err) {
            // One bad painter must not take down the rest of the frame's
            // labels (or the render loop).
            console.error("LabelOverlay painter failed:", err);
          }
          ctx.restore();
          continue;
        }

        // Fractional placement (bilinear-filtered): moving labels track
        // smoothly instead of stair-stepping between whole pixels. The
        // softness cost is ≤ half a device pixel — bitmaps render at
        // labelDpr, so at 2× it's imperceptible (and matches how the old
        // DOM overlays moved).
        const x = sx - label.anchorX;
        const y = sy - label.anchorY;
        if (
          x > size.width ||
          y > size.height ||
          x + bitmap!.width < 0 ||
          y + bitmap!.height < 0
        ) {
          continue;
        }
        label.screenX = sx;
        label.screenY = sy;
        label.onScreen = true;
        ctx.globalAlpha = label.opacity;
        ctx.drawImage(bitmap!.canvas, x, y, bitmap!.width, bitmap!.height);
      }
      return true;
    });

    // ── Interactive labels: screen-space hit-testing ──
    const eventPoint = (ev: MouseEvent): [number, number] => {
      const rect = glCanvas.getBoundingClientRect();
      return [ev.clientX - rect.left, ev.clientY - rect.top];
    };
    const hitTest = (ev: MouseEvent): OverlayLabel | null => {
      const [x, y] = eventPoint(ev);
      let best: OverlayLabel | null = null;
      let bestDistance = Infinity;
      for (const label of _labels) {
        if (!label.hitRadius || !label.onScreen || label.opacity <= 0) {
          continue;
        }
        const distance = hitDistance(label, x, y);
        if (distance <= label.hitRadius && distance < bestDistance) {
          best = label;
          bestDistance = distance;
        }
      }
      return best;
    };

    let hovered: OverlayLabel | null = null;
    const handleMove = (ev: PointerEvent) => {
      const hit = hitTest(ev);
      if (hit !== hovered) {
        hovered?.onHoverChange?.(false);
        hovered = hit;
        hovered?.onHoverChange?.(true);
        glCanvas.style.cursor = hovered?.cursor ?? "";
      }
    };
    // Capture-phase interception: a press on an interactive label must not
    // also start a map pan/drag (the input system listens on this canvas
    // in the bubble phase). Click fires on release if the pointer stayed
    // on the label and didn't move enough to be a drag.
    let pressed: { label: OverlayLabel; x: number; y: number } | null = null;
    const handleDown = (ev: MouseEvent) => {
      const hit = hitTest(ev);
      if (hit?.onClick) {
        pressed = { label: hit, x: ev.clientX, y: ev.clientY };
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }
    };
    const handleUp = (ev: MouseEvent) => {
      if (!pressed) return;
      const press = pressed;
      pressed = null;
      if (
        Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < 5 &&
        hitTest(ev) === press.label
      ) {
        press.label.onClick?.();
      }
    };
    glCanvas.addEventListener("pointermove", handleMove);
    glCanvas.addEventListener("mousedown", handleDown, true);
    window.addEventListener("mouseup", handleUp);

    return () => {
      unsubscribe();
      glCanvas.removeEventListener("pointermove", handleMove);
      glCanvas.removeEventListener("mousedown", handleDown, true);
      window.removeEventListener("mouseup", handleUp);
      glCanvas.style.cursor = "";
      parent.removeChild(canvas);
    };
  }, [gl, getRootState]);

  return null;
}
