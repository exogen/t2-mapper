import { Object3D, Vector3, type Camera } from "three";
import { textureToUrl } from "../loaders";
import { resolveFlagTeam, shouldShowFlagMarker } from "../state/flagTeam";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { settingsStore } from "../state/settingsStore";
import {
  IFF_NEUTRAL,
  isObserverView,
  resolveIffDisplay,
  rgbString,
} from "../iffTheme";
import {
  createCanvasLabel,
  drawLabelText,
  getTintedIconLabel,
  labelContext,
  LABEL_FONT_FAMILY,
  type CanvasLabel,
} from "./canvasLabel";
import {
  registerOverlayLabel,
  unregisterOverlayLabel,
  type OverlayLabel,
} from "./labelOverlay";
import { createCommandCircuitFlagCallout } from "./commandCircuitFlagCallout";
import type { GameEntity } from "../state/gameEntityTypes";
import type { FrameContext } from "./frameScheduler";

const FLAG_ICON_HEIGHT = 1.5;
const FLAG_ICON_URL = textureToUrl("commander/MiniIcons/com_flag_grey");

// ── Layout (CSS pixels, mirroring the old FlagMarker.module.css) ──

const ICON_SIZE = 16;
const ICON_MARGIN = 3;
const ICON_LABEL_SIZE = ICON_SIZE + ICON_MARGIN * 2;
/** Flag icon tint options (outline styling is the unified label style). */
const FLAG_ICON_OPTIONS = {
  size: ICON_SIZE,
  margin: ICON_MARGIN,
};

const DIST_FONT_SIZE = 10;
const DIST_LABEL_WIDTH = 48;
const DIST_LABEL_HEIGHT = 14;
/** Both elements render at half opacity, like the old CSS. */
const MARKER_OPACITY = 0.5;
/** Distance text centers this many pixels above the anchor; the icon
 *  centers below it — reproducing the old stacked-column layout. */
const DIST_RAISE = 8.5;
const ICON_DROP = 7.5;

const _tmpVec = new Vector3();

function drawDistance(label: CanvasLabel, text: string): void {
  const ctx = labelContext(label);
  drawLabelText(
    ctx,
    text,
    label.width / 2,
    label.height / 2 + 0.5,
    `${DIST_FONT_SIZE}px ${LABEL_FONT_FAMILY}`,
  );
}

interface Marker {
  update(frame: FrameContext): void;
  dispose(): void;
}

/**
 * Floating flag icon above a flag entity, tinted by IFF color (green for
 * friendly, red for enemy — matching Tribes 2's sensor group color system),
 * with a live distance readout. Always visible regardless of distance.
 * Drawn by the shared label overlay (see canvasLabel.ts).
 */
function createFlagMarker(
  parent: Object3D,
  readEntity: () => GameEntity,
): Marker {
  const marker = new Object3D();
  const anchor = new Object3D();
  anchor.position.set(0, FLAG_ICON_HEIGHT, 0);
  marker.add(anchor);
  parent.add(marker);
  const iconItem: OverlayLabel = {
    object: anchor,
    bitmap: null,
    anchorX: ICON_LABEL_SIZE / 2,
    anchorY: ICON_LABEL_SIZE / 2 - ICON_DROP,
    opacity: MARKER_OPACITY,
  };
  const distItem: OverlayLabel = {
    object: anchor,
    bitmap: null,
    anchorX: DIST_LABEL_WIDTH / 2,
    anchorY: DIST_LABEL_HEIGHT / 2 + DIST_RAISE,
    opacity: MARKER_OPACITY,
  };
  registerOverlayLabel(iconItem);
  registerOverlayLabel(distItem);
  let distLabel: CanvasLabel | null = null;
  let lastColor = "";
  let lastDist = "";

  const update = (camera: Camera) => {
    const entity = readEntity();
    const { observerTeamColors } = settingsStore.getState();
    // Tint — affiliation fields are mutated in-place by streaming playback.
    // Teamed viewers get the friend/foe theme constants (iffColor only
    // classifies the side); observers tint by the (carried) flag's team.
    let color: string;
    if (isObserverView()) {
      const { teamId } = resolveFlagTeam(entity);
      color = rgbString(
        resolveIffDisplay(
          { teamId: teamId ?? undefined },
          true,
          observerTeamColors,
        ).color,
      );
    } else if ("iffColor" in entity && entity.iffColor) {
      color = rgbString(
        resolveIffDisplay(
          { iffColor: entity.iffColor },
          false,
          observerTeamColors,
        ).color,
      );
    } else {
      color = rgbString(IFF_NEUTRAL.color);
    }
    if (color !== lastColor || iconItem.bitmap == null) {
      const bitmap = getTintedIconLabel(
        FLAG_ICON_URL,
        color,
        FLAG_ICON_OPTIONS,
      );
      if (bitmap) {
        lastColor = color;
        iconItem.bitmap = bitmap;
      }
    }

    // Distance readout, redrawn only when the displayed value changes.
    marker.getWorldPosition(_tmpVec);
    const distance = camera.position.distanceTo(_tmpVec).toFixed(1);
    if (distance !== lastDist || !distLabel) {
      lastDist = distance;
      distLabel ??= createCanvasLabel(DIST_LABEL_WIDTH, DIST_LABEL_HEIGHT);
      drawDistance(distLabel, distance);
      distItem.bitmap = distLabel;
    }
  };

  return {
    update: ({ camera }) => update(camera),
    dispose() {
      unregisterOverlayLabel(iconItem);
      unregisterOverlayLabel(distItem);
      parent.remove(marker);
    },
  };
}

/**
 * A flag's marker while the entity is a flag (including its carrier, until
 * death): the floating icon in 3D, or the command circuit's callout, which
 * stays readable from the top-down view.
 */
export function createFlagMarkerSlot(
  parent: Object3D,
  readEntity: () => GameEntity,
): Marker {
  let kind: "marker" | "callout" | null = null;
  let marker: Marker | null = null;
  return {
    update(frame) {
      const next = shouldShowFlagMarker(readEntity())
        ? commandCircuitStore.getState().active
          ? "callout"
          : "marker"
        : null;
      if (next !== kind) {
        marker?.dispose();
        kind = next;
        marker =
          next === "marker"
            ? createFlagMarker(parent, readEntity)
            : next === "callout"
              ? createCommandCircuitFlagCallout(readEntity)
              : null;
      }
      marker?.update(frame);
    },
    dispose() {
      marker?.dispose();
      marker = null;
      kind = null;
    },
  };
}
