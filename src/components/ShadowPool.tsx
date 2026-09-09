import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ShadowPoolRuntime } from "./shadowPoolRuntime";

/**
 * Mount once in the game scene. Drives the projected shadows from the
 * scene's onBeforeRender (after every useFrame and the matrix update,
 * like LightPool) so silhouettes and receiver polys use this frame's
 * transforms.
 */
export function ShadowPool() {
  const scene = useThree((s) => s.scene);
  const runtime = useMemo(() => new ShadowPoolRuntime(), []);

  useFrame(({ gl }) => {
    runtime.renderPending(gl);
  });

  useEffect(() => {
    scene.add(runtime.decals);
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function (this: unknown, ...args) {
      previous.apply(this, args);
      const [renderer, , camera] = args;
      runtime.update(renderer, scene, camera);
    };
    return () => {
      scene.onBeforeRender = previous;
      scene.remove(runtime.decals);
      runtime.dispose();
    };
  }, [scene, runtime]);

  return null;
}
