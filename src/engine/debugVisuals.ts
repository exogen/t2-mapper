import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
} from "three";
import { cameraTourStore, isDebugTourTarget } from "../state/cameraTourStore";
import { settingsStore } from "../state/settingsStore";
import { combineCleanups } from "./storeReaction";

const debugMaterial = new LineBasicMaterial({
  color: "#ff0000",
  depthTest: false,
  depthWrite: false,
  fog: false,
  transparent: true,
});

function wireframe(geometry: BufferGeometry): LineSegments {
  const edges = new EdgesGeometry(geometry);
  geometry.dispose();
  const lines = new LineSegments(edges, debugMaterial);
  lines.renderOrder = 9999;
  return lines;
}

/** Red wireframe sphere for point entities without geometry. */
export function createDebugMarker(radius = 1): LineSegments {
  return wireframe(new SphereGeometry(radius, 8, 6));
}

/** Red wireframe bounding box for debug tour visualization. */
export function createDebugBounds([x, y, z]: readonly [
  number,
  number,
  number,
]): LineSegments {
  return wireframe(new BoxGeometry(x, y, z));
}

/**
 * Show a debug visual under `parent` while a debug tour targets the
 * entity and the mode allows debug visuals.
 */
export function showWhileDebugTourTarget(
  parent: Object3D,
  entityId: string,
  create: () => LineSegments,
): () => void {
  let lines: LineSegments | null = null;
  const hide = () => {
    if (!lines) return;
    parent.remove(lines);
    lines.geometry.dispose();
    lines = null;
  };
  const update = () => {
    const visible =
      isDebugTourTarget(cameraTourStore.getState(), entityId) &&
      settingsStore.getState().access.canShowDebugVisuals;
    if (!visible) hide();
    else if (!lines) parent.add((lines = create()));
  };
  update();
  return combineCleanups(
    hide,
    cameraTourStore.subscribe(update),
    settingsStore.subscribe(update),
  );
}
