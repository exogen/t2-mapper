import {
  LOD,
  type Camera,
  type GeometryGroup,
  type Scene,
  type WebGLRenderer,
} from "three";
import type {
  RenderItem as ThreeRenderItem,
  WebGLRenderList,
} from "three/src/renderers/webgl/WebGLRenderLists.js";

// @types/three 0.186 uses scene Group instead of GeometryGroup and still
// describes the r185 push/sort signatures. Keep those corrections here.
export interface RenderItem extends Omit<ThreeRenderItem, "group"> {
  group: GeometryGroup | null;
}

type RenderItemSort = (a: RenderItem, b: RenderItem) => number;

export interface RenderList extends Pick<WebGLRenderList, "init" | "finish"> {
  opaque: RenderItem[];
  transparent: RenderItem[];
  transmissive: RenderItem[];
  push(
    object: RenderItem["object"],
    geometry: RenderItem["geometry"],
    material: RenderItem["material"],
    groupOrder: number,
    z: number,
    group: RenderItem["group"],
    camera: Camera,
  ): void;
  unshift(
    object: RenderItem["object"],
    geometry: RenderItem["geometry"],
    material: RenderItem["material"],
    groupOrder: number,
    z: number,
    group: RenderItem["group"],
  ): void;
  sort(opaqueSort?: RenderItemSort, transparentSort?: RenderItemSort): void;
}

export function getRenderList(
  renderer: WebGLRenderer,
  scene: Scene,
): RenderList {
  return renderer.renderLists.get(scene, 0) as unknown as RenderList;
}

interface RenderListState {
  readonly list: RenderList;
  readonly originalSort: RenderList["sort"];
  readonly wrappedSort: RenderList["sort"];
}

/** Isolates the renderer integration from the draw/animation code. A final LOD
 * runs after Three has culled shapes, selected details and prepared geometry.
 * Pooled children then go through ordinary Three buffer uploads and rendering.
 * The list hook preserves the original sorting anchors for those children.
 * Keep the browser rendering regression tests when upgrading Three. */
export class DTSInstanceRenderList {
  readonly root = new LOD();
  private anchors = new Map<number, RenderItem>();
  private consumed = new Set<RenderItem>();
  private prepared?: RenderListState;
  private states = new WeakMap<RenderList, RenderListState>();

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
    const list = getRenderList(this.renderer, scene);
    let state = this.states.get(list);
    if (!state || list.sort !== state.originalSort) {
      state = this.createState(list);
      this.states.set(list, state);
    }
    this.prepared = state;
    list.sort = state.wrappedSort;
    // React can append entities after the pool between frames.
    if (scene.children.at(-1) !== this.root) {
      this.root.removeFromParent();
      scene.add(this.root);
    }
  }

  private createState(list: RenderList): RenderListState {
    const originalSort = list.sort;
    const wrappedSort: RenderList["sort"] = (opaqueSort, transparentSort) => {
      // Arbitrary custom sort functions can inspect object/material identity.
      // Retain native draws in that case instead of assuming our anchors suffice.
      const fallback = !!opaqueSort || !!transparentSort;
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
      if (fallback) {
        for (const item of this.consumed)
          (item.material.transparent ? list.transparent : list.opaque).push(
            item,
          );
        this.consumed.clear();
      }
      originalSort.call(list, opaqueSort, transparentSort);
    };
    return { list, originalSort, wrappedSort };
  }

  private get current(): RenderListState {
    if (!this.prepared)
      throw new Error("DTS render list has not been prepared");
    return this.prepared;
  }

  get sorted(): RenderList {
    const { list, originalSort } = this.current;
    // Use the renderer's native comparator, including stable equal-depth order.
    originalSort.call(list);
    return list;
  }

  replace(
    sources: readonly { item: RenderItem }[],
    draw: LOD["children"][number],
  ) {
    // Three reuses these items only after the next prepare() clears our refs.
    this.anchors.set(draw.id, sources[0].item);
    for (const { item } of sources) this.consumed.add(item);
  }

  finish() {
    const { list } = this.current;
    for (const items of [list.opaque, list.transparent]) {
      let write = 0;
      for (const item of items)
        if (!this.consumed.has(item)) items[write++] = item;
      items.length = write;
    }
  }

  restore() {
    const state = this.prepared;
    if (state && state.list.sort === state.wrappedSort)
      state.list.sort = state.originalSort;
    this.prepared = undefined;
    this.anchors.clear();
    this.consumed.clear();
  }
}
