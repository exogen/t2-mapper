import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  RepeatWrapping,
  Vector3,
  type Fog,
  type Texture,
} from "three";
import { createLogger } from "../logger";
import { worldDeltaSec } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import type {
  ForceFieldBareEntity,
  ForceFieldData,
} from "../state/gameEntityTypes";
import { textureToUrl } from "../loaders";
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
import { createDebugBounds, showWhileDebugTourTarget } from "./debugVisuals";
import { createPositionedRoot, type EntityView } from "./entityViews";
import { FramePriority } from "./framePriority";
import { loadTextures } from "./textures";
import { combineCleanups } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

const log = createLogger("ForceField");

const _fieldOrigin = new Vector3();

function setupForceFieldTexture(texture: Texture) {
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
}

function cornerBoxGeometry([x, y, z]: readonly [number, number, number]) {
  const geometry = new BoxGeometry(x, y, z);
  geometry.translate(x / 2, y / 2, z / 2);
  return geometry;
}

/**
 * The open/close fade alpha (1 closed, 0 open). `fieldAlpha` is mutated
 * in place per tick by StreamPlaybackSession, so read it every frame.
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

/**
 * A ForceFieldBare from its pre-resolved ForceFieldData: an untextured
 * additive box until (or unless) its textures load, then the animated
 * force field material. Registers its box for projectile collision.
 */
export function createForceFieldView(
  entity: ForceFieldBareEntity,
  engine: GameEngine,
): EntityView {
  const { root, model } = createPositionedRoot(entity);
  const data = entity.forceFieldData!;
  const geometry = cornerBoxGeometry(data.dimensions);

  // The untextured stand-in, also used for fields without textures.
  const fallbackColors = {
    closed: new Color(...data.color),
    open: new Color(...data.powerOffColor),
  };
  const fallbackMaterial = new MeshBasicMaterial({
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const fallback = new Mesh(geometry, fallbackMaterial);
  fallback.renderOrder = 1;
  model.add(fallback);

  let field: {
    mesh: Mesh;
    material: ReturnType<typeof createForceFieldMaterial>;
  } | null = null;
  let elapsed = 0;
  let disposed = false;

  if (data.textures.length > 0) {
    void engine
      .whenHost()
      .then(({ renderer }) =>
        loadTextures(
          data.textures.map((t) => textureToUrl(t)),
          renderer,
          setupForceFieldTexture,
        ),
      )
      .then(
        (textures) => {
          if (disposed) return;
          const material = createForceFieldMaterial({
            textures,
            scale: data.dimensions,
            umapping: data.umapping,
            vmapping: data.vmapping,
            color: data.color,
            powerOffColor: data.powerOffColor,
            baseTranslucency: data.baseTranslucency,
            powerOffTranslucency: data.powerOffTranslucency,
          });
          const mesh = new Mesh(geometry, material);
          mesh.renderOrder = 1;
          model.remove(fallback);
          model.add(mesh);
          field = { mesh, material };
          engine.invalidate();
        },
        (error: unknown) => {
          if (disposed) return;
          // Like a shape that fails to load: draw nothing.
          log.warn("force field textures failed: %o", error);
          model.remove(fallback);
        },
      );
  }

  // Register the field's box for projectile collision. Torque collides
  // with any field that isn't fully open; open/close and the dimension
  // change that comes with it rebuild the entity (and so this view).
  const collider = forceFieldCollider(entity);
  if (collider)
    registerForceFieldCollider(
      entity.id,
      collider.matrix,
      collider.box,
      collider.enabled,
    );

  return {
    root,
    dispose: combineCleanups(
      () => {
        disposed = true;
        if (collider) unregisterForceFieldCollider(entity.id);
        geometry.dispose();
        fallbackMaterial.dispose();
        field?.material.dispose();
      },
      showWhileDebugTourTarget(model, entity.id, () =>
        createDebugBounds(data.dimensions),
      ),
      engine.scheduler.add(
        FramePriority.PostCamera,
        ({ camera, delta, scene }) => {
          const alpha = currentFieldAlpha(entity);
          if (!field) {
            fallbackMaterial.color
              .copy(fallbackColors.open)
              .lerp(fallbackColors.closed, alpha);
            fallbackMaterial.opacity =
              forceFieldTranslucency(
                data.baseTranslucency,
                data.powerOffTranslucency,
                alpha,
              ) * OPACITY_FACTOR;
            fallback.visible = fieldVisible(data, alpha);
            return;
          }
          const { mesh, material } = field;
          material.uniforms.fieldAlpha.value = alpha;
          mesh.visible = fieldVisible(data, alpha);
          // The engine hazes the whole field by the distance from the
          // camera to its transform position (the box corner), not per
          // fragment.
          const fog = scene.fog as Fog | null;
          mesh.getWorldPosition(_fieldOrigin);
          material.uniforms.fieldHaze.value = fog
            ? hazeAndFog(
                _fieldOrigin.distanceTo(camera.position),
                _fieldOrigin.y,
                fog.near,
                fog.far,
              )
            : 0;
          if (!settingsStore.getState().animationEnabled) {
            elapsed = 0;
            material.uniforms.currentFrame.value = 0;
            material.uniforms.vScroll.value = 0;
            return;
          }
          elapsed += worldDeltaSec(delta);
          material.uniforms.currentFrame.value =
            Math.round(elapsed * data.framesPerSec) % data.numFrames;
          material.uniforms.vScroll.value = elapsed * data.scrollSpeed;
        },
      ),
    ),
  };
}
