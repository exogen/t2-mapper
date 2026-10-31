import type { WebGLRenderer } from "three";

/**
 * Manual shadow-map scheduling. The sun never moves and only static world
 * geometry (terrain, interiors) casts shadows, so re-rendering the shadow
 * map every frame is pure waste — it's frozen (`shadowMap.autoUpdate =
 * false`) and re-rendered once whenever a caster appears or moves.
 */
let renderer: WebGLRenderer | null = null;

export function registerShadowRenderer(gl: WebGLRenderer | null): void {
  renderer = gl;
  if (gl) {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }
}

/**
 * Request a one-time shadow map re-render on the next frame. Call when
 * shadow casters change: terrain tiles mount or repool, interiors load,
 * or the sun light itself changes.
 */
export function invalidateShadows(): void {
  if (renderer) {
    renderer.shadowMap.needsUpdate = true;
  }
}
