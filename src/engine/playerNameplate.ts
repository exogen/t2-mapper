import { Box3, Object3D, Vector3, type Camera } from "three";
import { playerForEntity } from "../state/playerResolver";
import { getKeyframeAtTime } from "../stream/playbackUtils";
import { textureToUrl } from "../loaders";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { settingsStore } from "../state/settingsStore";
import {
  isObserverView,
  resolveIffDisplay,
  rgbString,
  IFF_ENEMY,
} from "../iffTheme";
import {
  createCanvasLabel,
  drawLabelText,
  getTintedIconLabel,
  labelContext,
  measureLabelText,
  LABEL_FONT_FAMILY,
  type CanvasLabel,
} from "./canvasLabel";
import {
  isBehindCamera,
  registerOverlayLabel,
  unregisterOverlayLabel,
  type OverlayLabel,
} from "./labelOverlay";
import type { DTSModel } from "../dts/dtsModel";
import type { PlayerEntity } from "../state/gameEntityTypes";

/** Max distance at which nameplates are visible. */
const NAMEPLATE_FADE_DISTANCE = 150;

/** Padding above the shape's bounding box top for the IFF arrow. */
const IFF_PADDING = 0.1;

/** Height for the name + health label (slightly below the player's feet). */
const NAME_HEIGHT = -0.2;

/**
 * Frames the nameplate must stay out of range before it's hidden, so a
 * camera hovering at the fade boundary doesn't thrash it.
 */
const HIDE_DELAY_FRAMES = 15;

const IFF_FRIENDLY_URL = textureToUrl("gui/hud_alliedtriangle");
const IFF_ENEMY_URL = textureToUrl("gui/hud_enemytriangle");

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

const _worldPos = new Vector3();

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

/** Whether the IFF preference shows this player's nameplate. */
function nameplateShown(entityId: string): boolean {
  const { showIffs } = settingsStore.getState();
  if (showIffs === "always") return true;
  if (showIffs === "never") return false;
  const state = streamPlaybackStore.getState();
  const isFollowed =
    state.followEntityId === entityId &&
    (state.cameraMode === "orbitOverride" ||
      state.cameraMode === "firstPersonOverride");
  return showIffs === "followed" ? isFollowed : !isFollowed;
}

/**
 * Floating nameplate above a player model showing the entity name and a
 * health bar, plus the IFF arrow overhead. Fades out with distance; never
 * shown for the control player. Drawn by the shared label overlay at
 * native display resolution.
 */
