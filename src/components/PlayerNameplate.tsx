import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Box3 } from "three";
import { getKeyframeAtTime } from "../stream/playbackUtils";
import { textureToUrl } from "../loaders";
import { useStaticShape } from "./GenericShape";
import { useFloatingLabelFade } from "./FloatingLabel";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
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
  const { groupRef, isVisible, opacityRef } = useFloatingLabelFade({
    fadeDistance: NAMEPLATE_FADE_DISTANCE,
  });
  const iffContainerRef = useRef<HTMLDivElement>(null);
  const nameContainerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const iffImgRef = useRef<HTMLImageElement>(null);
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
    const kf = getKeyframeAtTime(
      keyframes,
      streamPlaybackStore.getState().time,
    );
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

    // Update IFF arrow image imperatively — entity.iffColor is mutated in-place
    // by streaming playback without triggering re-renders.
    if (iffImgRef.current && entity.iffColor) {
      const url =
        entity.iffColor.r > entity.iffColor.g
          ? IFF_ENEMY_URL
          : IFF_FRIENDLY_URL;
      if (iffImgRef.current.getAttribute("src") !== url) {
        iffImgRef.current.src = url;
      }
    }

    // Update health bar fill.
    if (fillRef.current && hasHealthData) {
      fillRef.current.style.width = `${Math.max(0, Math.min(100, health * 100))}%`;
      fillRef.current.style.background = entity.iffColor
        ? `rgb(${entity.iffColor.r}, ${entity.iffColor.g}, ${entity.iffColor.b})`
        : "";
    }
  });

  const iffMarkerUrl =
    entity.iffColor && entity.iffColor.r > entity.iffColor.g
      ? IFF_ENEMY_URL
      : IFF_FRIENDLY_URL;

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
              <img
                ref={iffImgRef}
                className={styles.IffArrow}
                src={iffMarkerUrl}
                alt=""
              />
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
