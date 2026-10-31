import { Box3, Group, Mesh, Vector3, type Material, type Texture } from "three";
import { createLogger } from "../logger";
import type { DIFMaterial, DIFModel } from "../dif/difLoader";
import { DIFLighting } from "../dif/difLighting";
import type { DIFCollisionMesh } from "../dif/difCollision";
import { interiorLightingTime } from "../scene/interiorAlarm";
import type { SceneInteriorInstance } from "../scene/types";
import { invalidateInteriorLighting } from "../shapeLighting";
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import type { InteriorInstanceEntity } from "../state/gameEntityTypes";
import { loadInterior } from "./interiorCache";
import { interiorToUrl, textureToUrl } from "../loaders";
import { interiorPlacement } from "../world/placement";
import { interiorColliderMeshes } from "../world/colliderPolicy";
import { setupTexture } from "../textureUtils";
import { setShadowCasterBounds } from "../shadowBounds";
import {
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";
import { registerCollisionLoadFailure } from "../collision/collisionContext";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { injectInteriorLighting } from "../interiorMaterial";
import { invalidateShadows } from "./shadowControl";
import { invalidateTerrainLightmap } from "./terrainLightmapControl";
import { freezeStaticMatrices, unfreezeStaticMatrices } from "./staticMatrices";
import { createDebugBounds, showWhileDebugTourTarget } from "./debugVisuals";
import { loadTextures } from "./textures";
import { combineCleanups, reaction, type Cleanup } from "./storeReaction";
import { WorldLabel } from "./worldLabel";
import {
  createPlaceholder,
  disposeMesh,
  showDebugPlaceholder,
} from "./placeholders";
import type { EntityView } from "./entityViews";
import type { GameEngine } from "./gameEngine";

const log = createLogger("InteriorInstance");

type InteriorMaterial = DIFMaterial &
  Material & {
    defines?: Record<string, number>;
  };

function samePlacement(
  a: SceneInteriorInstance,
  b: SceneInteriorInstance,
): boolean {
  return (
    a.interiorFile === b.interiorFile &&
    a.ghostIndex === b.ghostIndex &&
    JSON.stringify([a.transform, a.scale]) ===
      JSON.stringify([b.transform, b.scale])
  );
}

/**
 * An interior: its DIF surfaces with per-instance (alarm-aware) lighting,
 * collision for the camera and projectiles, a contribution to the sun's
 * shadow frustum, and its building shadow baked into the terrain.
 */
export function createInteriorView(
  entity: InteriorInstanceEntity,
  engine: GameEngine,
): EntityView {
  const root = new Group();
  root.name = entity.id;
  let lightingState = entity.interiorData;
  const { interiorFile, ghostIndex } = lightingState;
  const label = `${ghostIndex}: ${interiorFile}`;

  // The placement never moves after the ghost's transform is applied.
  const placement = new Group();
  const { position, quaternion, scale } = interiorPlacement({
    transform: lightingState.transform,
    scale: lightingState.scale,
  });
  placement.position.fromArray(position);
  placement.quaternion.copy(quaternion);
  placement.scale.fromArray(scale);
  root.add(placement);
  freezeStaticMatrices(placement);

  const loading = createPlaceholder("orange");
  placement.add(loading);

  let disposed = false;
  let stopModel: Cleanup;

  void loadInterior(interiorToUrl(interiorFile)).then(
    (interior) => {
      if (disposed) return;
      disposeMesh(loading);
      stopModel = showInteriorModel(interior);
      engine.invalidate();
    },
    (error: unknown) => {
      if (disposed) return;
      log.error(
        "Failed to load %s: %s",
        interiorFile,
        (error as Error).message,
      );
      disposeMesh(loading);
      stopModel = combineCleanups(
        registerCollisionLoadFailure(ghostIndex),
        showDebugPlaceholder(placement, "red", label),
      );
    },
  );

  let applyLighting: () => void = () => {};

  function showInteriorModel(interior: DIFModel): () => void {
    const lighting = new DIFLighting(interior);
    const model = new Group();
    placement.add(model);
    let colliderMeshes: DIFCollisionMesh[] = [];

    const prepare = (material: DIFMaterial) => {
      const time = engineStore.getState().playback.recording
        ? streamClock.worldTime
        : performance.now() / 1000;
      const lightTime = interiorLightingTime(
        lightingState,
        time,
        lighting.model.interior.hasAlarmState,
      );
      lighting.prepare(material, lightTime * 1000);
    };

    const meshes = interior.surfaceMeshes.map((node, i) => {
      const material = lighting.materials[i] as InteriorMaterial;
      const mesh = new Mesh(node.geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
      return { node, material, mesh };
    });
    // Animated lightmaps (alarm lights, flicker) refresh before each draw.
    const updatePrepare = () => {
      for (const { node, material, mesh } of meshes) {
        mesh.onBeforeRender = lighting.hasAnimatedLightMap(
          material,
          lightingState.alarmState ?? false,
        )
          ? () => prepare(material)
          : node.onBeforeRender;
      }
    };
    applyLighting = () => {
      if (lighting.setAlarmState(lightingState.alarmState ?? false)) {
        for (const mesh of colliderMeshes)
          mesh.alarmState = lighting.alarmState;
        invalidateInteriorLighting();
      }
      updatePrepare();
      engine.invalidate();
    };
    applyLighting();
    invalidateShadows();

    // Each surface's texture, with the fog and interior-lighting shader
    // patches; the surface draws untextured until it arrives.
    const textured: InteriorMaterial[] = [];
    void engine.whenHost().then(({ renderer }) => {
      const anisotropy = renderer.capabilities.getMaxAnisotropy();
      for (const { material } of meshes) {
        const url = textureToUrl(material.resourcePath);
        void loadTextures([url], renderer, (texture: Texture) =>
          setupTexture(texture, { anisotropy }),
        ).then(
          ([texture]) => {
            if (disposed) return;
            const outsideVisible = material.outsideVisible;
            material.map = texture;
            material.defines = {
              DEBUG_MODE: selectDebugMode(settingsStore.getState()) ? 1 : 0,
            };
            material.onBeforeCompile = (shader) => {
              injectCustomFog(shader, globalFogUniforms);
              injectInteriorLighting(shader, {
                surfaceOutsideVisible: outsideVisible,
                dynamicLights: true,
              });
            };
            material.customProgramCacheKey = () => `dif:${outsideVisible}`;
            material.needsUpdate = true;
            textured.push(material);
            // The shadow map is frozen, and alpha-tested surfaces cast
            // through their texture: re-render it with this one.
            invalidateShadows();
            engine.invalidate();
          },
          (error: unknown) =>
            log.warn("texture failed for %s: %o", interiorFile, error),
        );
      }
    });

    // Register this interior's native BSP/hulls for collision. Interiors
    // are static, so world matrices are snapshotted once. Which meshes
    // qualify is `interiorColliderMeshes` — shared with the headless
    // world builder so both see identical geometry. Keyed on the GHOST
    // index, not `entity.id` (a per-session counter that differs between
    // stacks), so a dump of this world is comparable with a headless
    // build's. Mission mode has no ghosts, hence the fallback.
    const collisionId =
      ghostIndex != null ? `ghost:${ghostIndex}` : `mission:${entity.id}`;
    colliderMeshes = interiorColliderMeshes(
      model,
      interior,
    ) as DIFCollisionMesh[];
    for (const mesh of colliderMeshes) mesh.alarmState = lighting.alarmState;
    registerInteriorCollider(collisionId, colliderMeshes);
    // This building's shadow on the ground is baked into the terrain
    // lightmap, and that bake reads the interior colliders.
    invalidateTerrainLightmap();
    // Interiors cast into the sun's shadow map, and a tower can stand
    // above the terrain's own bounds, so the frustum has to include them.
    setShadowCasterBounds(collisionId, new Box3().setFromObject(model));
    // Static geometry: stop three from recomposing every mesh's matrix on
    // every frame. Interiors are the biggest static subtrees in the scene.
    freezeStaticMatrices(model);

    return combineCleanups(
      () => {
        unfreezeStaticMatrices(model);
        unregisterInteriorCollider(collisionId);
        colliderMeshes = [];
        invalidateTerrainLightmap();
        setShadowCasterBounds(collisionId, null);
        placement.remove(model);
        lighting.dispose();
        invalidateShadows();
      },
      // Debug mode: the shader's debug define, and a label.
      reaction(settingsStore, selectDebugMode, (debugMode) => {
        for (const material of textured) {
          material.defines = {
            ...material.defines,
            DEBUG_MODE: debugMode ? 1 : 0,
          };
          material.needsUpdate = true;
        }
        if (!debugMode) return;
        const debugLabel = new WorldLabel(model, label);
        return () => debugLabel.dispose();
      }),
      showWhileDebugTourTarget(model, entity.id, () => {
        const box = new Box3().setFromObject(interior.scene);
        const lines = createDebugBounds(
          box.getSize(new Vector3()).toArray() as [number, number, number],
        );
        lines.position.copy(box.getCenter(new Vector3()));
        return lines;
      }),
    );
  }

  return {
    root,
    update(next) {
      if (
        next.renderType !== "InteriorInstance" ||
        !samePlacement(lightingState, next.interiorData)
      )
        return false;
      // An alarm or power change: relight in place.
      lightingState = next.interiorData;
      applyLighting();
      return true;
    },
    dispose() {
      disposed = true;
      stopModel?.();
      if (loading.parent) disposeMesh(loading);
      unfreezeStaticMatrices(placement);
    },
  };
}
