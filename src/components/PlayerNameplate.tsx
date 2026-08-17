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
    if (!isVisible) return;

    // Hide nameplate when player is dead.
    const kf = getKeyframeAtTime(keyframes, streamClock.time);
    const health = kf?.health ?? 1;
    if (kf?.damageState != null && kf.damageState >= 1) {
      if (iffContainerRef.current) iffContainerRef.current.style.opacity = "0";
      if (nameContainerRef.current)
        nameContainerRef.current.style.opacity = "0";
      return;
    }

    // Apply shared fade opacity to both containers.
    const opacity = opacityRef.current;
    if (iffContainerRef.current) {
      iffContainerRef.current.style.opacity = opacity;
    }
    if (nameContainerRef.current) {
      nameContainerRef.current.style.opacity = opacity;
    }

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
      arrowStyle.backgroundColor = rgbString(display.color);
    }

    // Update health bar fill with the resolved theme color (friend/foe
    // constants for teamed viewers, team color for observers).
    if (fillRef.current && hasHealthData) {
      fillRef.current.style.width = `${Math.max(0, Math.min(100, health * 100))}%`;
      fillRef.current.style.background = rgbString(display.color);
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
