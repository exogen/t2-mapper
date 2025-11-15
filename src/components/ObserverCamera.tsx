import { PerspectiveCamera } from "@react-three/drei";
import { useSettings } from "./SettingsProvider";

export function ObserverCamera() {
  const { fov } = useSettings();

  return (
    <PerspectiveCamera makeDefault position={[-512, 256, -512]} fov={fov} />
  );
}
