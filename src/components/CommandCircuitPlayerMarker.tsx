import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { FaSkullCrossbones } from "react-icons/fa";
import type { Group } from "three";
import { getKeyframeAtTime } from "../stream/playbackUtils";
import { streamClock } from "../state/streamPlaybackStore";
import { ScreenSpaceLabel } from "./ScreenSpaceLabel";
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
import type { PlayerEntity } from "../state/gameEntityTypes";

/** Marker box size in screen pixels (constant regardless of map zoom). */
const MARKER_SIZE = 88;
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

/**
 * Radar-style player indicator for the command circuit map: a solid dot
 * centered over the player with a view-direction cone that fades out with
 * distance, colored by IFF (green friendly / red enemy). On death the dot
 * and cone give way to a skull-and-crossbones over the body that fades
 * out over a few seconds. Positioning rides on `ScreenSpaceLabel`;
 * heading, color, and death state update imperatively every frame since
 * streaming mutates entities in place.
 */
export function CommandCircuitPlayerMarker({
  entity,
}: {
  entity: PlayerEntity;
}) {
  // Empty group probing the entity's world transform — it sits inside the
  // entity wrapper, so its matrixWorld carries the player's position and
  // rotation. Entity-local +X (Torque +Y) is the player's forward. It's
  // also the ScreenSpaceLabel target: with no meshes, the tracker anchors
  // to its world position, centering the dot exactly on the player origin
  // (mesh bounds would wander with animation and stray attachments).
  const { observerTeamColors, ccPlayerNames } = useSettings();
  const isLive = useDataSource() === "live";
  const [probe, setProbe] = useState<Group | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const liveRef = useRef<SVGGElement | null>(null);
  const crossRef = useRef<SVGGElement | null>(null);
  /** Whether the player was dead last frame; null until first observed.
   *  Players first seen already dead never get an X — only a death
   *  witnessed while the marker is mounted shows one. */
  const wasDeadRef = useRef<boolean | null>(null);
  const deathTimeRef = useRef<number | null>(null);
  const gradientId = `cc-player-cone-${entity.id}`;

  // Attach-only refs: the SVG renders inside ScreenSpaceLabel's separate
  // react-dom root, which is recreated per mount with the old root's
  // unmount deferred. That late unmount detaches the old tree AFTER the
  // new root has attached, and the null it writes into these shared ref
  // objects would clobber the live elements and freeze the marker.
  const setSvgRef = (el: SVGSVGElement | null) => {
    if (el) svgRef.current = el;
  };
  const setLiveRef = (el: SVGGElement | null) => {
    if (el) liveRef.current = el;
  };
  const setCrossRef = (el: SVGGElement | null) => {
    if (el) crossRef.current = el;
  };
  const nameRef = useRef<SVGTextElement | null>(null);
  const setNameRef = (el: SVGTextElement | null) => {
    if (el) nameRef.current = el;
  };
  const hoverRef = useRef(false);

  // Click-to-observe (live only): resolve the player's client connection
  // id from the roster and ask the server to orbit them — the same
  // serverCmdObserveClient a real observer uses. Dead players are
  // skipped (no player object to orbit server-side). From pan mode the
  // server switches its camera to orbit, and the confirmed follow state
  // flows back down so the view snaps to the clicked player.
  const handleClick = () => {
    const kf = getKeyframeAtTime(entity.keyframes ?? [], streamClock.time);
    if (kf?.damageState != null && kf.damageState >= 1) return;
    // Client-side follow: demo playback and live spectate both orbit this
    // player's ghost directly (no server round-trip), and it's shared with
    // the 3D view so exiting either reverts both.
    if (!isLive || isWatchSpectator()) {
      enterWatchFollow(entity.id);
      return;
    }
    // The targetId from MsgClientJoin is the exact join key to the player
    // entity; the name comparison is a fallback for servers/replays where
    // the join message predates our targetId tracking.
    const roster = streamSnapshotStore.getState().snapshot?.playerRoster;
    const entry =
      roster?.find(
        (p) => p.targetId != null && p.targetId === entity.targetId,
      ) ?? roster?.find((p) => p.name === entity.playerName);
    if (!entry) return;
    liveConnectionStore
      .getState()
      .sendCommand("ObserveClient", String(entry.clientId));
  };

  useFrame(() => {
    const svg = svgRef.current;
    const live = liveRef.current;
    const cross = crossRef.current;
    if (!svg || !live || !cross) return;

    // Entity affiliation fields are mutated in-place by streaming
    // playback, so re-resolve the theme color every frame: friend/foe for
    // teamed viewers, team colors for observers.
    const color = rgbString(
      resolveIffDisplay(entity, isObserverView(), observerTeamColors).mapColor,
    );
    if (svg.style.color !== color) {
      svg.style.color = color;
    }

    const now = streamClock.time;
    const kf = getKeyframeAtTime(entity.keyframes ?? [], now);
    const dead = kf?.damageState != null && kf.damageState >= 1;
    if (dead) {
      live.style.display = "none";
      if (wasDeadRef.current === null) {
        // Already dead when first observed — no X, show nothing.
        wasDeadRef.current = true;
      } else if (!wasDeadRef.current) {
        // Witnessed alive → dead transition: start the X fade.
        wasDeadRef.current = true;
        deathTimeRef.current = now;
      } else if (deathTimeRef.current != null && now < deathTimeRef.current) {
        // Seeking backward across the death restarts the fade.
        deathTimeRef.current = now;
      }
      const fade =
        deathTimeRef.current != null
          ? 1 - (now - deathTimeRef.current) / DEATH_FADE_SECONDS
          : 0;
      if (fade <= 0) {
        cross.style.display = "none";
      } else {
        cross.style.display = "";
        cross.style.opacity = fade.toFixed(3);
      }
      if (nameRef.current) nameRef.current.style.display = "none";
      return;
    }
    wasDeadRef.current = false;
    deathTimeRef.current = null;
    cross.style.display = "none";
    live.style.display = "";

    // Player name under the dot, per the preference. playerName is
    // mutated in place by streaming playback, so refresh every frame.
    const name = nameRef.current;
    if (name) {
      const showName =
        ccPlayerNames === "always" ||
        (ccPlayerNames === "hover" && hoverRef.current);
      name.style.display = showName ? "" : "none";
      if (showName) {
        const text = entity.playerName ?? "";
        if (name.textContent !== text) name.textContent = text;
      }
    }

    if (probe) {
      // First column of matrixWorld = world direction of local +X (the
      // player's forward). Screen-up is world +X (Torque north) and
      // screen-right is world +Z (east), so the clockwise-from-up screen
      // angle is atan2(z, x) — same convention as the compass heading.
      const e = probe.matrixWorld.elements;
      if (Math.hypot(e[0], e[2]) > 1e-4) {
        const deg = (Math.atan2(e[2], e[0]) * 180) / Math.PI;
        live.setAttribute("transform", `rotate(${deg.toFixed(1)})`);
      }
    }
  });

  return (
    <>
      <group ref={setProbe} />
      <ScreenSpaceLabel object={probe} anchor="center">
        <svg
          ref={setSvgRef}
          width={MARKER_SIZE}
          height={MARKER_SIZE}
          viewBox={`${-MARKER_SIZE / 2} ${-MARKER_SIZE / 2} ${MARKER_SIZE} ${MARKER_SIZE}`}
          style={{
            display: "block",
            color: FALLBACK_COLOR,
            overflow: "visible",
          }}
        >
          <defs>
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={-DOT_RADIUS}
              x2="0"
              y2={-CONE_LENGTH}
            >
              <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g ref={setLiveRef}>
            <path
              d={`M0 0 L${-CONE_HALF_WIDTH} ${-CONE_LENGTH} L${CONE_HALF_WIDTH} ${-CONE_LENGTH} Z`}
              fill={`url(#${gradientId})`}
            />
            <circle
              r={DOT_RADIUS}
              fill="currentColor"
              stroke="rgba(0, 0, 0, 0.4)"
              strokeWidth="1"
            />
            {/* Generous invisible hit target for hover names and (live)
                click-to-observe; the rest of the marker stays
                click-through for map panning. */}
            <circle
              r={DOT_RADIUS + 8}
              fill="transparent"
              style={{
                pointerEvents: "auto",
                cursor: isLive ? "pointer" : undefined,
              }}
              onClick={handleClick}
              onPointerEnter={() => {
                hoverRef.current = true;
              }}
              onPointerLeave={() => {
                hoverRef.current = false;
              }}
            />
          </g>
          <text
            ref={setNameRef}
            // Above the dot so the mouse cursor (whose hotspot sits at
            // its top) doesn't cover the name while hovering.
            y={-(DOT_RADIUS + 5)}
            textAnchor="middle"
            style={{
              display: "none",
              fontSize: "8px",
              fill: "rgba(255, 255, 255, 0.92)",
              paintOrder: "stroke",
              stroke: "rgba(0, 0, 0, 0.7)",
              strokeWidth: 2,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
          <g ref={setCrossRef} style={{ display: "none" }}>
            <FaSkullCrossbones
              x={-SKULL_SIZE / 2}
              y={-SKULL_SIZE / 2}
              size={SKULL_SIZE}
              style={{ color: SKULL_COLOR }}
            />
          </g>
        </svg>
      </ScreenSpaceLabel>
    </>
  );
}
