import { LOD, type Scene, type WebGLRenderer } from "three";
import type {
  RenderItem,
  WebGLRenderList,
} from "three/src/renderers/webgl/WebGLRenderLists.js";

/** Isolates the renderer integration from the draw/animation code. A final LOD
 * runs after Three has culled shapes, selected details and prepared geometry.
 * Pooled children then go through ordinary Three buffer uploads and rendering.
 * The list hook preserves the original sorting anchors for those children.
 * Keep the browser rendering regression tests when upgrading Three. */
export class DTSInstanceRenderList {
  readonly root = new LOD();
  readonly anchors = new Map<number, RenderItem>();
  private consumed = new Set<RenderItem>();
  private originals: RenderItem[] = [];
  private list?: WebGLRenderList;
  private originalSort?: WebGLRenderList["sort"];
  private wrappedSort?: WebGLRenderList["sort"];

  private renderer: WebGLRenderer;
  constructor(renderer: WebGLRenderer, flush: () => void) {
    this.renderer = renderer;
    this.root.name = "__dts_animated_instances";
    this.root.matrixAutoUpdate = this.root.matrixWorldAutoUpdate = false;
    this.root.layers.enableAll();
    this.root.update = flush;
  }

  prepare(scene: Scene) {
    this.restore();
    this.list = this.renderer.renderLists.get(scene, 0);
    const list = this.list;
    const sort = (this.originalSort = list.sort);
    this.wrappedSort = (opaqueSort, transparentSort, reversedDepth) => {
      // Arbitrary custom sort functions can inspect object/material identity.
      // Retain native draws in that case instead of assuming our anchors suffice.
      const fallback = !!opaqueSort || !!transparentSort || reversedDepth;
      for (const items of [list.opaque, list.transparent]) {
        let write = 0;
        for (const item of items) {
          const anchor = this.anchors.get(item.object.id);
          if (anchor) {
            if (fallback) continue;
            item.id = anchor.id;
            item.groupOrder = anchor.groupOrder;
            item.renderOrder = anchor.renderOrder;
            item.z = anchor.z;
          }
          items[write++] = item;
        }
        items.length = write;
      }
      if (fallback)
        for (const item of this.originals)
          (item.material.transparent ? list.transparent : list.opaque).push(
            item,
          );
      sort.call(list, opaqueSort, transparentSort, reversedDepth);
    };
    list.sort = this.wrappedSort;
    // React can append entities after the pool between frames.
    if (scene.children.at(-1) !== this.root) {
      this.root.removeFromParent();
      scene.add(this.root);
    }
  }

  get sorted(): WebGLRenderList {
    const list = this.list!;
    // Use the renderer's native comparator, including stable equal-depth order.
    this.originalSort!.call(list, undefined!, undefined!, false);
    return list;
  }

  replace(
    sources: readonly { item: RenderItem }[],
    draw: LOD["children"][number],
  ) {
    this.anchors.set(draw.id, { ...sources[0].item });
    for (const { item } of sources) {
      this.consumed.add(item);
      this.originals.push(item);
    }
  }

  finish() {
    for (const items of [this.list!.opaque, this.list!.transparent]) {
      let write = 0;
      for (const item of items)
        if (!this.consumed.has(item)) items[write++] = item;
      items.length = write;
    }
  }

  restore() {
    if (this.list && this.list.sort === this.wrappedSort)
      this.list.sort = this.originalSort!;
    this.anchors.clear();
    this.consumed.clear();
    this.originals.length = 0;
  }
}
