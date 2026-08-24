import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3 } from "three";
import { getKeyframeAtTime } from "../stream/playbackUtils";
import { textureToUrl } from "../loaders";
import { useStaticShape } from "./GenericShape";
import { useFloatingLabelFade } from "./FloatingLabel";
import { streamClock } from "../state/streamPlaybackStore";
import {
  isObserverView,
  resolveIffDisplay,
  rgbString,
  IFF_ENEMY,
} from "./iffTheme";
import { useSettings } from "./SettingsProvider";
import {
  createCanvasLabel,
  drawLabelText,
  getTintedIconLabel,
  labelContext,
  measureLabelText,
  LABEL_FONT_FAMILY,
  type CanvasLabel,
} from "./canvasLabel";
import { useOverlayLabel, type OverlayLabel } from "./LabelOverlay";
import type { PlayerEntity } from "../state/gameEntityTypes";

/** Max distance at which nameplates are visible. */
const NAMEPLATE_FADE_DISTANCE = 150;

/** Padding above the shape's bounding box top for the IFF arrow. */
const IFF_PADDING = 0.1;

/** Height for the name + health label (slightly below the player's feet). */
const NAME_HEIGHT = -0.2;

const IFF_FRIENDLY_URL = textureToUrl("gui/hud_alliedtriangle");
const IFF_ENEMY_URL = textureToUrl("gui/hud_enemytriangle");

const EMPTY_KEYFRAMES: never[] = [];

// ── Layout (CSS pixels, mirroring the old PlayerNameplate.module.css) ──

/** Triangle size; the bitmap adds a margin for its outline. */
const ARROW_SIZE = 12;
const ARROW_MARGIN = 2;
const ARROW_LABEL_SIZE = ARROW_SIZE + ARROW_MARGIN * 2;
/** The arrow's center floats this many pixels above its anchor. */
const ARROW_RAISE = 10;

const NAME_FONT_SIZE = 11;
const NAME_ROW_HEIGHT = 14;
/** Headroom for the name's stroke outline. */
const PLATE_PAD = 3;
const HEALTH_WIDTH = 60;
const HEALTH_HEIGHT = 6;
const HEALTH_GAP = 2;
/** Health fill resolution: quantizing avoids redraws for sub-pixel changes. */
const HEALTH_INNER_WIDTH = HEALTH_WIDTH - 2;
/** The plate's top edge hangs this many pixels below its anchor. */
const PLATE_DROP = 2;

/** IFF arrow tint options (outline styling is the unified label style). */
const ARROW_ICON_OPTIONS = {
  size: ARROW_SIZE,
  margin: ARROW_MARGIN,
};

// ── Name + health plate: one canvas, redrawn only when content changes ──

function drawPlate(
  label: CanvasLabel,
  name: string,
  colorStr: string,
  healthPx: number,
  hasHealth: boolean,
): void {
  const { width } = label;
  const ctx = labelContext(label);
  drawLabelText(
    ctx,
    name,
    width / 2,
    PLATE_PAD + NAME_ROW_HEIGHT / 2,
    `${NAME_FONT_SIZE}px ${LABEL_FONT_FAMILY}`,
  );

  if (hasHealth) {
    const barX = (width - HEALTH_WIDTH) / 2;
    const barY = PLATE_PAD + NAME_ROW_HEIGHT + HEALTH_GAP;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, HEALTH_WIDTH - 1, HEALTH_HEIGHT - 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(barX + 1, barY + 1, HEALTH_INNER_WIDTH, HEALTH_HEIGHT - 2);
    if (healthPx > 0) {
      ctx.fillStyle = colorStr;
      ctx.fillRect(barX + 1, barY + 1, healthPx, HEALTH_HEIGHT - 2);
    }
  }
}

function plateSize(name: string, hasHealth: boolean): [number, number] {
  const textWidth = measureLabelText(
    name,
    `${NAME_FONT_SIZE}px ${LABEL_FONT_FAMILY}`,
  );
  const width = Math.ceil(
    Math.max(textWidth + PLATE_PAD * 2, HEALTH_WIDTH + 2),
  );
  const height =
    PLATE_PAD * 2 +
    NAME_ROW_HEIGHT +
    (hasHealth ? HEALTH_GAP + HEALTH_HEIGHT : 0);
  return [width, height];
}

function makeItem(): OverlayLabel {
  return { object: null, bitmap: null, anchorX: 0, anchorY: 0, opacity: 0 };
}

/**
 * Floating nameplate above a player model showing the entity name and a health
 * bar, plus the IFF arrow overhead. Fades out with distance. Drawn by the
 * shared LabelOverlay at native display resolution — the old drei `<Html>`
 * version cost two DOM projections per player per frame, and the interim
 * sprite version cost two draw calls per player and blurred with the 3D
 * render scale.
 */
