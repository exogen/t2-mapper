import { Object3D } from "three";
import { playerForEntity } from "../state/playerResolver";
import { getKeyframeAtTime } from "../stream/playbackUtils";
import { streamClock } from "../state/streamPlaybackStore";
import { settingsStore } from "../state/settingsStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { enterWatchFollow, isWatchSpectator } from "../state/watchFollow";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  isObserverView,
  resolveIffDisplay,
  rgbString,
  IFF_FRIENDLY,
} from "../iffTheme";
import { SKULL_MARKUP, SKULL_SIZE } from "./markerIcons";
import {
  createCanvasLabel,
  drawLabelText,
  getSvgIconLabel,
  labelContext,
  measureLabelText,
  LABEL_FONT_FAMILY,
  type CanvasLabel,
} from "./canvasLabel";
import {
  registerOverlayLabel,
  unregisterOverlayLabel,
  type OverlayLabel,
} from "./labelOverlay";
import { combineCleanups, reaction } from "./storeReaction";
import type { PlayerEntity } from "../state/gameEntityTypes";

/** Dot radius; the view cone's apex sits at the dot's center. */
const DOT_RADIUS = 4;
/** How far the view cone reaches from the dot, with a 90° spread. */
const CONE_LENGTH = 34;
const CONE_HALF_WIDTH = Math.round(CONE_LENGTH * Math.tan(Math.PI / 4));
/** How long the death icon lingers over the body, in playback seconds. */
const DEATH_FADE_SECONDS = 3;

const FALLBACK_COLOR = rgbString(IFF_FRIENDLY.mapColor);

const NAME_FONT_SIZE = 8;
/** Name center sits this far above the dot center. */
const NAME_RAISE = DOT_RADIUS + 7;

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
 * out over a few seconds. Drawn by the shared label overlay with
 * screen-space hit-testing for hover names and click-to-observe.
 *
 * The probe sits inside the entity wrapper, so its matrixWorld carries the
 * player's position and rotation. Entity-local +X (Torque +Y) is the
 * player's forward.
 */
export function createCommandCircuitPlayerMarker(
  parent: Object3D,
  readEntity: () => PlayerEntity,
): () => void {
  const probe = new Object3D();
  parent.add(probe);
  let hovering = false;
  /** Whether the player was dead last frame; null until first observed.
   *  Players first seen already dead never get an X — only a death
   *  witnessed while the marker is shown shows one. */
  let wasDead: boolean | null = null;
  let deathTime: number | null = null;
  let nameBitmap: { text: string; bitmap: CanvasLabel } | null = null;
  const isLive = () => gameEntityStore.getState().dataSource === "live";

  const item: OverlayLabel = {
    object: probe,
    bitmap: null,
    anchorX: 0,
    anchorY: 0,
    opacity: 1,
    cullRadius: CONE_LENGTH + 8,
    hitRadius: DOT_RADIUS + 8,
    onHoverChange: (next) => {
      hovering = next;
    },
    // Click-to-observe: resolve the player's client connection id from
    // the roster and ask the server to orbit them — the same
    // serverCmdObserveClient a real observer uses. Dead players are
    // skipped (no player object to orbit server-side).
    onClick: () => {
      const entity = readEntity();
      const kf = getKeyframeAtTime(entity.keyframes ?? [], streamClock.time);
      if (kf?.damageState != null && kf.damageState >= 1) return;
      // Client-side follow: demo playback and live spectate both orbit
      // this player's ghost directly (no server round-trip), and it's
      // shared with the 3D view so exiting either reverts both.
      if (!isLive() || isWatchSpectator()) {
        enterWatchFollow(entity.id);
        return;
      }
      const entry = playerForEntity(entity);
      if (entry.clientId == null) return;
      liveConnectionStore
        .getState()
        .sendCommand("ObserveClient", String(entry.clientId));
    },
    draw: (ctx, x, y) => {
      const entity = readEntity();
      const { observerTeamColors, ccPlayerNames } = settingsStore.getState();
      const now = streamClock.time;
      const kf = getKeyframeAtTime(entity.keyframes ?? [], now);
      const dead = kf?.damageState != null && kf.damageState >= 1;

      if (dead) {
        if (wasDead === null) {
          // Already dead when first observed — no X, show nothing.
          wasDead = true;
        } else if (!wasDead) {
          // Witnessed alive → dead transition: start the X fade.
          wasDead = true;
          deathTime = now;
        } else if (deathTime != null && now < deathTime) {
          // Seeking backward across the death restarts the fade.
          deathTime = now;
        }
        const fade =
          deathTime != null ? 1 - (now - deathTime) / DEATH_FADE_SECONDS : 0;
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
      wasDead = false;
      deathTime = null;

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
      const e = probe.matrixWorld.elements;
      if (Math.hypot(e[0], e[2]) > 1e-4) heading = Math.atan2(e[2], e[0]);
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
        ccPlayerNames === "always" || (ccPlayerNames === "hover" && hovering);
      if (showName) {
        const text = playerForEntity(entity).name;
        if (text) {
          if (!nameBitmap || nameBitmap.text !== text)
            nameBitmap = { text, bitmap: makeNameBitmap(text) };
          const { bitmap } = nameBitmap;
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
  registerOverlayLabel(item);

  return combineCleanups(
    () => {
      unregisterOverlayLabel(item);
      parent.remove(probe);
    },
    reaction(
      gameEntityStore,
      (state) => state.dataSource === "live",
      (live) => {
        item.cursor = live ? "pointer" : undefined;
      },
    ),
  );
}
