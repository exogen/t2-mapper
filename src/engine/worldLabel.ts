import { Object3D, Vector3, type Camera } from "three";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { makeTextLabel, type CanvasLabel } from "./canvasLabel";
import {
  isBehindCamera,
  registerOverlayLabel,
  unregisterOverlayLabel,
  type OverlayLabel,
} from "./labelOverlay";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";

/** Default fade distance for fadeWithDistance labels. */
const DEFAULT_FADE_DISTANCE = 200;

/**
 * Frames a label must stay out of view before its bitmap is dropped.
 * Showing is immediate; hiding is delayed so a camera hovering at the fade
 * boundary (or rotating an object in/out of view) doesn't re-raster the
 * label every few frames. The label is already at opacity 0 while it waits.
 */
const HIDE_DELAY_FRAMES = 15;

/** Gap between a label chip and its debug-mode distance chip. */
const DEBUG_DISTANCE_GAP = 1;

/** Debug-mode distance chips, shared by every label (keyed by meters). */
const distanceChips = new Map<number, CanvasLabel>();

function distanceChip(meters: number): CanvasLabel {
  let chip = distanceChips.get(meters);
  if (!chip) {
    chip = makeTextLabel(`${meters} m`);
    distanceChips.set(meters, chip);
  }
  return chip;
}

export interface WorldLabelOptions {
  /** Text color; defaults to the unified label fill (canvasLabel). */
  color?: string;
  /** Offset from the parent's origin. */
  position?: readonly [x: number, y: number, z: number];
  opacity?: number | "fadeWithDistance";
  fadeDistance?: number;
}

const labels = new Set<WorldLabel>();
const _worldPos = new Vector3();

/**
 * A world-anchored text label drawn by the shared label overlay at a
 * constant screen-pixel size and native display resolution. It fades with
 * camera distance (or holds a fixed opacity), measured from its parent.
 */
export class WorldLabel {
  readonly anchor = new Object3D();
  /** Camera distance from the parent (Infinity behind the camera). */
  distance = Infinity;
  private readonly parent: Object3D;
  private readonly item: OverlayLabel;
  private text = "";
  private color: string | undefined;
  private opacity: number | "fadeWithDistance" = "fadeWithDistance";
  private fadeDistance = DEFAULT_FADE_DISTANCE;
  private visible = false;
  private hideCountdown = HIDE_DELAY_FRAMES;
  private bitmap: CanvasLabel | null = null;
  private debugPainter = false;

  constructor(parent: Object3D, text: string, options: WorldLabelOptions = {}) {
    this.parent = parent;
    this.item = {
      object: this.anchor,
      bitmap: null,
      anchorX: 0,
      anchorY: 0,
      opacity: 0,
    };
    parent.add(this.anchor);
    registerOverlayLabel(this.item);
    labels.add(this);
    this.set(text, options);
  }

  set(text: string, options: WorldLabelOptions = {}): void {
    const position = options.position ?? [0, 0, 0];
    this.anchor.position.set(position[0], position[1], position[2]);
    this.opacity = options.opacity ?? "fadeWithDistance";
    this.fadeDistance = options.fadeDistance ?? DEFAULT_FADE_DISTANCE;
    if (text !== this.text || options.color !== this.color) {
      this.text = text;
      this.color = options.color;
      this.setBitmap(null);
    }
    if (this.opacity === 0) this.visible = false;
  }

  dispose(): void {
    labels.delete(this);
    unregisterOverlayLabel(this.item);
    this.parent.remove(this.anchor);
  }

  update(camera: Camera, suppressed: boolean, debugMode: boolean): void {
    // During a command circuit tour, world-anchored labels get out of the
    // way — the active target gets a screen-space label instead.
    if (suppressed) {
      this.setVisible(false, true);
      this.item.opacity = 0;
      return;
    }
    this.parent.getWorldPosition(_worldPos);
    const behind = isBehindCamera(
      camera,
      _worldPos.x,
      _worldPos.y,
      _worldPos.z,
    );
    const distance = behind ? Infinity : camera.position.distanceTo(_worldPos);
    this.distance = distance;
    let opacity: number;
    if (this.opacity === "fadeWithDistance") {
      const inRange = distance < this.fadeDistance;
      this.setVisible(inRange);
      opacity = inRange
        ? Math.max(0, Math.min(1, 1 - distance / this.fadeDistance))
        : 0;
    } else {
      this.setVisible(!behind && this.opacity !== 0);
      // Opacity drops immediately; only dropping the bitmap is delayed.
      opacity = behind ? 0 : this.opacity;
    }
    if (this.visible && !this.bitmap && this.text)
      this.setBitmap(makeTextLabel(this.text, this.color));
    this.setDebugPainter(debugMode && this.bitmap != null);
    this.item.opacity = opacity;
  }

  private setVisible(visible: boolean, immediately = false): void {
    if (visible) {
      this.hideCountdown = HIDE_DELAY_FRAMES;
      this.visible = true;
    } else if (this.visible && (immediately || --this.hideCountdown <= 0)) {
      this.visible = false;
      this.setBitmap(null);
    }
  }

  private setBitmap(bitmap: CanvasLabel | null): void {
    this.bitmap = bitmap;
    this.item.bitmap = bitmap;
    if (bitmap) {
      this.item.anchorX = bitmap.width / 2;
      this.item.anchorY = bitmap.height / 2;
    }
    // A new bitmap needs a new painter.
    this.setDebugPainter(false);
  }

  // Debug mode: paint the chip ourselves with the camera distance under
  // it. The painter reads the distance at draw time, so only the (shared,
  // per-meter cached) distance chip changes — the label never re-rasters.
  private setDebugPainter(enabled: boolean): void {
    if (enabled === this.debugPainter) return;
    this.debugPainter = enabled;
    const label = this.bitmap;
    if (!enabled || !label) {
      this.item.draw = undefined;
      this.item.cullRadius = undefined;
      return;
    }
    this.item.cullRadius = Math.max(label.width, label.height);
    this.item.draw = (ctx, x, y) => {
      ctx.drawImage(
        label.canvas,
        x - label.width / 2,
        y - label.height / 2,
        label.width,
        label.height,
      );
      if (!Number.isFinite(this.distance)) return;
      const chip = distanceChip(Math.round(this.distance));
      ctx.drawImage(
        chip.canvas,
        x - chip.width / 2,
        y + label.height / 2 + DEBUG_DISTANCE_GAP,
        chip.width,
        chip.height,
      );
    };
  }
}

/** Fade every world label against this frame's camera. */
export function installWorldLabels(engine: GameEngine): () => void {
  return engine.scheduler.add(FramePriority.PostCamera, ({ camera }) => {
    const suppressed =
      commandCircuitStore.getState().active &&
      cameraTourStore.getState().animation !== null;
    const debugMode = selectDebugMode(settingsStore.getState());
    for (const label of labels) label.update(camera, suppressed, debugMode);
  });
}
