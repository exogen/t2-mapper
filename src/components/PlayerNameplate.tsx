import { useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Box3, Object3D, Vector3 } from "three";
import { getKeyframeAtTime } from "../demo/demoPlaybackUtils";
import { textureToUrl } from "../loaders";
import { useStaticShape } from "./GenericShape";
import type { DemoEntity } from "../demo/types";
import styles from "./PlayerNameplate.module.css";

/** Max distance at which nameplates are visible. */
const NAMEPLATE_FADE_DISTANCE = 150;

/** Padding above the shape's bounding box top for the IFF arrow. */
const IFF_PADDING = 0.1;

/** Height for the name + health label (slightly below the player's feet). */
const NAME_HEIGHT = -0.2;

const IFF_FRIENDLY_URL = textureToUrl("gui/hud_alliedtriangle");
const IFF_ENEMY_URL = textureToUrl("gui/hud_enemytriangle");

const _tmpVec = new Vector3();

/**
 * Floating nameplate above a player model showing the entity name and a health
 * bar. Fades out with distance.
 */
export function PlayerNameplate({
  entity,
  timeRef,
}: {
  entity: DemoEntity;
  timeRef: MutableRefObject<number>;
}) {
  const gltf = useStaticShape(entity.dataBlock!);
  const { camera } = useThree();
  const groupRef = useRef<Object3D>(null);
  const iffContainerRef = useRef<HTMLDivElement>(null);
  const nameContainerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const iffImgRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  const displayName = useMemo(() => {
    if (entity.playerName) return entity.playerName;
    if (typeof entity.id === "string") {
      return entity.id.replace(/^player_/, "Player ");
    }
    return `Player ${entity.id}`;
  }, [entity.id, entity.playerName]);

  // Derive IFF height from the shape's bounding box.
  const iffHeight = useMemo(() => {
    const box = new Box3().setFromObject(gltf.scene);
    return box.max.y + IFF_PADDING;
  }, [gltf.scene]);

  // Check whether this entity has any health data at all.
  const hasHealthData = useMemo(
    () => entity.keyframes.some((kf) => kf.health != null),
    [entity.keyframes],
  );

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    // Compute world-space distance to camera.
    group.getWorldPosition(_tmpVec);
    const distance = camera.position.distanceTo(_tmpVec);

    // Check if behind camera using dot product with camera forward (-Z column).
    const e = camera.matrixWorld.elements;
    const behind =
      (_tmpVec.x - e[12]) * -e[8] +
        (_tmpVec.y - e[13]) * -e[9] +
        (_tmpVec.z - e[14]) * -e[10] <
      0;
    const shouldBeVisible = !behind && distance < NAMEPLATE_FADE_DISTANCE;

    if (isVisible !== shouldBeVisible) {
      setIsVisible(shouldBeVisible);
    }

    if (!shouldBeVisible) return;

    // Hide nameplate when player is dead.
    const kf = getKeyframeAtTime(entity.keyframes, timeRef.current);
    const health = kf?.health ?? 1;
    if (kf?.damageState != null && kf.damageState >= 1) {
      if (iffContainerRef.current) iffContainerRef.current.style.opacity = "0";
      if (nameContainerRef.current)
        nameContainerRef.current.style.opacity = "0";
      return;
    }

    // Update opacity on both label containers.
    const opacity = Math.max(
      0,
      Math.min(1, 1 - distance / NAMEPLATE_FADE_DISTANCE),
    );
    const opacityStr = opacity.toString();
    if (iffContainerRef.current) {
      iffContainerRef.current.style.opacity = opacityStr;
    }
    if (nameContainerRef.current) {
      nameContainerRef.current.style.opacity = opacityStr;
    }

    // Update IFF arrow image imperatively — entity.iffColor is mutated in-place
    // by streaming playback without triggering re-renders.
    if (iffImgRef.current && entity.iffColor) {
      const url =
        entity.iffColor.r > entity.iffColor.g
          ? IFF_ENEMY_URL
          : IFF_FRIENDLY_URL;
      if (iffImgRef.current.src !== url) {
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
          <Html position={[0, iffHeight, 0]} center>
            <div ref={iffContainerRef} className={styles.Top}>
              <img
                ref={iffImgRef}
                className={styles.IffArrow}
                src={iffMarkerUrl}
                alt=""
              />
            </div>
          </Html>
          <Html position={[0, NAME_HEIGHT, 0]} center>
            <div ref={nameContainerRef} className={styles.Bottom}>
              <div className={styles.Name}>{displayName}</div>
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
