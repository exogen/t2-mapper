import { Suspense, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { textureToUrl } from "../loaders";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import { setupColor } from "../textureUtils";

export function WaterMaterial({ surfaceTexture }: { surfaceTexture: string }) {
  const url = textureToUrl(surfaceTexture);
  const texture = useTexture(url, (texture) => setupColor(texture, [8, 8]));

  return <meshStandardMaterial map={texture} transparent opacity={0.8} />;
}

export function WaterBlock({ object }: { object: ConsoleObject }) {
  const [z, y, x] = useMemo(() => getPosition(object), [object]);
  const [scaleZ, scaleY, scaleX] = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object, true), [object]);

  const surfaceTexture =
    getProperty(object, "surfaceTexture")?.value ?? "liquidTiles/BlueWater";

  return (
    <mesh
      position={[x - 1024 + scaleX / 2, y + scaleY / 2, z - 1024 + scaleZ / 2]}
      quaternion={q}
    >
      <boxGeometry args={[scaleZ, scaleY, scaleX]} />
      <Suspense
        fallback={
          <meshStandardMaterial color="blue" transparent opacity={0.3} />
        }
      >
        <WaterMaterial surfaceTexture={surfaceTexture} />
      </Suspense>
    </mesh>
  );
}
