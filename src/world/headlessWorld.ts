/**
 * Builds the collidable world in bare Node, from the same ghost data
 * the browser renders.
 *
 * The director's camera rig raycasts against interiors, mission
 * statics, force fields and terrain to place cameras, test
 * line-of-sight and find the ground. In the browser that geometry is a
 * side effect of MOUNTING components; a headless scan has to assemble
 * the same colliders itself or every shot lands somewhere different.
 *
 * Placement and collider-selection rules are deliberately NOT
 * reimplemented here — they come from `./placement` and
 * `./colliderPolicy`, which the React components also use. If the two
 * ever disagree the shots diverge silently, so there is exactly one
 * copy of each rule.
 *
 * Ghosts come and go mid-match, so this is a SYNC, not a build: call
 * `sync()` with the current entity set as often as you like and it
 * registers what is new, drops what left, and updates what changed.
 *
 * NOTE: reads of the collision registry — `castWorldRay`,
 * `getColliderDump`, `getWorldColliderCounts` — must happen inside
 * `run()`. Outside it they resolve to the shared default world, which
 * is empty, and fail SILENTLY: no error, just no colliders and every
 * ray missing. `stats()` counts the registry precisely so it cannot
 * report a healthy world while that is happening.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { Group, Mesh, Object3D } from "three";
import {
  registerForceFieldCollider,
  registerInteriorCollider,
  registerStaticShapeCollider,
  setForceFieldEnabled,
  unregisterForceFieldCollider,
  unregisterInteriorCollider,
  unregisterStaticShapeCollider,
} from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import { getActualResourceKey, getSourceAndPath } from "../manifest";
import { parseTerrainBuffer } from "../terrain";
import { createLogger } from "../logger";
import type {
  SceneInteriorInstance,
  SceneTerrainBlock,
  SceneTSStatic,
  SceneWaterBlock,
} from "../scene/types";
import {
  INTERIOR_MODEL_ROTATION_Y,
  SHAPE_MODEL_ROTATION_Y,
  forceFieldCollider,
  interiorPlacement,
  streamEntityPlacement,
  terrainCollisionInput,
  waterInfoFor,
} from "./placement";
import { setWaterBody } from "../collision/waterLevel";
import {
  interiorColliderMeshes,
  OCCLUDER_SHAPE_TYPES,
  staticShapeColliderMeshes,
} from "./colliderPolicy";
import { glbMeshes, loadGlbScene } from "./nodeGltf";
import { isOrganicShape } from "../organicShapes";
import {
  createCollisionState,
  runInCollisionWorld,
  type CollisionState,
} from "./nodeCollisionContext";

const log = createLogger("headlessWorld");

/** Where the extracted game assets live, mirroring `getLocalFilePath`. */
const DEFAULT_ASSET_ROOT = "docs/base";

/** Minimum entity shape needed to build the world — a structural subset
 *  of the stream's MutableEntity, so both live and demo sources fit. */
export interface WorldEntity {
  id: string;
  /** The game's own identity for this object. Used as the collider key
   *  because `id` is a per-session counter that differs between the
   *  browser and a headless build, making dumps incomparable. */
  ghostIndex?: number;
  className?: string;
  type?: string;
  dataBlock?: string;
  shapeHint?: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  fieldOpen?: boolean;
  forceFieldData?: { dimensions: [number, number, number] };
  sceneData?: unknown;
}

export interface HeadlessWorldOptions {
  /** Root of the extracted assets. Relative paths resolve from cwd. */
  assetRoot?: string;
  /** Skip mission statics (TSStatic/StaticShape). They are camera
   *  occluders only, so projectile-physics-only consumers can save the
   *  load time. */
  includeStatics?: boolean;
}

type ColliderKind = "interior" | "static" | "forceField";

export class HeadlessWorld {
  private readonly assetRoot: string;
  private readonly includeStatics: boolean;
  /** This world's own collision registry. Everything this class does,
   *  and everything run through `run()`, sees THIS state and not any
   *  other world's — so several matches can be cast in one process. */
  readonly state: CollisionState = createCollisionState();
  /** Ghost slot → what is registered there, and WHICH object put it
   *  there. Slots are reused, so the occupant is what distinguishes
   *  "already done" from "a different object moved in". */
  private readonly registered = new Map<
    string,
    { kind: ColliderKind; occupant: string }
  >();
  /** Adds that are still loading. A live booth ticks far faster than a
   *  GLB loads, and `registered` is only written after the await — so
   *  without this, re-entrant syncs re-load and re-BVH everything they
   *  have already started. Measured at exactly 3x for three overlapping
   *  syncs before this existed. */
  private readonly inFlight = new Map<string, Promise<void>>();
  /** Force-field open state, so we only re-register on a real change. */
  private readonly fieldEnabled = new Map<string, boolean>();
  /** Per-id geometry totals. Kept per id rather than as running
   *  counters so that dropping a collider actually subtracts it —
   *  running totals drifted upward as ghosts came and went. */
  private readonly geometryById = new Map<
    string,
    { meshes: number; triangles: number }
  >();
  private terrainFile: string | null = null;
  private terrainLoading: string | null = null;
  private readonly water = new Set<string>();
  private failed = new Set<string>();

