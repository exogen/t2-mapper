import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { textureToUrl } from "../loaders";
import { resolveFlagTeam } from "./flagTeam";
import {
  IFF_NEUTRAL,
  isObserverView,
  resolveIffDisplay,
  rgbString,
} from "./iffTheme";
import { useSettings } from "./SettingsProvider";
import { resolveRootState } from "./r3fRootState";
import {
  createCanvasLabel,
  drawLabelText,
  getTintedIconLabel,
  labelContext,
  LABEL_FONT_FAMILY,
  type CanvasLabel,
} from "./canvasLabel";
import { useOverlayLabel } from "./LabelOverlay";
import type { GameEntity } from "../state/gameEntityTypes";

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

/**
 * Floating flag icon above a flag entity, tinted by IFF color (green for
 * friendly, red for enemy — matching Tribes 2's sensor group color system),
 * with a live distance readout. Always visible regardless of distance.
 * Drawn by the shared LabelOverlay (see canvasLabel.ts).
 */
export function FlagMarker({ entity }: { entity: GameEntity }) {
  const { observerTeamColors } = useSettings();
  const markerRef = useRef<Group>(null);
  const iconItem = useOverlayLabel(() => ({
    object: null,
    bitmap: null,
    anchorX: ICON_LABEL_SIZE / 2,
    anchorY: ICON_LABEL_SIZE / 2 - ICON_DROP,
    opacity: MARKER_OPACITY,
  }));
  const distItem = useOverlayLabel(() => ({
    object: null,
    bitmap: null,
    anchorX: DIST_LABEL_WIDTH / 2,
    anchorY: DIST_LABEL_HEIGHT / 2 + DIST_RAISE,
    opacity: MARKER_OPACITY,
  }));
  const distLabelRef = useRef<CanvasLabel | null>(null);

  const lastColorRef = useRef("");
  const lastDistRef = useRef("");

  useFrame((state) => {
    const marker = markerRef.current;
    if (!marker) return;

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
    if (color !== lastColorRef.current || iconItem.bitmap == null) {
      const bitmap = getTintedIconLabel(
        FLAG_ICON_URL,
        color,
        FLAG_ICON_OPTIONS,
      );
      if (bitmap) {
        lastColorRef.current = color;
        iconItem.bitmap = bitmap;
      }
    }

    // Distance readout, redrawn only when the displayed value changes.
    const root = resolveRootState(state);
    marker.getWorldPosition(_tmpVec);
    const distance = root.camera.position.distanceTo(_tmpVec).toFixed(1);
    let distLabel = distLabelRef.current;
    if (distance !== lastDistRef.current || !distLabel) {
      lastDistRef.current = distance;
      if (!distLabel) {
        distLabel = createCanvasLabel(DIST_LABEL_WIDTH, DIST_LABEL_HEIGHT);
        distLabelRef.current = distLabel;
      }
      drawDistance(distLabel, distance);
      distItem.bitmap = distLabel;
    }
  });

  return (
    <group ref={markerRef}>
      <object3D
        position={[0, FLAG_ICON_HEIGHT, 0]}
        ref={(node) => {
          iconItem.object = node;
          distItem.object = node;
        }}
      />
    </group>
  );
}
