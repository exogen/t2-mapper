import {
  BoxGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  PlaneGeometry,
  RepeatWrapping,
  type ShaderMaterial,
  type Texture,
} from "three";
import { createLogger } from "../logger";
import { textureToUrl } from "../loaders";
import { setWaterBody, setWaterTime } from "../collision/waterLevel";
import { waterInfoFor } from "../world/placement";
import {
  matrixFToQuaternion,
  torqueToThree,
  type SceneWaterBlock,
} from "../scene";
import { setupTexture } from "../textureUtils";
import { createWaterMaterial } from "../waterMaterial";
import { worldDeltaSec } from "../state/engineStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import type { WaterBlockEntity } from "../state/gameEntityTypes";
import { createDebugBounds, showWhileDebugTourTarget } from "./debugVisuals";
import type { EntityView } from "./entityViews";
import { FramePriority } from "./framePriority";
import { loadTextures } from "./textures";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

const log = createLogger("WaterBlock");

type Vec3Tuple = [number, number, number];
type Rep = [number, number];

const REP_SIZE = 2048;

/**
 * Terrain coordinate offset from world space.
 * In Tribes 2, terrain coordinates are offset by +1024 from world coordinates.
 * This allows world positions like (-672, -736) to map to valid terrain
 * positions (352, 288) after the offset.
 */
const TERRAIN_OFFSET = 1024;

const _repMatrix = new Matrix4();

/**
 * Calculate tessellation to match Tribes 2 engine.
 *
 * The engine uses two modes based on water size:
 * - High-res mode (size <= 1024): 32-unit blocks with 5x5 vertices = 8 units between verts
 * - Normal mode (size > 1024): 64-unit blocks with 5x5 vertices = 16 units between verts
 *
 * Each block has 4 segments (5 vertices across), creating 32 triangles per block.
 */
function calculateWaterSegments(
  sizeX: number,
  sizeZ: number,
): [number, number] {
  // High-res mode threshold: 1024 world units (128 terrain squares × 8 units)
  const isHighRes = sizeX <= 1024 && sizeZ <= 1024;

  // Vertex spacing: 8 units for high-res, 16 units for normal
  const vertexSpacing = isHighRes ? 8 : 16;

  // Calculate segments (vertices - 1)
  const segmentsX = Math.max(4, Math.ceil(sizeX / vertexSpacing));
  const segmentsZ = Math.max(4, Math.ceil(sizeZ / vertexSpacing));

  return [segmentsX, segmentsZ];
}

/**
 * Terrain rep index for a camera coordinate (terrain space / 2048).
 * Matches fluidQuadTree.cc RunQuadTree():
 *   I = (s32)(m_Eye.X / 2048.0f);
 *   if( m_Eye.X < 0.0f )  I--;
 * (truncation toward zero, then decrement for negative).
 */
function cameraRepIndex(coord: number): number {
  const terrain = coord + TERRAIN_OFFSET;
  let i = Math.trunc(terrain / REP_SIZE);
  if (terrain < 0) i--;
  return i;
}

/**
 * Build the 3x3 grid of reps around the camera's rep. ALL water blocks
 * use 9-rep tiling - the masking system handles visibility.
 */
function buildRepGrid(cameraRepX: number, cameraRepZ: number): Rep[] {
  const reps: Rep[] = [];
  for (let repZ = cameraRepZ - 1; repZ <= cameraRepZ + 1; repZ++) {
    for (let repX = cameraRepX - 1; repX <= cameraRepX + 1; repX++) {
      reps.push([repX, repZ]);
    }
  }
  return reps;
}

/**
 * The fluid's anchor point: the block position snapped to the terrain
 * grid, in terrain space. Matches Torque's UpdateFluidRegion() and
 * fluid::SetInfo():
 * 1. Add TERRAIN_OFFSET (1024) to convert world -> terrain space
 * 2. Round to nearest terrain square: (s32)((X0 / 8.0f) + 0.5f) = Math.round(x/8)
 * 3. Clamp to valid terrain range [0, 2040] squares
 * 4. Convert back to world units (multiply by 8)
 */
function waterBasePosition([x, y, z]: Vec3Tuple): Vec3Tuple {
  const snap = (v: number) =>
    Math.max(0, Math.min(2040, Math.round((v + TERRAIN_OFFSET) / 8))) * 8;
  return [snap(x), y, snap(z)];
}

