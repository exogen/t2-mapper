import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
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
import type { PlayerEntity } from "../state/gameEntityTypes";
import styles from "./PlayerNameplate.module.css";

/** Max distance at which nameplates are visible. */
const NAMEPLATE_FADE_DISTANCE = 150;

/** Padding above the shape's bounding box top for the IFF arrow. */
const IFF_PADDING = 0.1;

/** Height for the name + health label (slightly below the player's feet). */
const NAME_HEIGHT = -0.2;

const IFF_FRIENDLY_URL = textureToUrl("gui/hud_alliedtriangle");
const IFF_ENEMY_URL = textureToUrl("gui/hud_enemytriangle");

const EMPTY_KEYFRAMES: never[] = [];

/**
 * Floating nameplate above a player model showing the entity name and a health
 * bar. Fades out with distance.
 */
export function PlayerNameplate({ entity }: { entity: PlayerEntity }) {
  const gltf = useStaticShape(entity.shapeName!);
  const { observerTeamColors } = useSettings();
  const { groupRef, isVisible, opacityRef } = useFloatingLabelFade({
    fadeDistance: NAMEPLATE_FADE_DISTANCE,
  });
  const iffContainerRef = useRef<HTMLDivElement>(null);
  const nameContainerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const iffArrowRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  // Last values written to the DOM, so the per-frame loop only touches
  // styles that actually changed (style writes force recalc, and this runs
  // for every player every frame). `colorStr` also memoizes rgbString() so
  // it isn't re-allocated each frame from the same unchanged color.
  const styleCacheRef = useRef({
    opacity: "",
    r: -1,
    g: -1,
    b: -1,
    colorStr: "",
    fillWidth: "",
  });
  // The overlays unmount when the player leaves view and remount fresh
  // (default styles) when it returns; track that so the cache is invalidated
  // and every guarded style gets re-applied to the new DOM.
  const wasVisibleRef = useRef(false);

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
      wasVisibleRef.current = false;
      return;
    }

    const cache = styleCacheRef.current;
    if (!wasVisibleRef.current) {
      // Fresh (re)mount — invalidate the write cache so every guarded style
      // below is applied to the new DOM elements' default styles.
      wasVisibleRef.current = true;
      cache.opacity = "";
      cache.r = cache.g = cache.b = -1;
      cache.colorStr = "";
      cache.fillWidth = "";
    }
    // Hide nameplate when the player is dead; otherwise apply the shared
    // fade opacity. Write both containers only when the value changed.
    const kf = getKeyframeAtTime(keyframes, streamClock.time);
    const health = kf?.health ?? 1;
    const dead = kf?.damageState != null && kf.damageState >= 1;
    const opacity = dead ? "0" : opacityRef.current;
    if (cache.opacity !== opacity) {
      cache.opacity = opacity;
      if (iffContainerRef.current)
        iffContainerRef.current.style.opacity = opacity;
      if (nameContainerRef.current)
        nameContainerRef.current.style.opacity = opacity;
    }
    if (dead) return;

    // Update player name imperatively — entity.playerName is mutated in-place
    // by streaming playback without triggering re-renders.
    if (nameRef.current) {
      const name = entity.playerName ?? entity.id;
      if (nameRef.current.textContent !== name) {
        nameRef.current.textContent = name;
      }
    }

    // Update IFF arrow imperatively — affiliation fields are mutated
    // in-place by streaming playback without triggering re-renders. The
    // arrow is the triangle texture as an alpha mask over a theme color:
    // teamed viewers keep the texture-authentic friend/foe look (enemy
    // shape + red vs allied shape + green); observers get team colors on
    // the allied shape.
    const observer = isObserverView();
    const display = resolveIffDisplay(entity, observer, observerTeamColors);

    // Re-stringify the color only when it changed (by value, so a fresh
    // object with the same rgb doesn't re-allocate). Both the arrow and the
    // health fill share this string, so a stable color means no writes.
    const color = display.color;
    let colorChanged = false;
    if (cache.r !== color.r || cache.g !== color.g || cache.b !== color.b) {
      cache.r = color.r;
      cache.g = color.g;
      cache.b = color.b;
      cache.colorStr = rgbString(color);
      colorChanged = true;
    }

    if (iffArrowRef.current) {
      const maskUrl =
        !observer && display === IFF_ENEMY
          ? `url(${IFF_ENEMY_URL})`
          : `url(${IFF_FRIENDLY_URL})`;
      const arrowStyle = iffArrowRef.current.style;
      if (arrowStyle.maskImage !== maskUrl) {
        arrowStyle.maskImage = maskUrl;
        arrowStyle.webkitMaskImage = maskUrl;
      }
      if (colorChanged) arrowStyle.backgroundColor = cache.colorStr;
    }

    // Update health bar fill with the resolved theme color (friend/foe
    // constants for teamed viewers, team color for observers).
    if (fillRef.current && hasHealthData) {
      const width = `${Math.max(0, Math.min(100, health * 100))}%`;
      if (cache.fillWidth !== width) {
        cache.fillWidth = width;
        fillRef.current.style.width = width;
      }
      if (colorChanged) fillRef.current.style.background = cache.colorStr;
    }
  });

  return (
    <group ref={groupRef}>
      {isVisible && (
        <>
          <Html
            position={[0, iffHeight, 0]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div ref={iffContainerRef} className={styles.Top}>
              <div ref={iffArrowRef} className={styles.IffArrow} />
            </div>
          </Html>
          <Html
            position={[0, NAME_HEIGHT, 0]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div ref={nameContainerRef} className={styles.Bottom}>
              <div ref={nameRef} className={styles.Name}>
                {entity.playerName ?? entity.id}
              </div>
              {hasHealthData && (
                <div className={styles.HealthBar}>
                  <div ref={fillRef} className={styles.HealthFill} />
                </div>
              )}
            </div>
          </Html>
        </>
      )}
    </group>
  );
}
