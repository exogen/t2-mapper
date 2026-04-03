import { useMemo } from "react";
import { BoxGeometry, EdgesGeometry, SphereGeometry } from "three";

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
  const edges = useMemo(
    () => new EdgesGeometry(new BoxGeometry(size[0], size[1], size[2])),
    [size[0], size[1], size[2]], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <lineSegments geometry={edges} renderOrder={9999}>
      {debugMaterial}
    </lineSegments>
  );
}

/** Red wireframe sphere for point entities without geometry. */
export function DebugMarker({ radius = 1 }: { radius?: number }) {
  const edges = useMemo(
    () => new EdgesGeometry(new SphereGeometry(radius, 8, 6)),
    [radius],
  );
  return (
    <lineSegments geometry={edges} renderOrder={9999}>
      {debugMaterial}
    </lineSegments>
  );
}