export function PlayerNameplate({ entity }: { entity: PlayerEntity }) {
  const gltf = useStaticShape(entity.shapeName!);
  const { observerTeamColors } = useSettings();
  const { groupRef, isVisible, opacityRef } = useFloatingLabelFade({
    fadeDistance: NAMEPLATE_FADE_DISTANCE,
  });
  const arrowItem = useOverlayLabel(makeItem);
  const plateItem = useOverlayLabel(makeItem);
  const plateLabelRef = useRef<CanvasLabel | null>(null);

  // What's currently drawn/applied, so per-frame work only happens on
  // actual changes (canvas redraws, bitmap swaps).
  const drawnRef = useRef({
    name: "",
    colorStr: "",
    healthPx: -1,
    hasHealth: false,
    arrowKey: "",
  });

  // Derive IFF height from the shape's bounding box.
  const iffHeight = useMemo(() => {
    const box = new Box3().setFromObject(gltf.scene);
    return box.max.y + IFF_PADDING;
  }, [gltf.scene]);

  // Check whether this entity has any health data at all.
  const keyframes = entity.keyframes ?? EMPTY_KEYFRAMES;
  const hasHealthData = useMemo(
    () => keyframes.some((kf) => kf.health != null),
    [keyframes],
  );

  useFrame(() => {
    if (!isVisible) {
      arrowItem.opacity = 0;
      plateItem.opacity = 0;
      return;
    }
    const drawn = drawnRef.current;

    // Hide when dead; otherwise apply the shared distance fade.
    const kf = getKeyframeAtTime(keyframes, streamClock.time);
    const health = kf?.health ?? 1;
    const dead = kf?.damageState != null && kf.damageState >= 1;
    const opacity = dead ? 0 : opacityRef.current;
    arrowItem.opacity = opacity;
    plateItem.opacity = opacity;
    if (dead) return;

    // Affiliation fields and playerName are mutated in-place by streaming
    // playback without re-renders, so they're polled here. rgbString is
    // cached by color identity (theme constants), so this is alloc-free.
    const observer = isObserverView();
    const display = resolveIffDisplay(entity, observer, observerTeamColors);
    const colorStr = rgbString(display.color);

    // IFF arrow: enemy shape + theme color for teamed viewers, allied
    // shape + team color for observers.
    const arrowUrl =
      !observer && display === IFF_ENEMY ? IFF_ENEMY_URL : IFF_FRIENDLY_URL;
    const arrowKey = `${arrowUrl}|${colorStr}`;
    if (drawn.arrowKey !== arrowKey) {
      const bitmap = getTintedIconLabel(arrowUrl, colorStr, ARROW_ICON_OPTIONS);
      if (bitmap) {
        drawn.arrowKey = arrowKey;
        arrowItem.bitmap = bitmap;
        arrowItem.anchorX = ARROW_LABEL_SIZE / 2;
        arrowItem.anchorY = ARROW_LABEL_SIZE / 2 + ARROW_RAISE;
      }
    }

    // Name + health plate, redrawn only when its content changes (the
    // color matters too: the health fill is tinted by it).
    const name = entity.playerName ?? entity.id;
    const healthPx = hasHealthData
      ? Math.round(Math.max(0, Math.min(1, health)) * HEALTH_INNER_WIDTH)
      : -1;
    if (
      drawn.name !== name ||
      drawn.healthPx !== healthPx ||
      drawn.hasHealth !== hasHealthData ||
      drawn.colorStr !== colorStr ||
      plateItem.bitmap == null
    ) {
      drawn.name = name;
      drawn.healthPx = healthPx;
      drawn.hasHealth = hasHealthData;
      drawn.colorStr = colorStr;
      const [width, height] = plateSize(name, hasHealthData);
      let label = plateLabelRef.current;
      if (!label || label.width !== width || label.height !== height) {
        label = createCanvasLabel(width, height);
        plateLabelRef.current = label;
      }
      drawPlate(label, name, drawn.colorStr, healthPx, hasHealthData);
      plateItem.bitmap = label;
      plateItem.anchorX = width / 2;
      // Anchor: top edge hangs just below the feet-level anchor point.
      plateItem.anchorY = -PLATE_DROP;
    }
  });

  return (
    <group ref={groupRef}>
      <object3D
        position={[0, iffHeight, 0]}
        ref={(node) => {
          arrowItem.object = node;
        }}
      />
      <object3D
        position={[0, NAME_HEIGHT, 0]}
        ref={(node) => {
          plateItem.object = node;
        }}
      />
    </group>
  );
}
