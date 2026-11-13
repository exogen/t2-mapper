import type { Object3D } from "three";
import { DTSShape } from "../dts/dtsModel";
import { getMountNode } from "../sceneNodes";
import { attachFrozen } from "./staticMatrices";

/**
 * Objects attached to a shape's mount nodes (mounted images, players in
 * seats). Attachments outlive the shape's model: a rebuilt model (an armor
 * change swaps the player shape; Tribes2.exe keeps every mounted image
 * across onNewDataBlock) re-parents them onto its own nodes, and nothing
 * is attached while no model is loaded.
 */
export class MountPoints {
  private scene: Object3D | null = null;
  private readonly attached = new Map<Object3D, number>();

  /** The model whose mount nodes hold the attachments, or none. */
  setScene(scene: Object3D | null): void {
    this.scene = scene;
    for (const [object, point] of this.attached) this.place(object, point);
  }

  attach(point: number, object: Object3D): () => void {
    this.attached.set(object, point);
    this.place(object, point);
    return () => {
      this.attached.delete(object);
      object.removeFromParent();
    };
  }

  private place(object: Object3D, point: number): void {
    if (!this.scene) {
      object.removeFromParent();
      return;
    }
    attachFrozen(getMountNode(this.scene, point), object);
    if (this.scene instanceof DTSShape) this.scene.keepMountCurrent(object);
  }
}
