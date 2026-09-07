import type { Material, Mesh, Object3D } from "three";
import { dtsNodeExtras } from "../dtsNodeExtras";

/**
 * A mesh whose visibility a DTS sequence keyframes (the addon exports the
 * keyframes as `vis_keyframes_<sequence>` with a duration and cyclic
 * flag). Visibility below 1 renders as material opacity.
 */
export interface VisNode {
  mesh: Mesh;
  keyframes: number[];
  duration: number;
  cyclic: boolean;
}

/**
 * Every vis-animated mesh under `root`, grouped by lower-cased sequence
 * name. Several sequences can animate one mesh (station_inv_human has
 * Activate1 and Activate with vis data), so the addon writes the primary
 * `vis_keyframes`/`vis_sequence` pair and per-sequence suffixed copies.
 */
export function collectVisNodes(root: Object3D): Map<string, VisNode[]> {
  const visBySeq = new Map<string, VisNode[]>();
  root.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const ud = dtsNodeExtras(node);

    const addVis = (
      seqName: string,
      kf: unknown,
      dur: unknown,
      cyclic: boolean,
    ) => {
      if (
        !seqName ||
        !Array.isArray(kf) ||
        kf.length <= 1 ||
        typeof dur !== "number" ||
        dur <= 0
      )
        return;
      let list = visBySeq.get(seqName);
      if (!list) {
        list = [];
        visBySeq.set(seqName, list);
      }
      if (list.some((v) => v.mesh === node)) return;
      list.push({
        mesh: node as Mesh,
        keyframes: kf as number[],
        duration: dur,
        cyclic,
      });
    };

    addVis(
      String(ud.vis_sequence ?? "").toLowerCase(),
      ud.vis_keyframes,
      ud.vis_duration,
      !!ud.vis_cyclic,
    );
    for (const key of Object.keys(ud)) {
      const match = key.match(/^vis_keyframes_(.+)$/);
      if (match) {
        const suffix = match[1];
        addVis(
          suffix,
          ud[`vis_keyframes_${suffix}`],
          ud[`vis_duration_${suffix}`],
          !!ud[`vis_cyclic_${suffix}`],
        );
      }
    }
  });
  return visBySeq;
}

function singleMaterial(mesh: Mesh): Material | null {
  const mat = mesh.material;
  return mat && !Array.isArray(mat) ? mat : null;
}

/**
 * Remember the material's opaque-state settings before vis animation
 * starts toggling blending, so full visibility can restore them.
 */
export function prepareVisMaterial(node: VisNode): void {
  const mat = singleMaterial(node.mesh);
  if (!mat) return;
  const ud = (mat.userData ??= {});
  if (ud._visOrigTransparent == null) {
    ud._visOrigTransparent = mat.transparent;
    ud._visOrigDepthWrite = mat.depthWrite;
    ud._visOrigAlphaTest = mat.alphaTest;
  }
}

/** Linear interpolation of the keyframes at normalized position `t`. */
export function visKeyframeValue(keyframes: number[], t: number): number {
  const n = keyframes.length;
  if (n === 0) return 1;
  const pos = Math.max(0, Math.min(1, t)) * (n - 1);
  const lo = Math.min(Math.floor(pos), n - 1);
  const hi = Math.min(lo + 1, n - 1);
  return keyframes[lo] + (keyframes[hi] - keyframes[lo]) * (pos - lo);
}

/**
 * Normalized keyframe position for a thread `elapsed` seconds into a
 * sequence: cyclic sequences wrap, others clamp at the end (or run from
 * the end toward the start when played backwards).
 */
export function visThreadPosition(
  elapsed: number,
  duration: number,
  cyclic: boolean,
  forward = true,
): number {
  if (!(duration > 0)) return 0;
  if (cyclic) return (((elapsed % duration) + duration) % duration) / duration;
  return forward
    ? Math.min(elapsed / duration, 1)
    : Math.max(1 - elapsed / duration, 0);
}

/**
 * Show the mesh at `opacity`, enabling blending only while partially
 * transparent and restoring the opaque settings at full visibility
 * (transparent objects live in a different render list, so the toggle
 * needs a program update).
 */
export function applyVisOpacity(node: VisNode, opacity: number): void {
  const mat = singleMaterial(node.mesh);
  if (!mat) return;
  mat.opacity = opacity;
  node.mesh.visible = opacity > 0.01;
  const ud = mat.userData;
  if (opacity >= 0.99) {
    if (ud?._visOrigTransparent != null) {
      if (mat.transparent !== ud._visOrigTransparent) {
        mat.transparent = ud._visOrigTransparent;
        mat.needsUpdate = true;
      }
      mat.depthWrite = ud._visOrigDepthWrite;
      mat.alphaTest = ud._visOrigAlphaTest;
    }
  } else if (!mat.transparent) {
    mat.transparent = true;
    mat.depthWrite = false;
    mat.alphaTest = 0;
    mat.needsUpdate = true;
  }
}

/** Evaluate the sequence at `t` and show the mesh accordingly. */
export function applyVisAt(node: VisNode, t: number): void {
  applyVisOpacity(node, visKeyframeValue(node.keyframes, t));
}

/**
 * A stopped thread sits at position 0 (the engine's Stop resets the
 * thread and freezes it): show the first keyframe with opaque settings.
 */
export function resetVisNode(node: VisNode): void {
  const mat = singleMaterial(node.mesh);
  if (!mat) return;
  mat.opacity = node.keyframes[0];
  node.mesh.visible = node.keyframes[0] > 0.01;
  const ud = mat.userData;
  if (ud?._visOrigTransparent != null) {
    mat.transparent = ud._visOrigTransparent;
    mat.depthWrite = ud._visOrigDepthWrite;
    mat.alphaTest = ud._visOrigAlphaTest;
  }
}

/**
 * A mesh no thread animates any more shows the shape's default
 * visibility (TSShapeInstance::animateVisibility falls back to the object
 * state's vis), which the addon exports as the mesh's `vis` extra.
 */
export function restoreDefaultVis(node: VisNode): void {
  const raw = dtsNodeExtras(node.mesh).vis;
  const vis = typeof raw === "number" ? raw : Number(raw);
  applyVisOpacity(node, Number.isFinite(vis) ? vis : 1);
}
