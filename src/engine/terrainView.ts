import {
  Box3,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector2,
  Vector3,
  type Material,
} from "three";
import { createLogger } from "../logger";
import {
  gameEntityStore,
  selectSkyData,
  selectSunData,
  type GameEntityState,
} from "../state/gameEntityStore";
import type { TerrainBlockEntity } from "../state/gameEntityTypes";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import type { SceneSun, SceneTerrainBlock } from "../scene/types";
import { torqueToThree } from "../scene/coordinates";
import {
  LIGHTMAP_SIZE,
  TERRAIN_SIZE,
  terrainHeightToWorld,
  type TerrainFile,
} from "../terrain";
import { packMasksRGB } from "../textureUtils";
import {
  bakeTerrainLightmap,
  type TerrainLightmapBake,
} from "../terrainLightmap";
import { createInteriorSunOccluder } from "../terrainInteriorShadow";
import { setShadowCasterBounds } from "../shadowBounds";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import { registerCollisionLoadFailure } from "../collision/collisionContext";
import { setTerrainLightmap } from "../shapeLighting";
import { clearFogTerrainRows, setFogTerrainRows } from "../globalFogUniforms";
import {
  DEFAULT_TERRAIN_SQUARE_SIZE,
  terrainCollisionInput,
} from "../world/placement";
import { onTerrainLightmapInvalidated } from "./terrainLightmapControl";
import { invalidateShadows } from "./shadowControl";
import { freezeStaticMatrices, unfreezeStaticMatrices } from "./staticMatrices";
import { createDebugBounds, showWhileDebugTourTarget } from "./debugVisuals";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction, type Cleanup } from "./storeReaction";
import { acquireTerrain } from "./terrainCache";
import {
  createTerrainGeometry,
  createVisibilityMask,
  displaceTerrainAndComputeNormals,
} from "./terrainGeometry";
import {
  createBlendedTerrainMaterial,
  createTerrainFallbackMaterial,
  loadTerrainTextures,
  type BlendedTerrainMaterial,
} from "./terrainTileMaterial";
import type { EntityView } from "./entityViews";
import type { GameEngine } from "./gameEngine";

const log = createLogger("TerrainBlock");

const DEFAULT_VISIBLE_DISTANCE = 600;

/**
 * The command circuit overview needs tiles covering the whole map, far
 * beyond the sky's visibleDistance.
 */
const COMMAND_CIRCUIT_VISIBLE_DISTANCE = 3072;

type SunOccluder = (x: number, y: number, z: number) => boolean;

const _tileMatrix = new Matrix4();
const _viewportSize = new Vector2();

/**
 * The Sky's visibleDistance, used to determine how far terrain tiles
 * should render. This matches Tribes 2's terrain tiling behavior.
 */
function selectSkyVisibleDistance(state: GameEntityState): number {
  const visibleDistance = selectSkyData(state)?.visibleDistance ?? 0;
  return visibleDistance > 0 ? visibleDistance : DEFAULT_VISIBLE_DISTANCE;
}

/**
 * Sun direction for lightmap generation (pointing from the sun).
 */
function sunDirectionOf(sun: SceneSun | null): Vector3 {
  if (!sun) return new Vector3(0.57735, -0.57735, 0.57735); // Default diagonal
  const [x, y, z] = torqueToThree(sun.direction);
  const len = Math.sqrt(x * x + y * y + z * z);
  return new Vector3(x / len, y / len, z / len);
}

function sameTerrainBlock(a: SceneTerrainBlock, b: SceneTerrainBlock) {
  const aRuns = a.emptySquareRuns ?? [];
  const bRuns = b.emptySquareRuns ?? [];
  return (
    a.terrFileName === b.terrFileName &&
    a.squareSize === b.squareSize &&
    a.detailTextureName === b.detailTextureName &&
    a.ghostIndex === b.ghostIndex &&
    aRuns.length === bRuns.length &&
    aRuns.every((run, i) => run === bRuns[i])
  );
}

