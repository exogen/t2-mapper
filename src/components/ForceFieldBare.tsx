import { useEffect, useMemo, useRef } from "react";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugBounds } from "./DebugBounds";
import { DebugSuspense } from "./DebugSuspense";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  Color,
  DoubleSide,
  Matrix4,
  NoColorSpace,
  Quaternion,
  RepeatWrapping,
  Vector3,
} from "three";
import type { Texture } from "three";
import type {
  ForceFieldBareEntity,
  ForceFieldData,
} from "../state/gameEntityTypes";
import { textureToUrl } from "../loaders";
import { useSettings } from "./SettingsProvider";
import {
  registerForceFieldCollider,
  unregisterForceFieldCollider,
} from "../collision/worldCollision";
import {
  createForceFieldMaterial,
  OPACITY_FACTOR,
} from "../forceFieldMaterial";

function setupForceFieldTexture(texture: Texture) {
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
}

function useCornerBoxGeometry(scale: [number, number, number]) {
  const geometry = useMemo(() => {
    const [x, y, z] = scale;
    const geom = new BoxGeometry(x, y, z);
    geom.translate(x / 2, y / 2, z / 2);
    return geom;
  }, [scale]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return geometry;
}

function ForceFieldFallback({
  scale,
  color,
  baseTranslucency,
}: {
  scale: [number, number, number];
  color: [number, number, number];
  baseTranslucency: number;
}) {
  const geometry = useCornerBoxGeometry(scale);
  const fallbackColor = useMemo(
    () => new Color(color[0], color[1], color[2]),
    [color],
  );

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial
        color={fallbackColor}
        transparent
        opacity={baseTranslucency * OPACITY_FACTOR}
        blending={AdditiveBlending}
        side={DoubleSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

function ForceFieldMesh({
  scale,
  data,
}: {
  scale: [number, number, number];
  data: ForceFieldData;
}) {
  const { animationEnabled } = useSettings();
  const geometry = useCornerBoxGeometry(scale);

  const textureUrls = useMemo(
    () => data.textures.map((t) => textureToUrl(t)),
    [data.textures],
  );

  const textures = useTexture(textureUrls, (textures) => {
    textures.forEach((tex) => setupForceFieldTexture(tex));
  });

  const material = useMemo(() => {
    return createForceFieldMaterial({
      textures,
      scale,
      umapping: data.umapping,
      vmapping: data.vmapping,
      color: data.color,
      baseTranslucency: data.baseTranslucency,
    });
  }, [textures, scale, data]);

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    if (!animationEnabled) {
      elapsedRef.current = 0;
      material.uniforms.currentFrame.value = 0;
      material.uniforms.vScroll.value = 0;
      return;
    }
    elapsedRef.current += delta;
    material.uniforms.currentFrame.value =
      Math.floor(elapsedRef.current * data.framesPerSec) % data.numFrames;
    material.uniforms.vScroll.value = elapsedRef.current * data.scrollSpeed;
  });

  return <mesh geometry={geometry} material={material} renderOrder={1} />;
}

/**
 * Renders a ForceFieldBare from pre-resolved ForceFieldData.
 * Used by the unified EntityRenderer — does NOT read from TorqueObject/datablock.
 */
export function ForceFieldBare({ entity }: { entity: ForceFieldBareEntity }) {
  const data = entity.forceFieldData!;
  const scale = data.dimensions;
  const isTarget = useIsDebugTourTarget(entity.id);

  // Register the field's box for projectile collision. Torque only
  // collides with closed fields; open/close rebuilds the entity, so the
  // effect re-registers with the new state.
  useEffect(() => {
    const dims = entity.forceFieldData?.dimensions;
    if (!dims) return;
    const matrix = new Matrix4().compose(
      new Vector3(...(entity.position ?? [0, 0, 0])),
      new Quaternion(...(entity.rotation ?? [0, 0, 0, 1])),
      new Vector3(1, 1, 1),
    );
    // Corner-origin box matching useCornerBoxGeometry.
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(...dims));
    registerForceFieldCollider(entity.id, matrix, box, !entity.fieldOpen);
    return () => unregisterForceFieldCollider(entity.id);
  }, [entity]);

  const textureUrls = useMemo(
    () => data.textures.map((t) => textureToUrl(t)),
    [data.textures],
  );

  // Opened (retracted) by scripts, e.g. powered-down force fields.
  if (entity.fieldOpen) {
    return null;
  }

  if (textureUrls.length === 0) {
    return (
      <ForceFieldFallback
        scale={scale}
        color={data.color}
        baseTranslucency={data.baseTranslucency}
      />
    );
  }

  return (
    <>
      <DebugSuspense
        name={`ForceField`}
        fallback={
          <ForceFieldFallback
            scale={scale}
            color={data.color}
            baseTranslucency={data.baseTranslucency}
          />
        }
      >
        <ForceFieldMesh scale={scale} data={data} />
      </DebugSuspense>
      {isTarget && scale && <DebugBounds size={scale} />}
    </>
  );
}
