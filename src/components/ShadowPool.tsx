import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ShadowPoolRuntime } from "./shadowPoolRuntime";
import { FramePriority } from "./framePriority";

/**
 * Queue projected shadows after the scene's final matrix update. Draw their
 * atlases at the start of the next frame, while that complete pose is intact.
 */
export function ShadowPool() {
  const scene = useThree((s) => s.scene);
  const runtime = useMemo(() => new ShadowPoolRuntime(), []);

  useFrame(({ gl }) => {
    runtime.renderPending(gl);
  }, FramePriority.ShadowAtlas);

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
