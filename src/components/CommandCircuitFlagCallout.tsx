import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useFrame } from "@react-three/fiber";
import { FaHand } from "react-icons/fa6";
import { ImArrowDownRight, ImHome } from "react-icons/im";
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
import {
  drawCalloutLines,
  drawLabelChip,
  getSvgIconLabel,
  LABEL_TEXT_FILL,
} from "./canvasLabel";
import { useOverlayLabel } from "./LabelOverlay";
import type { GameEntity } from "../state/gameEntityTypes";

/** Circle radius — flags and carriers all read at about this size. */
const CIRCLE_RADIUS = 16;

/** Slightly smaller text than the tour callout; the chip styling itself
 *  (background, padding, text stroke) is the unified label system. */
const LABEL_FONT_SIZE = 9;

/** Flag status shown as an icon after the label text. */
type FlagStatus = "home" | "held" | "field";

const STATUS_ICONS: Record<FlagStatus, { markup: string; size: number }> = {
  home: {
    markup: renderToStaticMarkup(<ImHome size={9} color={LABEL_TEXT_FILL} />),
    size: 9,
  },
  held: {
    markup: renderToStaticMarkup(<FaHand size={9} color={LABEL_TEXT_FILL} />),
    size: 9,
  },
  field: {
    markup: renderToStaticMarkup(
      <ImArrowDownRight size={8} color={LABEL_TEXT_FILL} />,
    ),
    size: 8,
  },
};

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
 * Drawn by the shared LabelOverlay; geometry, color, and label update
 * every frame.
 */
export function CommandCircuitFlagCallout({ entity }: { entity: GameEntity }) {
  const { observerTeamColors } = useSettings();

  const currentRef = useRef({ entity, observerTeamColors });
  useEffect(() => {
    currentRef.current = { entity, observerTeamColors };
  }, [entity, observerTeamColors]);

  const item = useOverlayLabel(() => ({
    object: null,
    bitmap: null,
    anchorX: 0,
    anchorY: 0,
    opacity: 1,
    // Line-work sits under text labels (player names read over the circle).
    layer: -1,
    // Match the DOM version: hidden as soon as the flag leaves the screen.
    cullRadius: 0,
    draw: (ctx, x, y) => {
      const { entity, observerTeamColors } = currentRef.current;
      const { teamId, name } = resolveFlagTeam(entity);

      // Circle + 45° leader, tinted by IFF/team color (entity fields are
      // mutated in place by streaming playback, so re-resolve each frame).
      const anchor = drawCalloutLines(
        ctx,
        x,
        y,
        CIRCLE_RADIUS,
        resolveCalloutStroke(entity, teamId, observerTeamColors),
      );

      // Shared label chip: "<Team> Flag" plus a status icon.
      const label = name ? `${name} Flag` : "Flag";
      const status = resolveFlagStatus(entity, teamId);
      const icon = STATUS_ICONS[status];
      const iconBitmap = getSvgIconLabel(icon.markup, icon.size, icon.size);
      drawLabelChip(ctx, label, anchor.x, anchor.y, {
        fontSize: LABEL_FONT_SIZE,
        icon: iconBitmap ? { bitmap: iconBitmap, size: icon.size } : null,
        anchor: "left",
      });
    },
  }));

  // Resolve the tracked object (flag item, or its carrier) each frame —
  // the target streams in lazily and can be replaced (pickup/drop).
  const trackerRef = useRef<ScreenRectTracker | null>(null);
  useFrame(({ scene }) => {
    const tracker = (trackerRef.current ??= new ScreenRectTracker());
    const root = tracker.resolveTarget(null, entity.id, scene);
    if (!root) tracker.reset();
    item.object = root ?? null;
  });

  return null;
}
