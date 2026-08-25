import { useEffect, useRef } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import { type PerspectiveCamera as ThreePerspectiveCamera } from "three";
import { useSettings } from "./SettingsProvider";
import { cameraRegistry } from "../state/cameraRegistry";

export function ObserverCamera() {
  const { fov } = useSettings();
  const cameraRef = useRef<ThreePerspectiveCamera>(null);

  useEffect(() => {
    cameraRegistry.perspective = cameraRef.current;
    return () => {
      cameraRegistry.perspective = null;
    };
  }, []);

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={[0, 256, 0]}
      // Face Torque north (world +X; three's default −Z forward is west)
      // so the compass reads N until a mission camera takes over.
      rotation={[0, -Math.PI / 2, 0]}
      fov={fov}
    />
  );
}
