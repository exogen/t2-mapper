import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { textureToUrl } from "../loaders";
import { useSettings } from "./SettingsProvider";
import styles from "./PlayerHUD.module.css";

const COMPASS_URL = textureToUrl("gui/hud_new_compass");
const NSEW_URL = textureToUrl("gui/hud_new_NSEW");

/**
 * Standalone compass for map/explore mode, sharing the stream HUD's visuals
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

function MapCompassDial() {
  const nsewRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const direction = new Vector3();
    let lastDeg: number | null = null;
    let raf = requestAnimationFrame(function update() {
      raf = requestAnimationFrame(update);
      const camera = commandCircuitStore.getState().active
        ? cameraRegistry.ortho
        : cameraRegistry.perspective;
      const img = nsewRef.current;
      if (!camera || !img) return;
      direction.set(0, 0, -1).applyQuaternion(camera.quaternion);
      if (Math.hypot(direction.x, direction.z) < 1e-3) {
        // Looking straight down (e.g. command circuit), the forward vector
        // has no horizontal part; screen-up carries the heading instead
        // (screen-down when looking straight up).
        const sign = direction.y < 0 ? 1 : -1;
        direction.set(0, sign, 0).applyQuaternion(camera.quaternion);
      }
      const deg = (Math.atan2(direction.z, direction.x) * 180) / Math.PI;
      if (deg !== lastDeg) {
        lastDeg = deg;
        img.style.transform = `rotate(${-deg}deg)`;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={styles.PlayerHUD}>
      <div className={styles.Compass}>
        <img src={COMPASS_URL} alt="" className={styles.CompassRing} />
        <img
          ref={nsewRef}
          src={NSEW_URL}
          alt=""
          className={styles.CompassNSEW}
        />
      </div>
    </div>
  );
}
