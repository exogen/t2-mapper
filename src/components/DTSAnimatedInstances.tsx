import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { installDTSAnimatedInstances } from "../dts/dtsAnimatedInstances";

/** One shared DTS draw pool for scenery, entities, mounts and effects. */
export function DTSAnimatedInstances() {
  const scene = useThree((state) => state.scene);
  const renderer = useThree((state) => state.gl);
  useEffect(() => {
    const instances = installDTSAnimatedInstances(scene, renderer);
    return () => instances.dispose();
  }, [scene, renderer]);
  return null;
}
