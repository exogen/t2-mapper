import { Stats } from "@react-three/drei";
import { useSettings } from "./SettingsProvider";

export function DebugElements() {
  const { debugMode } = useSettings();

  return debugMode ? (
    <>
      <Stats className="StatsPanel" />
    </>
  ) : null;
}
