import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import type { GameEngine } from "../engine/gameEngine";
import { sampleMissileLockView } from "../engine/missileLockView";
import { textureToUrl } from "../loaders";
import styles from "./PlayerHUD.module.css";

const trackingMarker = textureToUrl("gui/ret_missile_marker");
const lockedMarker = textureToUrl("gui/ret_missile_marker_red");
const horizontalFlash = textureToUrl("gui/ret_missile_horizflash_red");
const verticalFlash = textureToUrl("gui/ret_missile_vertflash_red");

export function MissileLockMarker({ engine }: { engine: GameEngine }) {
  const markerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const marker = markerRef.current!;
    const point = new Vector3();
    marker.hidden = true;
    engine.invalidate();
    return engine.onFrameEnd(() => {
      const lock = sampleMissileLockView(engine)?.outgoing;
      const camera = engine.cameras.active;
      if (!lock || camera !== engine.cameras.perspective) {
        marker.hidden = true;
        return;
      }
      if (lock.kind === "targeting") {
        if (marker.dataset.kind !== lock.kind) {
          marker.style.removeProperty("--reticle-x");
          marker.style.removeProperty("--reticle-y");
        }
      } else {
        if (!lock.position) {
          marker.hidden = true;
          return;
        }
        point.fromArray(lock.position).project(camera);
        // As in HudNavDisplay, clip in depth and let the viewport crop the sprite.
        if (!(point.z >= -1 && point.z <= 1)) {
          marker.hidden = true;
          return;
        }
        marker.style.setProperty("--reticle-x", `${50 + point.x * 50}%`);
        marker.style.setProperty("--reticle-y", `${50 - point.y * 50}%`);
      }
      if (marker.dataset.kind !== lock.kind) marker.dataset.kind = lock.kind;
      marker.hidden = false;
    });
  }, [engine]);

  return (
    <div className={styles.MissileLockLayer} aria-hidden>
      <div className={styles.MissileLockMarker} ref={markerRef} hidden>
        <img className={styles.TrackingMarker} alt="" src={trackingMarker} />
        <img alt="" src={lockedMarker} />
        <img className={styles.HorizontalFlash} alt="" src={horizontalFlash} />
        <img className={styles.VerticalFlash} alt="" src={verticalFlash} />
      </div>
    </div>
  );
}
