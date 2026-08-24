import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FaSkullCrossbones } from "react-icons/fa";
import type { Group } from "three";
import { getKeyframeAtTime } from "../stream/playbackUtils";
import { streamClock } from "../state/streamPlaybackStore";
import {
  isObserverView,
  resolveIffDisplay,
  rgbString,
  IFF_FRIENDLY,
} from "./iffTheme";
import { useSettings } from "./SettingsProvider";
import { useDataSource } from "../state/gameEntityStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { enterWatchFollow, isWatchSpectator } from "../state/watchFollow";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  createCanvasLabel,
  drawLabelText,
  getSvgIconLabel,
  labelContext,
  measureLabelText,
  LABEL_FONT_FAMILY,
  type CanvasLabel,
} from "./canvasLabel";
import { useOverlayLabel, type OverlayLabel } from "./LabelOverlay";
import type { PlayerEntity } from "../state/gameEntityTypes";

/** Dot radius; the view cone's apex sits at the dot's center. */
const DOT_RADIUS = 4;
/** How far the view cone reaches from the dot, with a 90° spread. */
const CONE_LENGTH = 34;
const CONE_HALF_WIDTH = Math.round(CONE_LENGTH * Math.tan(Math.PI / 4));
/** Death icon size (skull and crossbones) — a bit bigger than the dot. */
const SKULL_SIZE = 12;
/** How long the death icon lingers over the body, in playback seconds. */
const DEATH_FADE_SECONDS = 3;

/** Neutral gray for the death icon, matching the app's other neutral icon
 *  tints (e.g. FlagMarker's untinted flag). */
const SKULL_COLOR = "rgb(200, 200, 200)";

const FALLBACK_COLOR = rgbString(IFF_FRIENDLY.mapColor);

const NAME_FONT_SIZE = 8;
/** Name center sits this far above the dot center. */
const NAME_RAISE = DOT_RADIUS + 7;

const SKULL_MARKUP = renderToStaticMarkup(
  <FaSkullCrossbones color={SKULL_COLOR} size={SKULL_SIZE} />,
);

// ── Cone + dot bitmap, cached per color ──
// The marker body (gradient view cone pointing up, dot with outline) is
// pre-rendered once per theme color; draw() then just rotates and blits it.

const CONE_PAD = 2;
const CONE_EXTENT = CONE_LENGTH + CONE_PAD;
const CONE_BITMAP_SIZE = CONE_EXTENT * 2;

const _coneBitmaps = new Map<string, CanvasLabel>();

