import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
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
import type { GameEntity } from "../state/gameEntityTypes";
import styles from "./FlagMarker.module.css";

const FLAG_ICON_HEIGHT = 1.5;
const FLAG_ICON_URL = textureToUrl("commander/MiniIcons/com_flag_grey");

const _tmpVec = new Vector3();

/**
 * Floating flag icon above a flag entity, tinted by IFF color (green for
 * friendly, red for enemy — matching Tribes 2's sensor group color system).
 * Always visible regardless of distance.
 */
export function FlagMarker({ entity }: { entity: GameEntity }) {
  const { observerTeamColors } = useSettings();
  const markerRef = useRef<Group>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const camera = useThree((state) => state.camera);

  const lastColorRef = useRef("");
  const lastDistRef = useRef("");

  useFrame(() => {
    // Tint imperatively — affiliation fields are mutated in-place by
    // streaming playback. Teamed viewers get the friend/foe theme
    // constants (iffColor only classifies the side); observers tint by
    // the (carried) flag's team via the theme. Both DOM writes are
    // change-gated to avoid per-frame string allocation and style/layout
    // invalidation.
    if (iconRef.current) {
      let color: string | null = null;
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
      }
      if (color != null && color !== lastColorRef.current) {
        lastColorRef.current = color;
        iconRef.current.style.backgroundColor = color;
      }
    }
    // Update distance label.
    if (distRef.current && markerRef.current) {
      markerRef.current.getWorldPosition(_tmpVec);
      const distance = camera.position.distanceTo(_tmpVec).toFixed(1);
      if (distance !== lastDistRef.current) {
        lastDistRef.current = distance;
        distRef.current.textContent = distance;
      }
    }
  });

  const initialIff = "iffColor" in entity ? entity.iffColor : undefined;
  const initialColor = rgbString(
    initialIff
      ? resolveIffDisplay({ iffColor: initialIff }, false, observerTeamColors)
          .color
      : IFF_NEUTRAL.color,
  );

  return (
    <group ref={markerRef}>
      <Html
        position={[0, FLAG_ICON_HEIGHT, 0]}
        center
        style={{ pointerEvents: "none" }}
      >
        <div className={styles.Root}>
          <span ref={distRef} className={styles.Distance} />
          <div
            ref={iconRef}
            className={styles.Icon}
            style={
              {
                backgroundColor: initialColor,
                "--flag-icon-url": `url(${FLAG_ICON_URL})`,
              } as React.CSSProperties
            }
          />
        </div>
      </Html>
    </group>
  );
}
