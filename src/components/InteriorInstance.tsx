import { memo, Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Mesh } from "three";
import { useGLTF, useTexture } from "@react-three/drei";
import { BASE_URL, interiorTextureToUrl, interiorToUrl } from "../loaders";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { setupColor } from "../textureUtils";
import { FloatingLabel } from "./FloatingLabel";
import { useDebug } from "./SettingsProvider";

const FALLBACK_URL = `${BASE_URL}/black.png`;

/**
 * Load a .gltf file that was converted from a .dif, used for "interior" models.
 */
function useInterior(interiorFile: string) {
  const url = interiorToUrl(interiorFile);
  return useGLTF(url);
}

function InteriorTexture({ materialName }: { materialName: string }) {
  const url = interiorTextureToUrl(materialName, FALLBACK_URL);
  const texture = useTexture(url, (texture) => setupColor(texture));

  return <meshStandardMaterial map={texture} side={2} />;
}

function InteriorMesh({ node }: { node: Mesh }) {
  return (
    <mesh geometry={node.geometry} castShadow receiveShadow>
      {node.material ? (
        <Suspense
          fallback={
            // Allow the mesh to render while the texture is still loading;
            // show a wireframe placeholder.
            <meshStandardMaterial color="yellow" wireframe />
          }
        >
          {Array.isArray(node.material) ? (
            node.material.map((mat, index) => (
              <InteriorTexture key={index} materialName={mat.name} />
            ))
          ) : (
            <InteriorTexture materialName={node.material.name} />
          )}
        </Suspense>
      ) : null}
    </mesh>
  );
}

export const InteriorModel = memo(
  ({ interiorFile }: { interiorFile: string }) => {
    const { nodes } = useInterior(interiorFile);
    const { debugMode } = useDebug();

    return (
      <group rotation={[0, -Math.PI / 2, 0]}>
        {Object.entries(nodes)
          .filter(
            ([name, node]: [string, any]) =>
              !node.material || !node.material.name.match(/\.\d+$/),
          )
          .map(([name, node]: [string, any]) => (
            <InteriorMesh key={name} node={node} />
          ))}
        {debugMode ? <FloatingLabel>{interiorFile}</FloatingLabel> : null}
      </group>
    );
  },
);

function InteriorPlaceholder({
  color,
  label,
}: {
  color: string;
  label?: string;
}) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
      {label ? <FloatingLabel color={color}>{label}</FloatingLabel> : null}
    </mesh>
  );
}

function DebugInteriorPlaceholder({ label }: { label?: string }) {
  const { debugMode } = useDebug();
  return debugMode ? <InteriorPlaceholder color="red" label={label} /> : null;
}

export const InteriorInstance = memo(function InteriorInstance({
  object,
}: {
  object: TorqueObject;
}) {
  const interiorFile = getProperty(object, "interiorFile");
  const position = useMemo(() => getPosition(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  return (
    <group position={position} quaternion={q} scale={scale}>
      <ErrorBoundary
        fallback={<DebugInteriorPlaceholder label={interiorFile} />}
      >
        <Suspense fallback={<InteriorPlaceholder color="orange" />}>
          <InteriorModel interiorFile={interiorFile} />
        </Suspense>
      </ErrorBoundary>
    </group>
  );
});