  constructor(options: HeadlessWorldOptions = {}) {
    this.assetRoot = options.assetRoot ?? DEFAULT_ASSET_ROOT;
    this.includeStatics = options.includeStatics ?? true;
  }

  /**
   * Run `fn` against this world's collision registry.
   *
   * The director reaches collision through module-level functions
   * (`castWorldRay` in the trackers, the camera rig, the staging pass),
   * so the pipeline has to be RUN inside the world rather than handed
   * one. Nesting is fine — `sync()` wraps itself the same way.
   */
  run<T>(fn: () => T | Promise<T>): Promise<T> {
    return runInCollisionWorld(this.state, fn);
  }

  /** Resolve a game resource to a local file, mirroring the browser's
   *  `getUrlForPath` (including its fuzzy resource-key matching). */
  private localPath(resourcePath: string): string {
    const key = getActualResourceKey(resourcePath);
    const [source, actual] = getSourceAndPath(key);
    return source
      ? path.join(this.assetRoot, "@vl2", source, actual)
      : path.join(this.assetRoot, actual);
  }

  /**
   * Register what is new, drop what left, update what changed.
   *
   * Safe to call every tick: registration is keyed by entity id and
   * loaded GLBs are cached, so a steady-state call does no I/O.
   */
  async sync(entities: Iterable<WorldEntity>): Promise<void> {
    return this.run(() => this.syncInWorld(entities));
  }

  private async syncInWorld(entities: Iterable<WorldEntity>): Promise<void> {
    const seen = new Set<string>();
    const pending: Promise<void>[] = [];

    /**
     * Start an add unless this exact object is already registered or
     * loading.
     *
     * `occupant` is the entity id — the stream's per-instance counter —
     * and checking it is what makes slot reuse safe. Ghost indices are
     * SLOTS: the engine frees the slot on destroy
     * (`entityIdByGhostIndex.delete`) and issues a fresh
     * `allocateEntityId()` for whatever lands there next. Measured on
     * s5-damnation, a slot changes occupant with no observed gap 18-35
     * times a match depending on sample rate, and ghost 91 goes
     * projectile → deployed inventory station — a collider class. Key
     * on the slot alone and the new object never registers while the
     * old one's geometry stays behind, forever, in the wrong place.
     *
     * The COLLIDER key stays the slot, matching the browser and keeping
     * world dumps comparable; the occupant check is bookkeeping only.
     */
    const begin = (
      id: string,
      occupant: string,
      kind: ColliderKind,
      work: () => Promise<void>,
    ) => {
      const current = this.registered.get(id);
      if (current) {
        if (current.occupant === occupant) return;
        // Slot recycled: drop the previous tenant's geometry first.
        this.unregisterCollider(id, current.kind);
      }
      const flightKey = `${id}|${occupant}`;
      const existing = this.inFlight.get(flightKey);
      if (existing) {
        pending.push(existing);
        return;
      }
      const p = work().finally(() => this.inFlight.delete(flightKey));
      this.inFlight.set(flightKey, p);
      pending.push(p);
    };

    for (const rawEntity of entities) {
      // Key colliders on the ghost SLOT, matching what the React
      // components register — but remember which object is in it.
      const occupant = rawEntity.id;
      const entity: WorldEntity =
        rawEntity.ghostIndex != null
          ? { ...rawEntity, id: `ghost:${rawEntity.ghostIndex}` }
          : rawEntity;
      const className = entity.className ?? entity.type ?? "";

      if (className === "TerrainBlock" && entity.sceneData) {
        pending.push(this.syncTerrain(entity.sceneData as SceneTerrainBlock));
        continue;
      }

      if (className === "InteriorInstance" && entity.sceneData) {
        seen.add(entity.id);
        begin(entity.id, occupant, "interior", () =>
          this.addInterior(
            entity.id,
            occupant,
            entity.sceneData as SceneInteriorInstance,
          ),
        );
        continue;
      }

      if (className === "ForceFieldBare") {
        seen.add(entity.id);
        this.syncForceField(entity, occupant);
        continue;
      }

      if (className === "WaterBlock" && entity.sceneData) {
        // Projectiles that explode on water impact resolve against
        // this, and the scan simulates projectiles — so skipping water
        // would diverge from the browser on any map that has some.
        // Registered per ghost, exactly as the WaterBlock components
        // do: Damnation has two pools and BeachBlitz three bodies, and
        // all of them are rendered, so all of them must collide.
        // Re-set every sync rather than only on first sight: cheap, and
        // it cannot leave a recycled slot holding the old body.
        seen.add(entity.id);
        setWaterBody(
          entity.id,
          waterInfoFor(entity.sceneData as SceneWaterBlock),
        );
        this.water.add(entity.id);
        continue;
      }

      if (this.includeStatics && OCCLUDER_SHAPE_TYPES.has(className)) {
        seen.add(entity.id);
        begin(entity.id, occupant, "static", () =>
          this.addStaticShape(entity, occupant, className),
        );
        continue;
      }
    }

    await Promise.all(pending);

    // Drop water bodies that left scope.
    for (const id of this.water) {
      if (seen.has(id)) continue;
      setWaterBody(id, null);
      this.water.delete(id);
    }

    // Drop anything that left scope.
    for (const [id, entry] of [...this.registered]) {
      if (seen.has(id)) continue;
      this.unregisterCollider(id, entry.kind);
    }
  }

