import { InstancedMesh, Mesh, SkinnedMesh, type Material } from "three";

/**
 * Imperative per-frame channel from the command circuit rig (which owns
 * the tour clock) to the tour visuals: the flash highlight applies
 * `opacity`, and the callout watches `idleTime` to expire itself after
 * the flash ends.
 */
export const tourFlash = {
  opacity: 0,
  /**
   * Seconds since the current target's flash window ended; 0 while the
   * flash is still running (or no tour is active).
   */
  idleTime: 0,
};

/** A silhouette parented to its source, sharing geometry and animation state. */
export function createTourHighlightMesh(
  source: Mesh,
  material: Material,
): Mesh {
  let highlight: Mesh;
  if (source instanceof SkinnedMesh) {
    const skin = new SkinnedMesh(source.geometry, material);
    skin.bindMode = source.bindMode;
    skin.bindMatrix.copy(source.bindMatrix);
    skin.bindMatrixInverse.copy(source.bindMatrixInverse);
    skin.skeleton = source.skeleton;
    highlight = skin;
  } else if (source instanceof InstancedMesh) {
    highlight = new InstancedTourHighlight(source, material);
  } else {
    highlight = new Mesh(source.geometry, material);
  }
  highlight.morphTargetInfluences = source.morphTargetInfluences;
  highlight.morphTargetDictionary = source.morphTargetDictionary;
  highlight.frustumCulled = false;
  highlight.raycast = () => {};
  return highlight;
}

/** Instance buffers belong to the overlay so disposing it cannot release the
 * source mesh's GPU buffers. Copy only when the source instances change. */
class InstancedTourHighlight extends InstancedMesh {
  private source: InstancedMesh;
  private sourceMatrix: InstancedMesh["instanceMatrix"];
  private sourceVersion: number;

  constructor(source: InstancedMesh, material: Material) {
    super(source.geometry, material, 0);
    this.source = source;
    this.sourceMatrix = source.instanceMatrix;
    this.sourceVersion = source.instanceMatrix.version;
    this.instanceMatrix.copy(source.instanceMatrix);
    this.count = source.count;
    this.morphTexture = source.morphTexture;
  }

  private syncInstances(): void {
    const source = this.source;
    if (
      this.sourceMatrix !== source.instanceMatrix ||
      this.sourceVersion !== source.instanceMatrix.version
    ) {
      if (
        this.instanceMatrix.array.length !== source.instanceMatrix.array.length
      ) {
        this.dispose();
        this.instanceMatrix.copy(source.instanceMatrix);
      } else {
        this.instanceMatrix.array.set(source.instanceMatrix.array);
        this.instanceMatrix.needsUpdate = true;
      }
      this.sourceMatrix = source.instanceMatrix;
      this.sourceVersion = source.instanceMatrix.version;
      this.boundingBox = null;
      this.boundingSphere = null;
    }
    if (this.geometry !== source.geometry || this.count !== source.count) {
      this.boundingBox = null;
      this.boundingSphere = null;
    }
    this.geometry = source.geometry;
    this.count = source.count;
    this.morphTexture = source.morphTexture;
  }

  override updateMatrixWorld(force?: boolean): void {
    this.syncInstances();
    super.updateMatrixWorld(force);
  }

  override updateWorldMatrix(
    parents: boolean,
    children: boolean,
    force = false,
  ): void {
    this.syncInstances();
    super.updateWorldMatrix(parents, children, force);
  }

  override dispose(): void {
    // The morph texture is borrowed; only the instance buffer is ours.
    this.morphTexture = null;
    super.dispose();
  }
}

export function removeTourHighlightMeshes(meshes: Mesh[]): void {
  for (const mesh of meshes) {
    mesh.removeFromParent();
    mesh.dispose();
  }
  meshes.length = 0;
}
