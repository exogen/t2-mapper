import { expect, it } from "vitest";
import type { WebGLRenderer } from "three";
import { invalidateShadows, registerShadowRenderer } from "./shadowControl";

function renderer() {
  return {
    domElement: new EventTarget(),
    shadowMap: { autoUpdate: true, needsUpdate: false },
  } as unknown as WebGLRenderer;
}

it("does not let an old canvas release the replacement shadow renderer", () => {
  const first = renderer(),
    second = renderer();
  const releaseFirst = registerShadowRenderer(first);
  const releaseSecond = registerShadowRenderer(second);
  second.shadowMap.needsUpdate = false;
  releaseFirst();
  invalidateShadows();
  expect(second.shadowMap.needsUpdate).toBe(true);
  second.shadowMap.needsUpdate = false;
  releaseSecond();
  invalidateShadows();
  expect(second.shadowMap.needsUpdate).toBe(false);
});

it("requests new shadow pixels on context restoration for the current renderer", () => {
  const first = renderer(),
    current = renderer();
  const releaseFirst = registerShadowRenderer(first);
  const release = registerShadowRenderer(current);
  first.shadowMap.needsUpdate = current.shadowMap.needsUpdate = false;
  first.domElement.dispatchEvent(new Event("webglcontextrestored"));
  expect(first.shadowMap.needsUpdate).toBe(false);
  current.domElement.dispatchEvent(new Event("webglcontextrestored"));
  expect(current.shadowMap.needsUpdate).toBe(true);
  expect(current.shadowMap.autoUpdate).toBe(false);
  releaseFirst();
  release();
  current.shadowMap.needsUpdate = false;
  current.domElement.dispatchEvent(new Event("webglcontextrestored"));
  expect(current.shadowMap.needsUpdate).toBe(false);
});

it("guards registration identity even when the renderer object is reused", () => {
  const current = renderer();
  const old = registerShadowRenderer(current);
  const latest = registerShadowRenderer(current);
  old();
  current.shadowMap.needsUpdate = false;
  invalidateShadows();
  expect(current.shadowMap.needsUpdate).toBe(true);
  latest();
});
