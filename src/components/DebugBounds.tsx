import { useMemo } from "react";
import { BoxGeometry, SphereGeometry } from "three";
import { useDebug } from "./SettingsProvider";

const debugMaterial = (
  <lineBasicMaterial
    color="#ff0000"
    depthTest={false}
    depthWrite={false}
    fog={false}
    transparent
  />
);

/** Red wireframe bounding box for debug tour visualization. */
export function DebugBounds({ size }: { size: [number, number, number] }) {
  const { canShowDebugVisuals } = useDebug();
  const geometry = useMemo(
    () =>
      canShowDebugVisuals ? new BoxGeometry(size[0], size[1], size[2]) : null,
    [canShowDebugVisuals, size[0], size[1], size[2]], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!geometry) return null;
  return (
    <lineSegments renderOrder={9999}>
      <edgesGeometry args={[geometry]} />
      {debugMaterial}
    </lineSegments>
  );
}

/** Red wireframe sphere for point entities without geometry. */
export function DebugMarker({ radius = 1 }: { radius?: number }) {
  const { canShowDebugVisuals } = useDebug();
  const geometry = useMemo(
    () => (canShowDebugVisuals ? new SphereGeometry(radius, 8, 6) : null),
    [canShowDebugVisuals, radius],
  );
  if (!geometry) return null;
  return (
    <lineSegments renderOrder={9999}>
      <edgesGeometry args={[geometry]} />
      {debugMaterial}
    </lineSegments>
  );
}
