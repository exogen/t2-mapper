import { Group, type Object3D } from "three";
import { createLogger } from "../logger";
import { getDTSImageMountTransform } from "../dts/dtsMount";
import { DTSShape, type DTSModel } from "../dts/dtsModel";
import { getMountNode } from "../sceneNodes";
import type { ImageSlot } from "../stream/types";
import { resolveEmapFromImageSlot } from "./resolveEmap";
import { resolveImageLight } from "./imageLight";
import { loadShape, peekShape } from "./shapeCache";
import { createShapeModel, type ShapeModel } from "./shapeModel";
import { attachFrozen } from "./staticMatrices";
import { markTransformChanged } from "../transformChanges";
import type { GameEngine } from "./gameEngine";

const log = createLogger("ShapeMounts");

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

/** What makes a mounted image a different model. */
function imageKey(image: ImageSlot): string {
  return `${image.dataBlockId}:${image.shapeName}:${image.skinName ?? ""}:${image.mountPoint}`;
}

/** One mounted image: its model, placed by its grip at the mount node. */
interface MountedImage {
  key: string;
  /** Holds the mount offset; the model goes in once it loads. */
  root: Group;
  mountOffset: ImageSlot["mountOffset"];
  model: ShapeModel | null;
  shape: DTSModel | null;
  detach(): void;
  dispose(): void;
}

/**
 * The 8 image slots of a shape or player, each slot's model at the mount
 * node its datablock's mountPoint selects (binary-verified), not the slot
 * index. Objects and images can share a mount point; each retains its own
 * state. Rebuilds an image only when its visual identity changes.
 */
export class ImageMounts {
  private readonly images: (MountedImage | undefined)[] = [];
  private slots: readonly (ImageSlot | undefined)[] | undefined;

  private readonly engine: GameEngine;
  private readonly mounts: MountPoints;
  private readonly ownerId: string;
  private readonly anisotropy: () => number;

  constructor(
    engine: GameEngine,
    mounts: MountPoints,
    ownerId: string,
    anisotropy: () => number,
  ) {
    this.engine = engine;
    this.mounts = mounts;
    this.ownerId = ownerId;
    this.anisotropy = anisotropy;
  }

  /** Each slot's image root, for the owner's fade and cloak. */
  roots(): Array<[slot: number, root: Group]> {
    const roots: Array<[number, Group]> = [];
    this.images.forEach((image, slot) => {
      if (image) roots.push([slot, image.root]);
    });
    return roots;
  }

  sync(slots: readonly (ImageSlot | undefined)[] | undefined): void {
    if (slots === this.slots) return;
    this.slots = slots;
    const count = Math.max(slots?.length ?? 0, this.images.length);
    for (let slot = 0; slot < count; slot++) {
      const image = slots?.[slot];
      const current = this.images[slot];
      const key = image?.shapeName ? imageKey(image) : null;
      if (current && current.key === key) {
        if (image && image.mountOffset !== current.mountOffset) {
          current.mountOffset = image.mountOffset;
          this.placeModel(current);
        }
        continue;
      }
      current?.dispose();
      this.images[slot] =
        image && key ? this.mount(slot, image, key) : undefined;
    }
  }

  dispose(): void {
    for (const image of this.images) image?.dispose();
    this.images.length = 0;
  }

  /** The child's grip point aligns to the parent's mount node. */
  private placeModel(mounted: MountedImage): void {
    if (!mounted.shape) return;
    mounted.root.matrix.copy(
      getDTSImageMountTransform(mounted.shape.data, mounted.mountOffset),
    );
    markTransformChanged(mounted.root, false);
  }

  private mount(slot: number, image: ImageSlot, key: string): MountedImage {
    const root = new Group();
    root.matrixAutoUpdate = false;
    root.userData.imageMount = true;
    let disposed = false;
    const mounted: MountedImage = {
      key,
      root,
      mountOffset: image.mountOffset,
      model: null,
      shape: null,
      detach: this.mounts.attach(image.mountPoint, root),
      dispose: () => {
        disposed = true;
        mounted.detach();
        mounted.model?.dispose();
        mounted.model = null;
      },
    };
    const build = (shape: DTSModel) => {
      const model = createShapeModel(this.engine, {
        model: shape,
        shapeName: image.shapeName!,
        type: "StaticShape",
        anisotropy: this.anisotropy(),
        emap: resolveEmapFromImageSlot(image.dataBlockId),
        entityId: this.ownerId,
        noRotation: true,
        skinName: image.skinName,
        imageLight: resolveImageLight(image.dataBlockId),
        imageSlot: slot,
      });
      mounted.model = model;
      mounted.shape = shape;
      attachFrozen(root, model.root);
      this.placeModel(mounted);
      this.engine.invalidate();
    };
    const loaded = peekShape(image.shapeName!);
    if (loaded && this.engine.currentHost) build(loaded);
    else
      void Promise.all([
        loadShape(image.shapeName!),
        this.engine.whenHost(),
      ]).then(
        ([shape]) => {
          if (!disposed) build(shape);
        },
        (error: unknown) =>
          log.error("Image shape error: %s: %o", image.shapeName, error),
      );
    return mounted;
  }
}