  private async syncTerrain(scene: SceneTerrainBlock): Promise<void> {
    // Same re-entrancy guard as the collider adds: `terrainFile` is only
    // set after the read and parse, so overlapping syncs would each
    // load the heightfield.
    if (
      this.terrainFile === scene.terrFileName ||
      this.terrainLoading === scene.terrFileName
    ) {
      return;
    }
    this.terrainLoading = scene.terrFileName;
    try {
      await this.loadTerrain(scene);
    } finally {
      this.terrainLoading = null;
    }
  }

  private async loadTerrain(scene: SceneTerrainBlock): Promise<void> {
    const file = this.localPath(`terrains/${scene.terrFileName}`);
    const buf = await readFile(file);
    const terrain = parseTerrainBuffer(
      buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer,
    );
    const input = terrainCollisionInput(scene, terrain);
    setTerrainCollisionData(input);
    this.terrainFile = scene.terrFileName;
    log.debug(
      "terrain %s registered (squareSize %d)",
      scene.terrFileName,
      input.squareSize,
    );
  }

  /** Drop one collider, whatever kind it is. */
  private unregisterCollider(id: string, kind: ColliderKind): void {
    if (kind === "interior") unregisterInteriorCollider(id);
    else if (kind === "static") unregisterStaticShapeCollider(id);
    else {
      unregisterForceFieldCollider(id);
      this.fieldEnabled.delete(id);
    }
    this.registered.delete(id);
    this.geometryById.delete(id);
  }

  private async addInterior(
    id: string,
    occupant: string,
    scene: SceneInteriorInstance,
  ): Promise<void> {
    const file = this.localPath(`interiors/${scene.interiorFile}`).replace(
      /\.dif$/i,
      ".glb",
    );
    const glb = await this.loadOrWarn(file, scene.interiorFile);
    if (!glb) return;

    // Mirror the browser's two-group structure exactly: an outer group
    // carrying the ghost transform, and an inner group holding the
    // fixed model rotation. The meshes are re-parented FLAT under the
    // inner group with identity local transforms, because that is what
    // `<mesh geometry={node.geometry} />` does in InteriorInstance —
    // the GLB's own node transforms are discarded there, and copying
    // them here would offset every collider.
    const { position, quaternion, scale } = interiorPlacement(scene);
    const root = new Group();
    root.position.set(...position);
    root.quaternion.copy(quaternion);
    root.scale.set(...scale);

    const model = new Group();
    model.rotation.set(0, INTERIOR_MODEL_ROTATION_Y, 0);
    root.add(model);
    for (const node of glbMeshes(glb)) {
      model.add(new Mesh((node as Mesh).geometry));
    }

    const meshes = interiorColliderMeshes(model);
    registerInteriorCollider(id, meshes);
    this.registered.set(id, { kind: "interior", occupant });
    this.countGeometry(id, meshes);
  }

