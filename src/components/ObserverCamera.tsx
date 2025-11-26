import { PerspectiveCamera } from "@react-three/drei";
import { useSettings } from "./SettingsProvider";

export function ObserverCamera() {
  const { fov } = useSettings();

  return <PerspectiveCamera makeDefault position={[0, 256, 0]} fov={fov} />;
}