/**
 * A rep's world-space origin. Converts from terrain space to world space
 * by subtracting TERRAIN_OFFSET, matching Torque's L2Wm transform:
 * L2Wv = (-1024, -1024, 0).
 */
function repOrigin(base: Vec3Tuple, [repX, repZ]: Rep): Vec3Tuple {
  return [
    base[0] + repX * REP_SIZE - TERRAIN_OFFSET,
    base[1],
    base[2] + repZ * REP_SIZE - TERRAIN_OFFSET,
  ];
}

/**
 * Subdivided plane for the water surface, tessellated to match Tribes 2
 * (5x5 vertices per block) so vertex displacement can create visible waves.
 */
function createSurfaceGeometry([scaleX, scaleY, scaleZ]: Vec3Tuple) {
  const [segmentsX, segmentsZ] = calculateWaterSegments(scaleX, scaleZ);
  // PlaneGeometry is created in the XY plane; rotate it to lie flat in XZ.
  const geometry = new PlaneGeometry(scaleX, scaleZ, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  // Position at top of water volume (Y = scaleY), offset by half scale to
  // put the corner at the origin.
  geometry.translate(scaleX / 2, scaleY, scaleZ / 2);
  return geometry;
}

function setupWaterTexture(texture: Texture, anisotropy: number) {
  setupTexture(texture, { anisotropy });
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
}

/**
 * Whether two states of a block draw the same surface (its water body
 * may still differ).
 */
function sameSurface(a: SceneWaterBlock, b: SceneWaterBlock): boolean {
  return (
    a.surfaceName === b.surfaceName &&
    a.envMapName === b.envMapName &&
    a.surfaceOpacity === b.surfaceOpacity &&
    a.waveMagnitude === b.waveMagnitude &&
    a.envMapIntensity === b.envMapIntensity &&
    JSON.stringify([a.transform, a.scale]) ===
      JSON.stringify([b.transform, b.scale])
  );
}

/**
 * A WaterBlock with Tribes 2-accurate animation.
 *
 * The water surface uses a custom shader that replicates the original Torque
 * engine's multi-pass rendering:
 * - Dual cross-faded base textures with 30° rotation
 * - Sinusoidal wave displacement
 * - Environment map reflection with animated UVs
 *
 * Water tiling follows Torque's FluidQuadTree.cc behavior:
 * - Determines camera's terrain "rep" via I = (s32)(m_Eye.X / 2048.0f)
 * - Renders 9 reps (3x3 grid) centered on camera's rep, as one instanced
 *   mesh sharing a single material and animation
 *
 * Until its textures load, each rep is a cyan wireframe.
 */
export function createWaterView(
  entity: WaterBlockEntity,
  engine: GameEngine,
): EntityView {
  let scene = entity.waterData;
  const root = new Group();
  root.name = entity.id;
  const group = new Group();
  group.quaternion.copy(matrixFToQuaternion(scene.transform));
  root.add(group);

  const position = torqueToThree(scene.transform.position);
  const scale = torqueToThree(scene.scale);
  const [scaleX, scaleY, scaleZ] = scale;
  const boxCenter: Vec3Tuple = [
    position[0] + scaleX / 2,
    position[1] + scaleY / 2,
    position[2] + scaleZ / 2,
  ];
  const basePosition = waterBasePosition(position);
  const surfaceGeometry = createSurfaceGeometry(scale);

  // Register the water body for projectile collision and the underwater
  // screen filter. Surface = position.z + scale.z (WaterBlock's mSurfaceZ).
  // Keyed by ghost: a map's several water blocks all register, and one
  // going away doesn't wipe the others.
  let bodyId = `ghost:${scene.ghostIndex}`;
  setWaterBody(bodyId, waterInfoFor(scene));

  // The grid only changes when the camera crosses a 2048-unit rep
  // boundary, so gate on the integer rep index. Start from the current
  // camera so water is visible immediately.
  const initialCamera = engine.cameras.active;
  let repX = cameraRepIndex(initialCamera.position.x);
  let repZ = cameraRepIndex(initialCamera.position.z);
  let reps = buildRepGrid(repX, repZ);

  const fallbackMaterial = new MeshStandardMaterial({
    color: "#00fbff",
    transparent: true,
    opacity: 0.4,
    wireframe: true,
    side: DoubleSide,
  });
  const fallbackMeshes = reps.map(() => {
    const mesh = new Mesh(surfaceGeometry, fallbackMaterial);
    group.add(mesh);
    return mesh;
  });

  let water: { mesh: InstancedMesh; material: ShaderMaterial } | null = null;
  let elapsed = 0;
  let disposed = false;

  const placeReps = () => {
    if (water) {
      const { mesh } = water;
      for (let i = 0; i < reps.length; i++) {
        _repMatrix.makeTranslation(...repOrigin(basePosition, reps[i]));
        mesh.setMatrixAt(i, _repMatrix);
      }
      mesh.count = reps.length;
      mesh.instanceMatrix.needsUpdate = true;
    } else {
      for (let i = 0; i < fallbackMeshes.length; i++)
        fallbackMeshes[i].position.fromArray(repOrigin(basePosition, reps[i]));
    }
  };
  placeReps();

  let fallbackShown = true;
  const removeFallback = () => {
    if (!fallbackShown) return;
    fallbackShown = false;
    for (const mesh of fallbackMeshes) group.remove(mesh);
    fallbackMaterial.dispose();
  };

  void engine
    .whenHost()
    .then(({ renderer }) => {
      const anisotropy = renderer.capabilities.getMaxAnisotropy();
      return loadTextures(
        [
          textureToUrl(scene.surfaceName || "liquidTiles/BlueWater"),
          textureToUrl(scene.envMapName || "special/lush_env"),
        ],
        renderer,
        (texture) => setupWaterTexture(texture, anisotropy),
      );
    })
    .then(
      ([baseTexture, envMapTexture]) => {
        if (disposed) return;
        const material = createWaterMaterial({
          opacity: scene.surfaceOpacity,
          waveMagnitude: scene.waveMagnitude,
          envMapIntensity: scene.envMapIntensity,
          baseTexture,
          envMapTexture,
        });
        const mesh = new InstancedMesh(surfaceGeometry, material, 9);
        mesh.frustumCulled = false;
        mesh.renderOrder = -1;
        removeFallback();
        group.add(mesh);
        water = { mesh, material };
        placeReps();
        engine.invalidate();
      },
      (error: unknown) => {
        if (disposed) return;
        // Like a shape that fails to load: draw nothing.
        log.error("water textures failed: %o", error);
        removeFallback();
        engine.invalidate();
      },
    );

  return {
    root,
    update(next) {
      if (
        next.renderType !== "WaterBlock" ||
        !sameSurface(scene, next.waterData)
      )
        return false;
      if (next.waterData !== scene) {
        setWaterBody(bodyId, null);
        scene = next.waterData;
        bodyId = `ghost:${scene.ghostIndex}`;
        setWaterBody(bodyId, waterInfoFor(scene));
      }
      return true;
    },
    dispose: combineCleanups(
      () => {
        disposed = true;
        setWaterBody(bodyId, null);
        removeFallback();
        if (water) {
          group.remove(water.mesh);
          water.mesh.dispose();
          water.material.dispose();
        }
        surfaceGeometry.dispose();
      },
      // Debug wireframe showing the actual water block bounds.
      reaction(settingsStore, selectDebugMode, (debugMode) => {
        if (!debugMode) return;
        const geometry = new BoxGeometry(scaleX, scaleY, scaleZ);
        const material = new MeshBasicMaterial({
          color: "#00fbff",
          wireframe: true,
        });
        const box = new Mesh(geometry, material);
        box.position.fromArray(boxCenter);
        group.add(box);
        engine.invalidate();
        return () => {
          group.remove(box);
          geometry.dispose();
          material.dispose();
          engine.invalidate();
        };
      }),
      showWhileDebugTourTarget(group, entity.id, () => {
        const lines = createDebugBounds(scale);
        lines.position.fromArray(boxCenter);
        return lines;
      }),
      engine.scheduler.add(FramePriority.PostCamera, ({ camera, delta }) => {
        const x = cameraRepIndex(camera.position.x);
        const z = cameraRepIndex(camera.position.z);
        if (x !== repX || z !== repZ) {
          repX = x;
          repZ = z;
          reps = buildRepGrid(x, z);
          placeReps();
        }

        if (!water) return;
        if (!settingsStore.getState().animationEnabled) elapsed = 0;
        else elapsed += worldDeltaSec(delta);
        water.material.uniforms.uTime.value = elapsed;
        // Keep the submersion test's wave phase in sync with the rendering.
        setWaterTime(elapsed);
      }),
    ),
  };
}
