import {
  AxesHelper,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
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
import { demoDirectorStore } from "../state/demoDirectorStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { interiorColliderCount } from "../collision/worldCollision";
import { WorldLabel } from "./worldLabel";
import { combineCleanups, reaction } from "./storeReaction";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";
import { torqueVecToThree } from "../scene/coordinates";

/** Axis labels use the same colors as the axes helper lines. The world
 *  axes are Torque's: Three +X = Torque Y, +Y = Z, +Z = X. */
const AXIS_Y_COLOR = "rgb(153, 255, 0)";
const AXIS_Z_COLOR = "rgb(0, 153, 255)";
const AXIS_X_COLOR = "rgb(255, 153, 0)";

/** Cell states, as `freeSpace.ts` records them. */
const ROOMY = 1;
const ROOMY_COLOR = [0.2, 1, 0.4];
const TIGHT_COLOR = [1, 0.6, 0.1];
const ANCHOR_COLOR = "#3399ff";
/** Grid chunks examined per frame when building for the overlay. */
const DEBUG_BUILD_CHUNKS = 48;

/** The world axes, with their Torque names. */
function startAxes(parent: Group): () => void {
  const axes = new AxesHelper(70);
  axes.material = new LineBasicMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,
    vertexColors: true,
  });
  axes.setColors(AXIS_Y_COLOR, AXIS_Z_COLOR, AXIS_X_COLOR);
  axes.renderOrder = 999;
  parent.add(axes);
  const labels = [
    new WorldLabel(parent, "Y", {
      position: [80, 0, 0],
      opacity: 1,
      color: AXIS_Y_COLOR,
    }),
    new WorldLabel(parent, "Z", {
      position: [0, 80, 0],
      opacity: 1,
      color: AXIS_Z_COLOR,
    }),
    new WorldLabel(parent, "X", {
      position: [0, 0, 80],
      opacity: 1,
      color: AXIS_X_COLOR,
    }),
  ];
  return () => {
    for (const label of labels) label.dispose();
    parent.remove(axes);
    axes.dispose();
  };
}

/** The free-space grid's cells as colored points. */
function freeSpacePoints(grid: FreeSpaceGrid): Points {
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
  const points = new Points(
    geometry,
    new PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  points.renderOrder = 9998;
  points.frustumCulled = false;
  return points;
}

/** The grid's points and its anchors: blue dots labeled with their reason. */
function showFreeSpace(parent: Group, grid: FreeSpaceGrid): () => void {
  const group = new Group();
  const points = freeSpacePoints(grid);
  group.add(points);
  const anchorEdges = new EdgesGeometry(new SphereGeometry(1.5, 8, 6));
  const anchorMaterial = new LineBasicMaterial({
    color: ANCHOR_COLOR,
    depthTest: false,
    depthWrite: false,
    fog: false,
    transparent: true,
  });
  const labels: WorldLabel[] = [];
  for (const anchor of grid.anchors) {
    const marker = new Group();
    torqueVecToThree(anchor.pos, marker.position);
    const lines = new LineSegments(anchorEdges, anchorMaterial);
    lines.renderOrder = 9999;
    marker.add(lines);
    group.add(marker);
    labels.push(
      new WorldLabel(marker, anchor.label, {
        position: [0, 3, 0],
        color: ANCHOR_COLOR,
      }),
    );
  }
  parent.add(group);
  return () => {
    for (const label of labels) label.dispose();
    parent.remove(group);
    points.geometry.dispose();
    (points.material as PointsMaterial).dispose();
    anchorEdges.dispose();
    anchorMaterial.dispose();
  };
}

/**
 * The director's free-space grid, drawn as points: green where a camera
 * fits with room to spare, orange where it only just fits. Cells the build
 * found solid, or never examined, are not drawn. Each anchor the grid was
 * built around is a blue dot with its reason.
 *
 * The switcher publishes the grid it builds. A sidecar cast never builds
 * one in the browser, so this builds its own from the dataset once the
 * collision world is in — a few chunks per frame, and at the same moment
 * the director would have: when the world was complete.
 */
function startFreeSpace(engine: GameEngine, parent: Group): () => void {
  let grid: FreeSpaceGrid | null = latestFreeSpace();
  let build: FreeSpaceBuild | null = null;
  let hide: (() => void) | null = grid ? showFreeSpace(parent, grid) : null;
  const setGrid = (next: FreeSpaceGrid | null) => {
    if (next === grid) return;
    hide?.();
    grid = next;
    hide = next ? showFreeSpace(parent, next) : null;
  };
  return combineCleanups(
    () => hide?.(),
    subscribeFreeSpace(setGrid),
    engine.scheduler.add(FramePriority.PostCamera, () => {
      const { dataset } = demoDirectorStore.getState();
      if (grid || !dataset) return;
      if (!build) {
        if (interiorColliderCount() === 0) return;
        const nowSec = gridBuildSec(dataset);
        if (nowSec == null) return;
        build = createFreeSpaceBuild(dataset, nowSec);
        if (!build) return;
      }
      if (build.step(DEBUG_BUILD_CHUNKS)) setGrid(build.grid);
    }),
  );
}

/** Debug mode's world axes and free-space overlay. */
export function installDebugElements(engine: GameEngine): () => void {
  return engine.withHost(({ scene }) =>
    reaction(settingsStore, selectDebugMode, (debugMode) => {
      if (!debugMode) return;
      const group = new Group();
      scene.add(group);
      return combineCleanups(
        () => scene.remove(group),
        startAxes(group),
        startFreeSpace(engine, group),
      );
    }),
  );
}
