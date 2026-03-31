import { Stats, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AxesHelper,
  Color,
  MeshLambertMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { injectShapeLighting, injectShapeEnvMap } from "../shapeMaterial";
import styles from "./DebugElements.module.css";

const debugSphereGeo = new SphereGeometry(10, 64, 64);

/**
 * A chrome sphere that visualizes the env map. Placed 30 units in front of
 * the camera so you can always see it.
 */
function DebugEnvMapSphere() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new MeshLambertMaterial({
      color: new Color(0.5, 0.5, 0.5),
    });
    mat.customProgramCacheKey = () => "debug-envmap-sphere";
    mat.onBeforeCompile = (shader) => {
      injectCustomFog(shader, globalFogUniforms);
      injectShapeLighting(shader);
      injectShapeEnvMap(shader, 1.0);
    };
    return mat;
  }, []);

  const _dir = useMemo(() => new Vector3(), []);

  // Follow the camera: position 80 units in front.
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    camera.getWorldDirection(_dir);
    mesh.position.copy(camera.position).addScaledVector(_dir, 80);
  });

  return <mesh ref={meshRef} geometry={debugSphereGeo} material={material} />;
}

export function DebugElements() {
  const axesRef = useRef<AxesHelper>(null);

  useEffect(() => {
    const axes = axesRef.current;
    if (!axes) {
      return;
    }
    axes.setColors("rgb(153, 255, 0)", "rgb(0, 153, 255)", "rgb(255, 153, 0)");
  });

  return (
    <>
      <Stats className={styles.StatsPanel} />
      <axesHelper ref={axesRef} args={[70]} renderOrder={999}>
        <lineBasicMaterial
          depthTest={false}
          depthWrite={false}
          fog={false}
          vertexColors
        />
      </axesHelper>
      <Html position={[80, 0, 0]} center>
        <span className={styles.AxisLabel} data-axis="y">
          Y
        </span>
      </Html>
      <Html position={[0, 80, 0]} center>
        <span className={styles.AxisLabel} data-axis="z">
          Z
        </span>
      </Html>
      <Html position={[0, 0, 80]} center>
        <span className={styles.AxisLabel} data-axis="x">
          X
        </span>
      </Html>
      <DebugEnvMapSphere />
    </>
  );
}