function getConeBitmap(colorStr: string): CanvasLabel {
  const cached = _coneBitmaps.get(colorStr);
  if (cached) return cached;
  const label = createCanvasLabel(CONE_BITMAP_SIZE, CONE_BITMAP_SIZE);
  const ctx = labelContext(label);
  ctx.translate(CONE_EXTENT, CONE_EXTENT);
  // Gradient cone fading out from the dot, pointing up (-Y); draw()
  // rotates the whole bitmap to the player's heading.
  const gradient = ctx.createLinearGradient(0, -DOT_RADIUS, 0, -CONE_LENGTH);
  const rgb = colorStr.slice(colorStr.indexOf("(") + 1, -1);
  gradient.addColorStop(0, `rgba(${rgb}, 0.3)`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-CONE_HALF_WIDTH, -CONE_LENGTH);
  ctx.lineTo(CONE_HALF_WIDTH, -CONE_LENGTH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colorStr;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  _coneBitmaps.set(colorStr, label);
  return label;
}

/** Player name bitmap in the unified label style (stroked text). At 8px
 *  the names are too small for the unified tightened tracking — they keep
 *  normal letter-spacing. */
function makeNameBitmap(text: string): CanvasLabel {
  const font = `${NAME_FONT_SIZE}px ${LABEL_FONT_FAMILY}`;
  const width = Math.ceil(measureLabelText(text, font, 0)) + 4;
  const height = NAME_FONT_SIZE + 4;
  const label = createCanvasLabel(width, height);
  const ctx = labelContext(label);
  drawLabelText(ctx, text, width / 2, height / 2, font, { letterSpacingEm: 0 });
  return label;
}

/**
 * Radar-style player indicator for the command circuit map: a solid dot
 * centered over the player with a view-direction cone that fades out with
 * distance, colored by IFF (green friendly / red enemy). On death the dot
 * and cone give way to a skull-and-crossbones over the body that fades
 * out over a few seconds. Drawn by the shared LabelOverlay with
 * screen-space hit-testing for hover names and click-to-observe.
 */
export function CommandCircuitPlayerMarker({
  entity,
}: {
  entity: PlayerEntity;
}) {
  // Empty group probing the entity's world transform — it sits inside the
  // entity wrapper, so its matrixWorld carries the player's position and
  // rotation. Entity-local +X (Torque +Y) is the player's forward. Its
  // world position anchors the overlay item, centering the dot exactly on
  // the player origin.
  const { observerTeamColors, ccPlayerNames } = useSettings();
  const isLive = useDataSource() === "live";
  const [probe, setProbe] = useState<Group | null>(null);
  const hoverRef = useRef(false);
  /** Whether the player was dead last frame; null until first observed.
   *  Players first seen already dead never get an X — only a death
   *  witnessed while the marker is mounted shows one. */
  const wasDeadRef = useRef<boolean | null>(null);
  const deathTimeRef = useRef<number | null>(null);
  const nameBitmapRef = useRef<{ text: string; bitmap: CanvasLabel } | null>(
    null,
  );

  // Settings and entity are read inside draw()/onClick via this ref so the
  // overlay item (registered once) always sees current values.
  const currentRef = useRef({
    entity,
    observerTeamColors,
    ccPlayerNames,
    isLive,
  });
  useEffect(() => {
    currentRef.current = { entity, observerTeamColors, ccPlayerNames, isLive };
  }, [entity, observerTeamColors, ccPlayerNames, isLive]);

  const item = useOverlayLabel(() => {
    const it: OverlayLabel = {
      object: null,
      bitmap: null,
      anchorX: 0,
      anchorY: 0,
      opacity: 1,
      cullRadius: CONE_LENGTH + 8,
      hitRadius: DOT_RADIUS + 8,
      onHoverChange: (hovering) => {
        hoverRef.current = hovering;
      },
      // Click-to-observe: resolve the player's client connection id from
      // the roster and ask the server to orbit them — the same
      // serverCmdObserveClient a real observer uses. Dead players are
      // skipped (no player object to orbit server-side).
      onClick: () => {
        const { entity, isLive } = currentRef.current;
        const kf = getKeyframeAtTime(entity.keyframes ?? [], streamClock.time);
        if (kf?.damageState != null && kf.damageState >= 1) return;
        // Client-side follow: demo playback and live spectate both orbit
        // this player's ghost directly (no server round-trip), and it's
        // shared with the 3D view so exiting either reverts both.
        if (!isLive || isWatchSpectator()) {
          enterWatchFollow(entity.id);
          return;
        }
        // The targetId from MsgClientJoin is the exact join key to the
        // player entity; the name comparison is a fallback for
        // servers/replays where the join message predates our tracking.
        const roster = streamSnapshotStore.getState().snapshot?.playerRoster;
        const entry =
          roster?.find(
            (p) => p.targetId != null && p.targetId === entity.targetId,
          ) ?? roster?.find((p) => p.name === entity.playerName);
        if (!entry) return;
        liveConnectionStore
          .getState()
          .sendCommand("ObserveClient", String(entry.clientId));
      },
      draw: (ctx, x, y) => {
        const { entity, observerTeamColors, ccPlayerNames } =
          currentRef.current;
        const now = streamClock.time;
        const kf = getKeyframeAtTime(entity.keyframes ?? [], now);
        const dead = kf?.damageState != null && kf.damageState >= 1;

        if (dead) {
          if (wasDeadRef.current === null) {
            // Already dead when first observed — no X, show nothing.
            wasDeadRef.current = true;
          } else if (!wasDeadRef.current) {
            // Witnessed alive → dead transition: start the X fade.
            wasDeadRef.current = true;
            deathTimeRef.current = now;
          } else if (
            deathTimeRef.current != null &&
            now < deathTimeRef.current
          ) {
            // Seeking backward across the death restarts the fade.
            deathTimeRef.current = now;
          }
          const fade =
            deathTimeRef.current != null
              ? 1 - (now - deathTimeRef.current) / DEATH_FADE_SECONDS
              : 0;
          if (fade <= 0) return;
          const skull = getSvgIconLabel(SKULL_MARKUP, SKULL_SIZE, SKULL_SIZE);
          if (skull) {
            ctx.globalAlpha *= Math.min(1, fade);
            // The bitmap carries an outline margin around the icon size.
            ctx.drawImage(
              skull.canvas,
              x - skull.width / 2,
              y - skull.height / 2,
              skull.width,
              skull.height,
            );
          }
          return;
        }
        wasDeadRef.current = false;
        deathTimeRef.current = null;

        // Entity affiliation fields are mutated in-place by streaming
        // playback, so re-resolve the theme color every frame.
        const color = rgbString(
          resolveIffDisplay(entity, isObserverView(), observerTeamColors)
            .mapColor ?? IFF_FRIENDLY.mapColor,
        );
        const cone = getConeBitmap(color || FALLBACK_COLOR);

        // First column of matrixWorld = world direction of local +X (the
        // player's forward). Screen-up is world +X (Torque north) and
        // screen-right is world +Z (east), so the clockwise-from-up screen
        // angle is atan2(z, x) — same convention as the compass heading.
        let heading = 0;
        const anchor = it.object;
        if (anchor) {
          const e = anchor.matrixWorld.elements;
          if (Math.hypot(e[0], e[2]) > 1e-4) {
            heading = Math.atan2(e[2], e[0]);
          }
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(heading);
        ctx.drawImage(
          cone.canvas,
          -CONE_EXTENT,
          -CONE_EXTENT,
          CONE_BITMAP_SIZE,
          CONE_BITMAP_SIZE,
        );
        ctx.restore();

        // Player name above the dot, per the preference. playerName is
        // mutated in place by streaming playback, so re-check every frame.
        const showName =
          ccPlayerNames === "always" ||
          (ccPlayerNames === "hover" && hoverRef.current);
        if (showName) {
          const text = entity.playerName ?? "";
          if (text) {
            let cached = nameBitmapRef.current;
            if (!cached || cached.text !== text) {
              cached = { text, bitmap: makeNameBitmap(text) };
              nameBitmapRef.current = cached;
            }
            const { bitmap } = cached;
            ctx.drawImage(
              bitmap.canvas,
              x - bitmap.width / 2,
              y - NAME_RAISE - bitmap.height / 2,
              bitmap.width,
              bitmap.height,
            );
          }
        }
      },
    };
    return it;
  });

  useEffect(() => {
    item.object = probe;
    item.cursor = isLive ? "pointer" : undefined;
  }, [item, probe, isLive]);

  return <group ref={setProbe} />;
}
