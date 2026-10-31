import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from "three";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { reaction } from "./storeReaction";
import { WorldLabel } from "./worldLabel";

/** Wireframe box shown while a model loads, or (debug) after it failed. */
export function createPlaceholder(color: string): Mesh {
  return new Mesh(
    new BoxGeometry(10, 10, 10),
    new MeshStandardMaterial({ color, wireframe: true }),
  );
}

/** Remove a mesh that owns its geometry and material, freeing both. */
export function disposeMesh(mesh: Mesh): void {
  mesh.removeFromParent();
  mesh.geometry.dispose();
  (mesh.material as Material).dispose();
}

/** A placeholder with an id label, shown only in debug mode. */
export function showDebugPlaceholder(
  parent: Object3D,
  color: string,
  label: string,
): () => void {
  return reaction(settingsStore, selectDebugMode, (debugMode) => {
    if (!debugMode) return;
    const mesh = createPlaceholder(color);
    parent.add(mesh);
    const worldLabel = new WorldLabel(mesh, label, { color });
    return () => {
      worldLabel.dispose();
      disposeMesh(mesh);
    };
  });
}
