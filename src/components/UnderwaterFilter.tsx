import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial } from "three";
import { isWaterType, submergedWaterAt } from "../collision/waterLevel";

/**
 * Fullscreen underwater tint, matching Tribes2.exe's GameRenderFilters
 * (0x5bbd80): when the render camera is submerged in a water-type liquid,
 * the engine composites a (0.2, 0.6, 0.6) filter at alpha 0.3 over the
 * 3D view (before the GUI). The blend happens on the sRGB framebuffer,
 * so the shader outputs raw values with no colorspace conversion.
 * Lava's gLavaFX overlay and quicksand (no filter) are out of scope.
 */
export function UnderwaterFilter() {
  const meshRef = useRef<Mesh>(null);

  const geometry = useMemo(() => {
    // Single clip-space triangle covering the screen.
    const geom = new BufferGeometry();
    geom.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    return geom;
  }, []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: `
          void main() {
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          void main() {
            gl_FragColor = vec4(0.2, 0.6, 0.6, 0.3);
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const pos = camera.position;
    // Three (x, y, z) = Torque (y, z, x). Ask which body the camera is
    // actually inside — a map can have several, and only that one's
    // liquid type decides whether the filter shows.
    const info = submergedWaterAt(pos.z, pos.x, pos.y);
    mesh.visible = info !== null && isWaterType(info.liquidType);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={10000}
      visible={false}
    />
  );
}
