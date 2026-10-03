import { useEffect, useRef } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type PerspectiveCamera as ThreePerspectiveCamera } from "three";
import { useSettings } from "./SettingsProvider";
import { cameraRegistry } from "../state/cameraRegistry";
import { updateObserverCameraFov } from "./cameraFov";
import { FramePriority } from "./framePriority";

export function ObserverCamera() {
  const { fov } = useSettings();
  const cameraRef = useRef<ThreePerspectiveCamera>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    cameraRegistry.perspective = cameraRef.current;
    return () => {
      cameraRegistry.perspective = null;
    };
  }, []);

  // FOV is applied in the frame loop, so preference changes must wake
  // render-on-demand even though no Three.js prop changed.
  useEffect(() => invalidate(), [fov, invalidate]);

  useFrame(() => {
    if (cameraRef.current) updateObserverCameraFov(cameraRef.current, fov);
  }, FramePriority.CameraProjection);

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={[0, 256, 0]}
      // Face Torque north (world +X; three's default −Z forward is west)
      // so the compass reads N until a mission camera takes over.
      rotation={[0, -Math.PI / 2, 0]}
    />
  );
}
