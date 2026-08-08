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
      fov={fov}
    />
  );
}
