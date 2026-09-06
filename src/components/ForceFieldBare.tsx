import { useEffect, useMemo, useRef } from "react";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugBounds } from "./DebugBounds";
import { DebugSuspense } from "./DebugSuspense";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  NoColorSpace,
  RepeatWrapping,
  Vector3,
} from "three";
import type { Fog, Mesh, MeshBasicMaterial, Texture } from "three";
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
import { forceFieldCollider } from "../world/placement";
import {
  createForceFieldMaterial,
  forceFieldTranslucency,
  OPACITY_FACTOR,
} from "../forceFieldMaterial";
import { hazeAndFog } from "../globalFogUniforms";

const _fieldOrigin = new Vector3();

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

/**
 * The open/close fade alpha (1 closed, 0 open). `fieldAlpha` is mutated
 * in place per tick by StreamingController, so read it every frame.
 */
function currentFieldAlpha(entity: ForceFieldBareEntity): number {
  return entity.fieldAlpha ?? (entity.fieldOpen ? 0 : 1);
}

/** A retracted (zero-scaled) or fully transparent field draws nothing. */
function fieldVisible(data: ForceFieldData, alpha: number): boolean {
  const [x, y, z] = data.dimensions;
  return (
    x > 0 &&
    y > 0 &&
    z > 0 &&
    forceFieldTranslucency(
      data.baseTranslucency,
      data.powerOffTranslucency,
      alpha,
    ) > 0
  );
}

function ForceFieldFallback({ entity }: { entity: ForceFieldBareEntity }) {
  const data = entity.forceFieldData!;
  const geometry = useCornerBoxGeometry(data.dimensions);
  const meshRef = useRef<Mesh>(null);
  const colors = useMemo(
    () => ({
      closed: new Color(...data.color),
      open: new Color(...data.powerOffColor),
    }),
    [data.color, data.powerOffColor],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const alpha = currentFieldAlpha(entity);
    const material = mesh.material as MeshBasicMaterial;
    material.color.copy(colors.open).lerp(colors.closed, alpha);
    material.opacity =
      forceFieldTranslucency(
        data.baseTranslucency,
        data.powerOffTranslucency,
        alpha,
      ) * OPACITY_FACTOR;
    mesh.visible = fieldVisible(data, alpha);
  });

  return (
    <mesh ref={meshRef} geometry={geometry} renderOrder={1}>
      <meshBasicMaterial
        transparent
        blending={AdditiveBlending}
        side={DoubleSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

function ForceFieldMesh({ entity }: { entity: ForceFieldBareEntity }) {
  const data = entity.forceFieldData!;
  const scale = data.dimensions;
  const { animationEnabled } = useSettings();
  const geometry = useCornerBoxGeometry(scale);
  const meshRef = useRef<Mesh>(null);

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
      powerOffColor: data.powerOffColor,
      baseTranslucency: data.baseTranslucency,
      powerOffTranslucency: data.powerOffTranslucency,
    });
  }, [textures, scale, data]);

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  const elapsedRef = useRef(0);

  useFrame((state, delta) => {
    const alpha = currentFieldAlpha(entity);
    material.uniforms.fieldAlpha.value = alpha;
    const mesh = meshRef.current;
    if (mesh) {
      mesh.visible = fieldVisible(data, alpha);
      // The engine hazes the whole field by the distance from the camera
      // to its transform position (the box corner), not per fragment.
      const fog = state.scene.fog as Fog | null;
      mesh.getWorldPosition(_fieldOrigin);
      material.uniforms.fieldHaze.value = fog
        ? hazeAndFog(
            _fieldOrigin.distanceTo(state.camera.position),
            _fieldOrigin.y,
            fog.near,
            fog.far,
          )
        : 0;
    }
    if (!animationEnabled) {
      elapsedRef.current = 0;
      material.uniforms.currentFrame.value = 0;
      material.uniforms.vScroll.value = 0;
      return;
    }
    elapsedRef.current += delta;
    material.uniforms.currentFrame.value =
      Math.round(elapsedRef.current * data.framesPerSec) % data.numFrames;
    material.uniforms.vScroll.value = elapsedRef.current * data.scrollSpeed;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      renderOrder={1}
    />
  );
}

/**
 * Renders a ForceFieldBare from pre-resolved ForceFieldData.
 * Used by the unified EntityRenderer — does NOT read from TorqueObject/datablock.
 */
export function ForceFieldBare({ entity }: { entity: ForceFieldBareEntity }) {
  const data = entity.forceFieldData!;
  const scale = data.dimensions;
  const isTarget = useIsDebugTourTarget(entity.id);

  // Register the field's box for projectile collision. Torque collides
  // with any field that isn't fully open; open/close and the dimension
  // change that comes with it rebuild the entity, so the effect
  // re-registers with the new state.
  useEffect(() => {
    const collider = forceFieldCollider(entity);
    if (!collider) return;
    registerForceFieldCollider(
      entity.id,
      collider.matrix,
      collider.box,
      collider.enabled,
    );
    return () => unregisterForceFieldCollider(entity.id);
  }, [entity]);

  if (data.textures.length === 0) {
    return <ForceFieldFallback entity={entity} />;
  }

  return (
    <>
      <DebugSuspense
        name={`ForceField`}
        fallback={<ForceFieldFallback entity={entity} />}
      >
        <ForceFieldMesh entity={entity} />
      </DebugSuspense>
      {isTarget && scale && <DebugBounds size={scale} />}
    </>
  );
}