  private async addStaticShape(
    entity: WorldEntity,
    occupant: string,
    className: string,
  ): Promise<void> {
    const sceneStatic = entity.sceneData as SceneTSStatic | undefined;
    const shapeName =
      className === "TSStatic"
        ? sceneStatic?.shapeName
        : (entity.shapeHint ?? entity.dataBlock);
    if (!shapeName) return;

    // Vegetation never becomes a collider, so don't pay to load it.
    // `staticShapeColliderMeshes` rejects it below anyway, but by then
    // the mesh has already been fetched and decoded — wasted work that
    // matters once assets come over the network per match rather than
    // off local disk.
    if (isOrganicShape(shapeName)) return;

    const file = this.localPath(`shapes/${shapeName}`).replace(
      /\.dts$/i,
      ".glb",
    );
    const glb = await this.loadOrWarn(file, shapeName);
    if (!glb) return;

    // Statics keep their GLB hierarchy (GenericShape renders the cloned
    // scene as-is and traverses it), so clone rather than flatten.
    //
    // Placement comes from the ENTITY, never from `sceneData.transform`
    // — including for TSStatic. Shapes are positioned entities: the
    // stream carries their position in Torque space and
    // `StreamingController` swizzles it onto the group each frame,
    // while the rotation quaternion is applied raw. Then GenericShape
    // nests the model under a +90° yaw. All three parts matter — the
    // browser had this map's first static at (-43.25, 148.36, 449.22)
    // rotated +45°, against (449.22, -43.25, 148.36) at -45° before
    // this matched the browser's structure.
    const { position, rotation } = streamEntityPlacement(entity);
    const root = new Group();
    root.position.set(...position);
    root.quaternion.set(...rotation);
    if (entity.scale) root.scale.set(...entity.scale);

    const model = new Group();
    model.rotation.set(0, SHAPE_MODEL_ROTATION_Y, 0);
    root.add(model);
    const instance = glb.clone(true);
    model.add(instance);

    const meshes = staticShapeColliderMeshes({
      root: instance,
      // Everything reaching here is an occluder class; `entityBridge`
      // maps unknown classNames to StaticShape, so match that.
      type: className === "TSStatic" ? "TSStatic" : "StaticShape",
      shapeName,
    });
    if (!meshes) return;
    registerStaticShapeCollider(entity.id, meshes);
    this.registered.set(entity.id, { kind: "static", occupant });
    this.countGeometry(entity.id, meshes);
  }

  private syncForceField(entity: WorldEntity, occupant: string): void {
    const collider = forceFieldCollider(entity);
    if (!collider) return;
    const current = this.registered.get(entity.id);
    // A recycled slot re-registers from scratch rather than being
    // mistaken for the field that used to be there.
    const wasEnabled =
      current?.occupant === occupant
        ? this.fieldEnabled.get(entity.id)
        : undefined;
    if (current?.occupant !== occupant) {
      registerForceFieldCollider(
        entity.id,
        collider.matrix,
        collider.box,
        collider.enabled,
      );
      this.registered.set(entity.id, { kind: "forceField", occupant });
    } else if (wasEnabled !== collider.enabled) {
      // The one collider that changes during a match: a field that
      // opens stops blocking rays.
      setForceFieldEnabled(entity.id, collider.enabled);
    }
    this.fieldEnabled.set(entity.id, collider.enabled);
  }

  private async loadOrWarn(
    file: string,
    name: string,
  ): Promise<Object3D | null> {
    try {
      return await loadGlbScene(file);
    } catch (err) {
      if (!this.failed.has(name)) {
        this.failed.add(name);
        log.warn("could not load %s: %s", name, (err as Error).message);
      }
      return null;
    }
  }

  private countGeometry(id: string, meshes: Mesh[]): void {
    let triangles = 0;
    for (const mesh of meshes) {
      const index = mesh.geometry?.index;
      if (index) triangles += index.count / 3;
    }
    this.geometryById.set(id, { meshes: meshes.length, triangles });
  }

  stats(): {
    interiors: number;
    statics: number;
    forceFields: number;
    terrain: string | null;
    waterBlocks: number;
    meshes: number;
    triangles: number;
    failedAssets: number;
  } {
    // Counted from the REGISTRY, not from this class's own bookkeeping.
    // Those two can disagree — a caller that reaches the registry
    // outside `run()` writes to the shared default world instead of
    // this one — and when they did, stats reported a healthy world
    // while every ray missed. Reading the registry means stats cannot
    // lie about it.
    const interiors = this.state.interiors.size;
    const statics = this.state.staticShapes.size;
    const forceFields = this.state.forceFields.size;
    let meshes = 0;
    let triangles = 0;
    for (const g of this.geometryById.values()) {
      meshes += g.meshes;
      triangles += g.triangles;
    }
    return {
      interiors,
      statics,
      forceFields,
      terrain: this.terrainFile,
      waterBlocks: this.water.size,
      meshes,
      triangles,
      failedAssets: this.failed.size,
    };
  }

  /** Release this world's geometry. Only this world's — it clears its
   *  own state bag rather than a process-wide registry, so disposing one
   *  match's world leaves any other running match untouched. */
  dispose(): void {
    this.state.interiors.clear();
    this.state.staticShapes.clear();
    this.state.forceFields.clear();
    this.state.terrain = null;
    this.state.water.clear();
    this.water.clear();
    this.geometryById.clear();
    this.inFlight.clear();
    this.terrainLoading = null;
    this.registered.clear();
    this.fieldEnabled.clear();
    this.terrainFile = null;
  }
}
