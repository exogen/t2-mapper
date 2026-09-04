import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  SphereGeometry,
} from "three";
import {
  cellCenter,
  createFreeSpaceBuild,
  gridBuildSec,
  type FreeSpaceBuild,
  type FreeSpaceGrid,
} from "../director/freeSpace";
import {
  latestFreeSpace,
  subscribeFreeSpace,
} from "../director/freeSpaceRegistry";
import { useDirector } from "../state/demoDirectorStore";
import { interiorColliderCount } from "../collision/worldCollision";
import { FloatingLabel } from "./FloatingLabel";

/** Cell states, as `freeSpace.ts` records them. */
const ROOMY = 1;
const ROOMY_COLOR = [0.2, 1, 0.4];
const TIGHT_COLOR = [1, 0.6, 0.1];
const ANCHOR_COLOR = "#3399ff";
/** Grid chunks examined per frame when building for the overlay. */
const DEBUG_BUILD_CHUNKS = 48;

/**
 * The director's free-space grid, drawn as points: green where a
 * camera fits with room to spare, orange where it only just fits.
 * Cells the build found solid, or never examined, are not drawn. Each
 * anchor the grid was built around is a blue dot with its reason.
 *
 * The switcher publishes the grid it builds. A sidecar cast never
 * builds one in the browser, so this builds its own from the dataset
 * once the collision world is in — a few chunks per frame, and at the
 * same moment the director would have: when the world was complete.
 */
export function DebugFreeSpace() {
  const [grid, setGrid] = useState<FreeSpaceGrid | null>(latestFreeSpace);
  useEffect(() => subscribeFreeSpace(setGrid), []);
  const dataset = useDirector((state) => state.dataset);
  const buildRef = useRef<FreeSpaceBuild | null>(null);
  useFrame(() => {
    if (grid || !dataset) return;
    if (!buildRef.current) {
      if (interiorColliderCount() === 0) return;
      const nowSec = gridBuildSec(dataset);
      if (nowSec == null) return;
      buildRef.current = createFreeSpaceBuild(dataset, nowSec);
      if (!buildRef.current) return;
    }
    if (buildRef.current.step(DEBUG_BUILD_CHUNKS)) {
      setGrid(buildRef.current.grid);
    }
  });

  const geometry = useMemo(() => {
    if (!grid) return null;
    let count = 0;
    for (let i = 0; i < grid.free.length; i++) if (grid.free[i]) count++;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let n = 0;
    for (let iz = 0; iz < grid.nz; iz++) {
      for (let iy = 0; iy < grid.ny; iy++) {
        for (let ix = 0; ix < grid.nx; ix++) {
          const state = grid.free[(iz * grid.ny + iy) * grid.nx + ix];
          if (!state) continue;
          const [tx, ty, tz] = cellCenter(grid, ix, iy, iz);
          const color = state === ROOMY ? ROOMY_COLOR : TIGHT_COLOR;
          // Torque (x, y, z) → Three (y, z, x).
          positions[n * 3] = ty;
          positions[n * 3 + 1] = tz;
          positions[n * 3 + 2] = tx;
          colors[n * 3] = color[0];
          colors[n * 3 + 1] = color[1];
          colors[n * 3 + 2] = color[2];
          n++;
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    return geometry;
  }, [grid]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const anchorEdges = useMemo(
    () => new EdgesGeometry(new SphereGeometry(1.5, 8, 6)),
    [],
  );
  useEffect(() => () => anchorEdges.dispose(), [anchorEdges]);

  if (!geometry || !grid) return null;
  return (
    <>
      <points geometry={geometry} renderOrder={9998} frustumCulled={false}>
        <pointsMaterial
          size={0.6}
          vertexColors
          transparent
          opacity={0.6}
          depthTest={false}
          depthWrite={false}
          fog={false}
        />
      </points>
      {grid.anchors.map((anchor, i) => {
        const [tx, ty, tz] = anchor.pos;
        return (
          <group key={i} position={[ty, tz, tx]}>
            <lineSegments geometry={anchorEdges} renderOrder={9999}>
              <lineBasicMaterial
                color={ANCHOR_COLOR}
                depthTest={false}
                depthWrite={false}
                fog={false}
                transparent
              />
            </lineSegments>
            <FloatingLabel position={[0, 3, 0]} color={ANCHOR_COLOR}>
              {anchor.label}
            </FloatingLabel>
          </group>
        );
      })}
    </>
  );
}
