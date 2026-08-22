import { useEffect, useRef, type RefObject } from "react";
import { Vector3 } from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { useSettings } from "./SettingsProvider";
import { CompassDial, rotorTransform } from "./CompassDial";
import dialStyles from "./CompassDial.module.css";
import styles from "./PlayerHUD.module.css";

/**
 * Standalone compass for map/explore mode, sharing the stream HUD's dial
 * but deriving the heading from the active camera instead of a stream
 * snapshot. Three +X is Torque north and +Z is east, so the heading is
 * atan2(z, x) of the camera's forward direction (positive = clockwise, like
 * Torque yaw). Updates imperatively on an animation frame loop since camera
 * movement doesn't re-render React.
 */
export function MapCompass() {
  const { showCompass } = useSettings();
  return showCompass ? <MapCompassDial /> : null;
}

/**
 * Drive a compass rotor from the active render camera's heading on an
 * animation-frame loop. Shared by map mode and watch mode (where the
 * camera is client-controlled, so stream snapshots don't know the view
 * direction). No-op on frames where the rotor ref is unattached.
 */
export function useCameraHeadingRotor(
  rotorRef: RefObject<SVGGElement | null>,
  degreesRef?: RefObject<HTMLSpanElement | null>,
) {
  useEffect(() => {
    const direction = new Vector3();
    let raf = requestAnimationFrame(function update() {
      raf = requestAnimationFrame(update);
      const camera = commandCircuitStore.getState().active
        ? cameraRegistry.ortho
        : cameraRegistry.perspective;
      const rotor = rotorRef.current;
      if (!camera || !rotor) return;
      direction.set(0, 0, -1).applyQuaternion(camera.quaternion);
      if (Math.hypot(direction.x, direction.z) < 1e-3) {
        // Looking straight down (e.g. command circuit), the forward vector
        // has no horizontal part; screen-up carries the heading instead
        // (screen-down when looking straight up).
        const sign = direction.y < 0 ? 1 : -1;
        direction.set(0, sign, 0).applyQuaternion(camera.quaternion);
      }
      const deg = (Math.atan2(direction.z, direction.x) * 180) / Math.PI;
      // Write every frame rather than gating on a change: the rotor <g>
      // renders with no transform (identity = North-up), and React can
      // recreate that node — e.g. when command circuit toggles and this
      // subtree re-renders — independently of this loop. A change-gate
      // would leave the freshly-recreated node stuck at North-up until
      // the heading next changed (the camera moved); an unconditional
      // write keeps the DOM authoritative across those re-mounts.
      rotor.setAttribute("transform", rotorTransform(deg));
      const heading = Math.round(((deg % 360) + 360) % 360) % 360;
      const degrees = degreesRef?.current;
      const text = `${heading}°`;
      if (degrees && degrees.textContent !== text) degrees.textContent = text;
    });
    return () => cancelAnimationFrame(raf);
  }, [rotorRef, degreesRef]);
}

function MapCompassDial() {
  const rotorRef = useRef<SVGGElement>(null);
  const degreesRef = useRef<HTMLSpanElement>(null);
  useCameraHeadingRotor(rotorRef, degreesRef);

  return (
    <div className={styles.PlayerHUD}>
      <div className={styles.Compass}>
        <CompassDial rotorRef={rotorRef}>
          <span ref={degreesRef} className={dialStyles.Degrees} />
        </CompassDial>
      </div>
    </div>
  );
}
