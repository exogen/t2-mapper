import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector4 } from "three";
import { installDTSAnimatedInstances } from "../dts/dtsAnimatedInstances";
import { setDTSRenderSettings } from "../dts/dtsModel";
import { useDebug } from "./SettingsProvider";

/** Camera-scoped LOD settings also apply when the draw pool is disabled. */
export function DTSRendering() {
  const { lodEnabled } = useDebug();
  const invalidate = useThree((state) => state.invalidate);
  const viewport = useMemo(() => new Vector4(), []);
  useFrame(({ camera, gl }) => {
    setDTSRenderSettings(
      camera,
      gl.getViewport(viewport).w * gl.getPixelRatio(),
      lodEnabled,
    );
  });
  useEffect(() => invalidate(), [invalidate, lodEnabled]);
  return new URLSearchParams(window.location.search).get("dtsInstancing") !==
    "0" ? (
    <DTSAnimatedInstances />
  ) : null;
}

/** One shared DTS draw pool for scenery, entities, mounts and effects. */
function DTSAnimatedInstances() {
  const scene = useThree((state) => state.scene);
  const renderer = useThree((state) => state.gl);
  useEffect(() => {
    const instances = installDTSAnimatedInstances(scene, renderer);
    return () => instances.dispose();
  }, [scene, renderer]);
  return null;
}
