import { Suspense, useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { BoxGeometry, DoubleSide } from "three";
import { textureToUrl } from "../loaders";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import { setupColor } from "../textureUtils";

export function WaterMaterial({
  surfaceTexture,
  attach,
}: {
  surfaceTexture: string;
  attach?: string;
}) {
  const url = textureToUrl(surfaceTexture);
  const texture = useTexture(url, (texture) => setupColor(texture));

  return (
    <meshStandardMaterial
      attach={attach}
      map={texture}
      transparent
      opacity={0.8}
      side={DoubleSide}
    />
  );
}

export function WaterBlock({ object }: { object: ConsoleObject }) {
  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);

  const surfaceTexture =
    getProperty(object, "surfaceTexture")?.value ?? "liquidTiles/BlueWater";

  const geometry = useMemo(() => {
    const geom = new BoxGeometry(scaleX, scaleY, scaleZ);

    geom.translate(scaleX / 2, scaleY / 2, scaleZ / 2);

    const uvAttr = geom.getAttribute("uv");
    const uv = uvAttr.array as Float32Array;
    const faceRepeats: [number, number][] = [
      // +x, -x (depth x height)
      [scaleX / 32, scaleY / 32],
      [scaleX / 32, scaleY / 32],
      // +y, -y (width x depth)
      [scaleZ / 32, scaleX / 32],
      [scaleZ / 32, scaleX / 32],
      // +z, -z (width x height)
      [scaleZ / 32, scaleY / 32],
      [scaleZ / 32, scaleY / 32],
    ];

    for (let face = 0; face < 6; face++) {
      const [uRepeat, vRepeat] = faceRepeats[face];
      const offset = face * 4 * 2; // 4 verts per face, 2 components per vert
      for (let i = 0; i < 4; i++) {
        uv[offset + i * 2] *= uRepeat;
        uv[offset + i * 2 + 1] *= vRepeat;
      }
    }
    uvAttr.needsUpdate = true;
    return geom;
  }, [scaleX, scaleY, scaleZ]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <mesh position={position} quaternion={q} geometry={geometry}>
      <meshStandardMaterial attach="material-0" transparent opacity={0} />
      <meshStandardMaterial attach="material-1" transparent opacity={0} />
      <Suspense
        fallback={
          <meshStandardMaterial
            attach="material-2"
            color="blue"
            transparent
            opacity={0.3}
            side={DoubleSide}
          />
        }
      >
        <WaterMaterial attach="material-2" surfaceTexture={surfaceTexture} />
      </Suspense>
      <meshStandardMaterial attach="material-3" transparent opacity={0} />
      <meshStandardMaterial attach="material-4" transparent opacity={0} />
      <meshStandardMaterial attach="material-5" transparent opacity={0} />
    </mesh>
  );
}