export function createPlayerNameplate(
  parent: Object3D,
  readEntity: () => PlayerEntity,
  shape: DTSModel,
): { update(camera: Camera): void; dispose(): void } {
  const group = new Object3D();
  parent.add(group);
  // The IFF height comes from the shape's bounding box.
  const arrowAnchor = new Object3D();
  arrowAnchor.position.set(
    0,
    new Box3().setFromObject(shape.scene).max.y + IFF_PADDING,
    0,
  );
  const plateAnchor = new Object3D();
  plateAnchor.position.set(0, NAME_HEIGHT, 0);
  group.add(arrowAnchor, plateAnchor);

  const arrowItem: OverlayLabel = {
    object: arrowAnchor,
    bitmap: null,
    anchorX: 0,
    anchorY: 0,
    opacity: 0,
  };
  const plateItem: OverlayLabel = {
    object: plateAnchor,
    bitmap: null,
    anchorX: 0,
    anchorY: 0,
    opacity: 0,
  };
  registerOverlayLabel(arrowItem);
  registerOverlayLabel(plateItem);
  let plateLabel: CanvasLabel | null = null;
  let visible = true;
  let hideCountdown = HIDE_DELAY_FRAMES;
  // What's currently drawn/applied, so per-frame work only happens on
  // actual changes (canvas redraws, bitmap swaps).
  const drawn = {
    name: "",
    colorStr: "",
    healthPx: -1,
    hasHealth: false,
    arrowKey: "",
  };
  let healthSource: PlayerEntity["keyframes"] | null = null;
  let hasHealthData = false;

  const hide = () => {
    arrowItem.opacity = 0;
    plateItem.opacity = 0;
  };

  /** The distance fade (as WorldLabel's), or null while hidden. */
  const fade = (camera: Camera): number | null => {
    // During a command circuit tour, world-anchored labels get out of the
    // way — the active target gets a screen-space label instead.
    if (
      commandCircuitStore.getState().active &&
      cameraTourStore.getState().animation !== null
    ) {
      visible = false;
      return null;
    }
    group.getWorldPosition(_worldPos);
    const behind = isBehindCamera(
      camera,
      _worldPos.x,
      _worldPos.y,
      _worldPos.z,
    );
    const distance = behind ? Infinity : camera.position.distanceTo(_worldPos);
    const inRange = distance < NAMEPLATE_FADE_DISTANCE;
    if (inRange) {
      hideCountdown = HIDE_DELAY_FRAMES;
      visible = true;
    } else if (visible && --hideCountdown <= 0) {
      visible = false;
    }
    if (!visible) return null;
    return inRange
      ? Math.max(0, Math.min(1, 1 - distance / NAMEPLATE_FADE_DISTANCE))
      : 0;
  };

  return {
    update(camera) {
      const entity = readEntity();
      if (
        entity.id ===
          streamSnapshotStore.getState().snapshot?.controlPlayerGhostId ||
        !nameplateShown(entity.id)
      ) {
        visible = true;
        hideCountdown = HIDE_DELAY_FRAMES;
        hide();
        return;
      }
      const fadeOpacity = fade(camera);
      if (fadeOpacity == null) {
        hide();
        return;
      }

      // Whether this entity has any health data at all.
      const keyframes = entity.keyframes ?? [];
      if (keyframes !== healthSource) {
        healthSource = keyframes;
        hasHealthData = keyframes.some((kf) => kf.health != null);
      }

      // Hide when dead; otherwise apply the distance fade.
      const kf = getKeyframeAtTime(keyframes, streamClock.time);
      const health = kf?.health ?? 1;
      const dead = kf?.damageState != null && kf.damageState >= 1;
      const opacity = dead ? 0 : fadeOpacity;
      arrowItem.opacity = opacity;
      plateItem.opacity = opacity;
      if (dead) return;

      // Affiliation fields and playerName are mutated in-place by streaming
      // playback, so they're polled here. rgbString is cached by color
      // identity (theme constants), so this is alloc-free.
      const { observerTeamColors } = settingsStore.getState();
      const observer = isObserverView();
      const display = resolveIffDisplay(entity, observer, observerTeamColors);
      const colorStr = rgbString(display.color);

      // IFF arrow: enemy shape + theme color for teamed viewers, allied
      // shape + team color for observers.
      const arrowUrl =
        !observer && display === IFF_ENEMY ? IFF_ENEMY_URL : IFF_FRIENDLY_URL;
      const arrowKey = `${arrowUrl}|${colorStr}`;
      if (drawn.arrowKey !== arrowKey) {
        const bitmap = getTintedIconLabel(
          arrowUrl,
          colorStr,
          ARROW_ICON_OPTIONS,
        );
        if (bitmap) {
          drawn.arrowKey = arrowKey;
          arrowItem.bitmap = bitmap;
          arrowItem.anchorX = ARROW_LABEL_SIZE / 2;
          arrowItem.anchorY = ARROW_LABEL_SIZE / 2 + ARROW_RAISE;
        }
      }

      // Name + health plate, redrawn only when its content changes (the
      // color matters too: the health fill is tinted by it).
      const name = playerForEntity(entity).name || entity.id;
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
        if (
          !plateLabel ||
          plateLabel.width !== width ||
          plateLabel.height !== height
        ) {
          plateLabel = createCanvasLabel(width, height);
        }
        drawPlate(plateLabel, name, colorStr, healthPx, hasHealthData);
        plateItem.bitmap = plateLabel;
        plateItem.anchorX = width / 2;
        // Anchor: top edge hangs just below the feet-level anchor point.
        plateItem.anchorY = -PLATE_DROP;
      }
    },
    dispose() {
      unregisterOverlayLabel(arrowItem);
      unregisterOverlayLabel(plateItem);
      parent.remove(group);
    },
  };
}
