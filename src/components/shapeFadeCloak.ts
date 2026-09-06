/**
 * ShapeBase fade and cloak rendering, shared by shapes and players.
 *
 * Cloak (mCloakLevel, 0→1 over 0.5 s) replaces the shape's textures with
 * the scrolling special/cloakTexture and sets the vertex alpha to
 * 0.125 + (1 − cloakLevel) × 0.875 (ShapeBase::renderObject); mounted
 * images keep their own textures and, when their datablock is cloakable,
 * take 0.15 + (1 − cloakLevel) × 0.85 (ShapeBase::renderMountedImage).
 * Fade (mFadeVal) is applied below both, at the mesh: while it is under
 * 1 TSMesh replaces the fragment alpha with the fade value, so a fade
 * wins over the cloak alpha — a mod that hides cloakers (Classic sends
 * mFadeVal = 0 once the cloak completes) makes them fully invisible.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { NormalBlending, RepeatWrapping, SRGBColorSpace } from "three";
import type { Object3D, Texture } from "three";
import { loadTexture } from "../textureUtils";
import { textureToUrl } from "../loaders";

// Lazy-loaded on first use since cloaking is rare.
let _cloakTexture: Texture | null = null;
export function getCloakTexture(): Texture {
  if (!_cloakTexture) {
    _cloakTexture = loadTexture(textureToUrl("special/cloakTexture"));
    _cloakTexture.wrapS = RepeatWrapping;
    _cloakTexture.wrapT = RepeatWrapping;
    _cloakTexture.colorSpace = SRGBColorSpace;
  }
  return _cloakTexture;
}

// Global UV offset matching engine's static shiftX/shiftY with different moduli
// to create a non-repeating shimmer pattern.
let _cloakShiftX = 0;
let _cloakShiftY = 0;
let _cloakLastFrame = -1;
export function advanceCloakUV(frameId: number): void {
  if (frameId === _cloakLastFrame) return;
  _cloakLastFrame = frameId;
  _cloakShiftX = (_cloakShiftX + 1) % 128;
  _cloakShiftY = (_cloakShiftY + 1) % 127;
  getCloakTexture().offset.set(_cloakShiftX / 127, _cloakShiftY / 126);
}

export function shapeCloakAlpha(cloakLevel: number): number {
  return 0.125 + (1 - cloakLevel) * 0.875;
}

export function mountedImageCloakAlpha(cloakLevel: number): number {
  return 0.15 + (1 - cloakLevel) * 0.85;
}

/** A mounted image's subtree and whether its ShapeImageData is cloakable. */
export interface MountedImageRoot {
  root: Object3D;
  cloakable: boolean;
}

export interface FadeCloakState {
  fadeVal?: number;
  cloakLevel?: number;
}

/**
 * Write the fade/cloak state into every single-material mesh under
 * `root`. Meshes under a mounted image root follow the mounted-image
 * rule; everything else follows the shape rule.
 */
export function applyFadeAndCloak(
  root: Object3D,
  fadeVal: number,
  cloakLevel: number,
  mounted: readonly MountedImageRoot[] = [],
): void {
  const isCloak = cloakLevel > 0;
  const faded = fadeVal < 1;
  const shapeAlpha = faded
    ? fadeVal
    : isCloak
      ? shapeCloakAlpha(cloakLevel)
      : 1;
  const cloakTex = isCloak ? getCloakTexture() : _cloakTexture;

  const mountedMeshes = new Map<Object3D, boolean>();
  for (const m of mounted) {
    m.root.traverse((node: any) => {
      if (node.isMesh) mountedMeshes.set(node, m.cloakable);
    });
  }

  root.traverse((node: any) => {
    if (!node.isMesh || !node.material || Array.isArray(node.material)) return;
    const mat = node.material;
    const ud = (mat.userData ??= {});

    // Save originals on first encounter.
    if (ud._baseFadeOpacity == null) {
      ud._baseFadeOpacity = mat.opacity ?? 1;
      ud._baseFadeTransparent = mat.transparent ?? false;
      ud._originalMap = mat.map;
      // Originally-translucent materials keep their own texture during cloak.
      // Detect via alphaTest (organic/Translucent cutout) or non-normal blending
      // (Additive). These match how createMaterialFromFlags sets up materials.
      ud._isOriginallyTranslucent =
        (ud._baseFadeTransparent as boolean) ||
        mat.alphaTest > 0 ||
        mat.blending !== NormalBlending;
    }
    const baseOpacity = ud._baseFadeOpacity as number;
    const baseTransparent = ud._baseFadeTransparent as boolean;

    const mountedCloakable = mountedMeshes.get(node);
    const alpha =
      mountedCloakable === undefined
        ? shapeAlpha
        : faded
          ? fadeVal
          : isCloak && mountedCloakable
            ? mountedImageCloakAlpha(cloakLevel)
            : 1;

    // Cloak texture replacement: the shape's non-translucent materials only.
    const wantCloakTex =
      isCloak && mountedCloakable === undefined && !ud._isOriginallyTranslucent;
    if (wantCloakTex) {
      if (mat.map !== cloakTex) {
        mat.map = cloakTex;
        mat.needsUpdate = true;
      }
    } else if (
      cloakTex &&
      ud._originalMap !== undefined &&
      mat.map === cloakTex
    ) {
      mat.map = ud._originalMap;
      mat.needsUpdate = true;
    }

    mat.opacity = alpha * baseOpacity;
    mat.transparent = alpha < 1 || baseTransparent;
    mat.depthWrite = alpha >= 1 && !baseTransparent;
  });
}

/**
 * Drive applyFadeAndCloak from a per-frame reader. `read` returns the
 * entity's live fade/cloak fields (mutated in place by the stream, so no
 * React re-render marks a change). While faded or cloaked the state is
 * re-applied every frame, so meshes that arrive later (a weapon swap on
 * a cloaked player) pick it up; at rest it is written once.
 */
export function useFadeAndCloak(
  root: Object3D,
  read: () => FadeCloakState | undefined | null,
  mounted?: () => readonly MountedImageRoot[],
): void {
  const lastFadeValRef = useRef(1);
  const lastCloakLevelRef = useRef(0);
  const lastRootRef = useRef<Object3D | null>(null);
  useFrame((state) => {
    const entity = read();
    const fadeVal = entity?.fadeVal ?? 1;
    const cloakLevel = entity?.cloakLevel ?? 0;
    const isCloak = cloakLevel > 0;

    // Advance global cloak UV offset once per frame (all cloaked shapes share it).
    if (isCloak)
      advanceCloakUV(
        state.frameloop === "never" ? 0 : (state.clock.elapsedTime * 60) | 0,
      );

    const atRest = fadeVal >= 1 && !isCloak;
    if (
      atRest &&
      root === lastRootRef.current &&
      fadeVal === lastFadeValRef.current &&
      cloakLevel === lastCloakLevelRef.current
    )
      return;
    lastRootRef.current = root;
    lastFadeValRef.current = fadeVal;
    lastCloakLevelRef.current = cloakLevel;
    applyFadeAndCloak(root, fadeVal, cloakLevel, mounted?.());
  });
}