/**
 * The terrain block: the primary tile (with the mission's empty squares)
 * and pooled copies repeated around the camera out to the visible
 * distance, lit by a lightmap that bakes in terrain and building shadows.
 * It also publishes the heightfield for collision and volume fog, the
 * lightmap for shape lighting, and its bounds for the sun's shadow camera.
 * It places itself, so its root is not posed from the entity.
 */
export function createTerrainView(
  entity: TerrainBlockEntity,
  engine: GameEngine,
): EntityView {
  const root = new Group();
  root.name = entity.id;
  const scene = entity.terrainData;
  const terrainFile = scene.terrFileName;
  const squareSize = scene.squareSize || DEFAULT_TERRAIN_SQUARE_SIZE;
  const detailTextureName = scene.detailTextureName || undefined;
  const blockSize = squareSize * TERRAIN_SIZE;
  // Torque ignores the mission's terrain position and always uses a fixed formula:
  // setPosition(Point3F(-squareSize * (BlockSize >> 1), -squareSize * (BlockSize >> 1), 0));
  // where BlockSize = 256. See tribes2-engine/terrain/terrData.cc:679
  const offset = -squareSize * (TERRAIN_SIZE / 2);
  const basePosition = { x: offset, z: offset };

  // Terrain never moves: the tile mesh and the pooled InstancedMesh keep
  // fixed object transforms (pooled tiles reposition via instance
  // matrices, which are independent of matrixAutoUpdate). This subtree is
  // frozen so three stops recomposing the matrices every frame.
  const staticRoot = new Group();
  root.add(staticRoot);

  // Visibility mask for primary tile (0,0) - may have empty squares
  const primaryVisibilityMask = createVisibilityMask(
    scene.emptySquareRuns ?? [],
  );
  // Visibility mask for pooled tiles - all visible (no empty squares)
  const pooledVisibilityMask = createVisibilityMask([]);
  // Physical viewport height for the detail texture's fade distance.
  const detailViewportHeight = { value: 0 };

  let disposed = false;
  let terrain: TerrainFile | null = null;
  let stopTerrain: Cleanup;

  // ── Lightmap bake ──

  let sun: SceneSun | null = null;
  let sunDirection = sunDirectionOf(null);
  // Buildings are baked into the lightmap, so the occluder is rebuilt as
  // interiors stream in (invalidations are coalesced in the control
  // module) and a new one re-runs the bake.
  let interiorOccluder: SunOccluder | null = null;
  let bake: TerrainLightmapBake | null = null;
  let bakeDone = false;
  let stopBake: Cleanup;
  /**
   * The tile materials, once their textures have loaded.
   */
  let blendedMaterials: BlendedTerrainMaterial[] = [];

  // The ground is lit immediately; hard shadows arrive over the next frames
  // and their edges are then averaged, all against a per-frame budget so a
  // 1024² bake never stalls the load the way one blocking pass would.
  const rebake = () => {
    if (!terrain) return;
    stopBake?.();
    const next = bakeTerrainLightmap(
      terrain.heightMap,
      sunDirection,
      squareSize,
      { x: basePosition.x, z: basePosition.z },
      interiorOccluder,
    );
    bake = next;
    bakeDone = false;
    const lightmap = next.texture;
    for (const material of blendedMaterials) material.setLightmap(lightmap);
    // Shapes standing on terrain are lit from the lightmap texel under them
    // (the terrain shader's own formula, ambient + NdotL × sun).
    setTerrainLightmap({
      ndotl: lightmap.image.data as Uint8Array,
      size: LIGHTMAP_SIZE,
      squareSize,
      originX: basePosition.z,
      originY: basePosition.x,
      sunColor: sun
        ? new Color(sun.color.r, sun.color.g, sun.color.b)
        : new Color(0.7, 0.7, 0.7),
      ambient: sun
        ? new Color(sun.ambient.r, sun.ambient.g, sun.ambient.b)
        : new Color(0.533, 0.533, 0.533),
    });
    stopBake = () => {
      setTerrainLightmap(null);
      // A re-bake (interiors finished loading) builds a new texture; the
      // old one's GPU copy has to be released or it leaks for the session.
      lightmap.dispose();
    };
    engine.invalidate();
  };

  const createOccluder = () =>
    createInteriorSunOccluder(
      new Vector3(-sunDirection.x, -sunDirection.y, -sunDirection.z),
    );

  // ── Tile pool ──

  let skyVisibleDistance = selectSkyVisibleDistance(gameEntityStore.getState());
  let commandCircuitActive = commandCircuitStore.getState().active;
  let visibleDistance = skyVisibleDistance;
  let poolSize = 0;
  /**
   * Rebuilds the pooled InstancedMesh at the current pool size.
   */
  let repool: (() => void) | null = null;
  let pooledMesh: InstancedMesh | null = null;
  // Track previous tile bounds to avoid unnecessary instance matrix updates.
  const prevBounds = {
    xStart: Infinity,
    xEnd: -Infinity,
    zStart: Infinity,
    zEnd: -Infinity,
  };
  // Track which mesh instance we last updated — when the pool is rebuilt
  // (poolSize changes), we must force a full update even if the camera
  // bounds haven't changed.
  let lastMesh: InstancedMesh | null = null;

  const updateVisibleDistance = () => {
    visibleDistance = commandCircuitActive
      ? Math.max(skyVisibleDistance, COMMAND_CIRCUIT_VISIBLE_DISTANCE)
      : skyVisibleDistance;
    // The maximum number of tiles that can be visible at once.
    const extent = Math.ceil(visibleDistance / blockSize);
    const gridSize = 2 * extent + 1;
    const size = gridSize * gridSize - 1; // -1 because primary tile is separate
    if (size === poolSize) return;
    poolSize = size;
    repool?.();
  };

  // ── Terrain ──

  function showTerrain(loaded: TerrainFile): () => void {
    // Shared geometry for all tiles - with smooth normals computed from heightmap
    // Uses Torque-style alternating diagonal triangulation for accurate terrain
    const geometry = createTerrainGeometry(blockSize, TERRAIN_SIZE);
    // Displace vertices on CPU and compute smooth normals
    displaceTerrainAndComputeNormals(geometry, loaded.heightMap, squareSize);
    // Pack alpha masks into RGB textures (3 masks per texture) to reduce
    // sampler count. 6 layers → 2 RGB textures instead of 6 R textures.
    const alphaTextures = packMasksRGB(loaded.alphaMaps);

    // Register terrain height sampler for item physics simulation, and the
    // raw heightfield for projectile ray collision.
    setTerrainCollisionData(terrainCollisionInput(scene, loaded));
    // Volume-fog height rows span the heightfield's min..max, mirroring
    // the engine's 64-row fog texture (it reads the same range from the
    // terrain's stored height extremes).
    const minHeight = terrainHeightToWorld(loaded.minHeight);
    const maxHeight = terrainHeightToWorld(loaded.maxHeight);
    setFogTerrainRows(minHeight, maxHeight);
    // The sun's shadow camera is fitted to what casts; the terrain block is
    // the largest caster and sets the frustum on every map.
    setShadowCasterBounds(
      "terrain",
      new Box3(
        new Vector3(basePosition.x, minHeight, basePosition.z),
        new Vector3(
          basePosition.x + blockSize,
          maxHeight,
          basePosition.z + blockSize,
        ),
      ),
    );

    // Each mesh draws a wireframe until the textures load.
    const fallbackMaterial = createTerrainFallbackMaterial();
    let pooledMaterial: Material = fallbackMaterial;

    // Primary tile at (0,0) with emptySquares applied. Terrain geometry is
    // centered at origin. Torque's terrain position formula is
    // -squareSize * 128, which equals -blockSize / 2. Since our geometry is
    // already centered, basePosition + geometryOffset cancels to 0.
    const geometryOffset = blockSize / 2;
    const primary = new Mesh(geometry, fallbackMaterial);
    primary.position.set(
      basePosition.x + geometryOffset,
      0,
      basePosition.z + geometryOffset,
    );
    // Casts only; see the pooled mesh for why.
    primary.castShadow = true;
    staticRoot.add(primary);
    // Shadow map is frozen (shadowControl.ts); re-render it when this
    // caster appears or goes.
    invalidateShadows();

    // Pooled tiles — single InstancedMesh, matrices updated each frame.
    // All pooled tiles share the same geometry, material, and visibility
    // mask. Only position differs (set via instance matrices).
    const buildPool = () => {
      const mesh = new InstancedMesh(geometry, pooledMaterial, poolSize);
      // Casts (a hill shadows a building) but never receives: the ground's
      // own shadowing is baked into the terrain lightmap, which is what
      // keeps it free of acne and of bias pulling shadows off the slope.
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      staticRoot.add(mesh);
      pooledMesh = mesh;
    };
    const removePool = () => {
      if (!pooledMesh) return;
      staticRoot.remove(pooledMesh);
      pooledMesh.dispose();
      pooledMesh = null;
    };
    buildPool();
    freezeStaticMatrices(staticRoot);
    repool = () => {
      unfreezeStaticMatrices(staticRoot);
      removePool();
      buildPool();
      freezeStaticMatrices(staticRoot);
      engine.invalidate();
    };

    rebake();

    let stopped = false;
    void engine
      .whenHost()
      .then(({ renderer }) =>
        loadTerrainTextures(loaded.textureNames, detailTextureName, renderer),
      )
      .then(
        (textures) => {
          if (stopped) return;
          const debugMode = selectDebugMode(settingsStore.getState());
          const lightmap = bake!.texture;
          const primaryBlend = createBlendedTerrainMaterial(textures, {
            visibilityMask: primaryVisibilityMask,
            alphaTextures,
            squareSize,
            detailViewportHeight,
            lightmap,
            debugMode,
          });
          const pooledBlend = createBlendedTerrainMaterial(textures, {
            visibilityMask: pooledVisibilityMask,
            alphaTextures,
            squareSize,
            detailViewportHeight,
            lightmap,
            debugMode,
          });
          blendedMaterials = [primaryBlend, pooledBlend];
          primary.material = primaryBlend.material;
          pooledMaterial = pooledBlend.material;
          if (pooledMesh) pooledMesh.material = pooledMaterial;
          fallbackMaterial.dispose();
          engine.invalidate();
        },
        (error: unknown) => {
          if (stopped) return;
          log.error("Failed to load textures for %s: %o", terrainFile, error);
        },
      );

    engine.invalidate();

    return combineCleanups(
      () => {
        stopped = true;
        setTerrainCollisionData(null);
        clearFogTerrainRows();
        setShadowCasterBounds("terrain", null);
        repool = null;
        unfreezeStaticMatrices(staticRoot);
        removePool();
        staticRoot.remove(primary);
        invalidateShadows();
        fallbackMaterial.dispose();
        for (const { material } of blendedMaterials) material.dispose();
        blendedMaterials = [];
        geometry.dispose();
        for (const texture of alphaTextures) texture.dispose();
      },
      showWhileDebugTourTarget(staticRoot, entity.id, () => {
        let maxH = 0;
        for (let i = 0; i < loaded.heightMap.length; i++) {
          const h = terrainHeightToWorld(loaded.heightMap[i]);
          if (h > maxH) maxH = h;
        }
        const lines = createDebugBounds([blockSize, maxH, blockSize]);
        lines.position.set(
          basePosition.x + blockSize / 2,
          maxH / 2,
          basePosition.z + blockSize / 2,
        );
        return lines;
      }),
    );
  }

  const terrainHandle = acquireTerrain(terrainFile);
  void terrainHandle.promise.then(
    (loaded) => {
      if (disposed) return;
      log.debug("Terrain ready: %s", terrainFile);
      terrain = loaded;
      stopTerrain = showTerrain(loaded);
    },
    (error: unknown) => {
      if (disposed) return;
      log.debug(
        "Terrain failed: %s error=%s",
        terrainFile,
        (error as Error).message,
      );
      stopTerrain = registerCollisionLoadFailure(scene.ghostIndex);
    },
  );

  const stopSystems = combineCleanups(
    reaction(gameEntityStore, selectSunData, (data) => {
      sun = data;
      sunDirection = sunDirectionOf(data);
      interiorOccluder = createOccluder();
      rebake();
    }),
    onTerrainLightmapInvalidated(() => {
      const next = createOccluder();
      // Rebuilding to the same "nothing can cast" leaves the bake alone.
      if (next === interiorOccluder) return;
      interiorOccluder = next;
      rebake();
    }),
    reaction(gameEntityStore, selectSkyVisibleDistance, (distance) => {
      skyVisibleDistance = distance;
      updateVisibleDistance();
    }),
    reaction(
      commandCircuitStore,
      (state) => state.active,
      (active) => {
        commandCircuitActive = active;
        updateVisibleDistance();
      },
    ),
    reaction(settingsStore, selectDebugMode, (debugMode) => {
      if (blendedMaterials.length === 0) return;
      for (const material of blendedMaterials) material.setDebugMode(debugMode);
      engine.invalidate();
    }),
    engine.scheduler.add(FramePriority.PostCamera, () => {
      if (bake && !bakeDone) bakeDone = bake.step(8);
    }),
    engine.scheduler.add(FramePriority.PostCamera, ({ camera }) => {
      const mesh = pooledMesh;
      if (!mesh) return;
      const relativeCamX = camera.position.x - basePosition.x;
      const relativeCamZ = camera.position.z - basePosition.z;
      const xStart = Math.floor((relativeCamX - visibleDistance) / blockSize);
      const xEnd = Math.ceil((relativeCamX + visibleDistance) / blockSize);
      const zStart = Math.floor((relativeCamZ - visibleDistance) / blockSize);
      const zEnd = Math.ceil((relativeCamZ + visibleDistance) / blockSize);
      // Early exit if bounds haven't changed AND we're still on the same mesh.
      if (
        mesh === lastMesh &&
        xStart === prevBounds.xStart &&
        xEnd === prevBounds.xEnd &&
        zStart === prevBounds.zStart &&
        zEnd === prevBounds.zEnd
      ) {
        return;
      }
      lastMesh = mesh;
      prevBounds.xStart = xStart;
      prevBounds.xEnd = xEnd;
      prevBounds.zStart = zStart;
      prevBounds.zEnd = zEnd;
      const geometryOffset = blockSize / 2;
      let count = 0;
      for (let x = xStart; x < xEnd; x++) {
        for (let z = zStart; z < zEnd; z++) {
          if (x === 0 && z === 0) continue;
          _tileMatrix.makeTranslation(
            basePosition.x + x * blockSize + geometryOffset,
            0,
            basePosition.z + z * blockSize + geometryOffset,
          );
          mesh.setMatrixAt(count, _tileMatrix);
          count++;
        }
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      // Pooled tiles are shadow casters; their repositioning invalidates the
      // frozen shadow map (rare — only when the camera crosses a block).
      invalidateShadows();
    }),
    engine.scheduler.add(FramePriority.PostCamera, ({ renderer }) => {
      // dglProjectRadius uses the physical viewport: CSS height × DPR.
      detailViewportHeight.value =
        renderer.getSize(_viewportSize).y * renderer.getPixelRatio();
    }),
  );

  return {
    root,
    update(next) {
      // Same block: an identity rebuild in the store changes nothing here.
      return (
        next.renderType === "TerrainBlock" &&
        sameTerrainBlock(scene, next.terrainData)
      );
    },
    dispose() {
      disposed = true;
      stopSystems();
      stopTerrain?.();
      stopTerrain = undefined;
      stopBake?.();
      stopBake = undefined;
      bake = null;
      terrain = null;
      terrainHandle.release();
      primaryVisibilityMask.dispose();
      pooledVisibilityMask.dispose();
    },
  };
}
