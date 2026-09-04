import { createLogger } from "../logger";
import { getClassTypeMask, TYPE_MASKS } from "./classHierarchy";
import type { TorqueObject, TorqueRuntime } from "./types";
import {
  composeThreeTransforms,
  objectFieldsToThree,
  threeQuatToMisRotation,
  threeToMisPosition,
  threeToTransformString,
  transformStringToThree,
  type Quat,
  type Vec3,
} from "./vecMath";
import { getMountTransforms, type MountTransformTable } from "../manifest";

const log = createLogger("engineMethods");

export interface EngineStubOptions {
  /** Mount-node transform table; injectable for tests. */
  mountTransforms?: MountTransformTable;
}

function toU32(value: any): number {
  return (Number(value) | 0) >>> 0;
}

/**
 * Register C++ engine methods that TorqueScript code expects to exist.
 * These are the methods the Torque engine implements natively (on classes
 * like SimObject, SimSet, ShapeBase, GameBase) and that game scripts call
 * during mission load (power.cs, staticShape.cs, station.cs, item.cs,
 * forceField.cs, …). State the renderer needs is recorded on the
 * TorqueObject in `_`-prefixed fields (`_threads`, `_mountedImages`,
 * `_targetSkin`, …). Fields written via setProp are lower-cased and
 * reactive (`_fieldopen`, `_mountedimagesversion`); direct assignments
 * keep their casing and emit no events.
 */
export function registerEngineStubs(
  runtime: TorqueRuntime,
  options: EngineStubOptions = {},
): void {
  const reg = runtime.$.registerMethod.bind(runtime.$);
  const regFn = runtime.$.registerFunction.bind(runtime.$);
  const mountTransforms = options.mountTransforms ?? getMountTransforms();

  function getDatablockOf(this_: TorqueObject): TorqueObject | undefined {
    const dbName = this_.datablock;
    if (!dbName) return undefined;
    return runtime.state.datablocks.get(String(dbName));
  }

  /**
   * Resolve a method argument that may be a live object, an id, or a
   * name/path string ($.deref only handles the string/path forms).
   */
  function resolveRef(ref: any): TorqueObject | null {
    if (ref != null && typeof ref === "object" && ref._id != null) return ref;
    if (typeof ref === "number") {
      return runtime.state.objectsById.get(ref) ?? null;
    }
    return runtime.$.deref(ref);
  }

  /**
   * Monotonic change token for reactive _mountedimagesversion — a
   * timestamp would collide (and drop the event) when two mount calls
   * land in the same millisecond, e.g. an unmount+mount barrel swap.
   */
  function bumpMountedImagesVersion(this_: TorqueObject): void {
    const next = (Number(this_._mountedimagesversion) || 0) + 1;
    runtime.$.setProp(this_, "_mountedimagesversion", next);
  }

  // ---- SimObject basics ----

  reg("SimObject", "getName", (this_) => this_._name ?? "");
  reg("SimObject", "getId", (this_) => this_._id);
  reg("SimObject", "getClassName", (this_) => this_._className);
  reg("SimObject", "delete", (this_) => {
    runtime.$.deleteObject(this_);
  });
  reg("SimObject", "setPersistent", (this_, value) => {
    this_._persistent = !!Number(value);
  });
  reg("SimObject", "getGroup", (this_) => this_._parent ?? "");
  reg("SimObject", "getDatablock", (this_) => getDatablockOf(this_) ?? "");

  reg("SimObject", "getType", (this_) => {
    const dynamicType = toU32(getDatablockOf(this_)?.dynamictype);
    return (getClassTypeMask(this_._className) | dynamicType) >>> 0;
  });

  // ---- SimSet / SimGroup containers ----
  // getCount/getObject live on SimSet (SimGroup inherits through the
  // engine chain); adds differ: sets record membership, groups own.

  reg("SimSet", "getCount", (this_) =>
    this_._children ? this_._children.length : 0,
  );
  reg("SimSet", "getObject", (this_, index) => {
    const children = this_._children;
    if (!children) return "";
    return children[Number(index)] ?? "";
  });
  reg("SimSet", "add", (this_, ...objs) => {
    for (const ref of objs) {
      const obj = resolveRef(ref);
      if (obj) runtime.addToGroup(this_, obj, { owning: false });
    }
  });
  reg("SimSet", "remove", (this_, ...objs) => {
    for (const ref of objs) {
      const obj = resolveRef(ref);
      if (obj) runtime.removeFromGroup(this_, obj);
    }
  });
  reg("SimGroup", "add", (this_, ...objs) => {
    for (const ref of objs) {
      const obj = resolveRef(ref);
      if (obj) runtime.addToGroup(this_, obj, { owning: true });
    }
  });

  // ---- SceneObject transforms ----
  // Positions/rotations live in the same `.mis`-style fields the bridge
  // reads; transform strings are "px py pz ax ay az angleRad".

  reg("SceneObject", "getTransform", (this_) =>
    threeToTransformString(objectFieldsToThree(this_)),
  );
  reg("SceneObject", "setTransform", (this_, value) => {
    const { position, quaternion } = transformStringToThree(String(value));
    const [px, py, pz] = threeToMisPosition(position);
    const [ax, ay, az, deg] = threeQuatToMisRotation(quaternion);
    runtime.$.setProp(this_, "position", `${px} ${py} ${pz}`);
    runtime.$.setProp(this_, "rotation", `${ax} ${ay} ${az} ${deg}`);
  });
  reg("SceneObject", "getPosition", (this_) =>
    String(this_.position ?? "0 0 0"),
  );
  reg("SceneObject", "getRotation", (this_) =>
    String(this_.rotation ?? "1 0 0 0"),
  );
  reg("SceneObject", "setScale", (this_, value) => {
    runtime.$.setProp(this_, "scale", String(value));
  });
  reg("SceneObject", "getScale", (this_) => String(this_.scale ?? "1 1 1"));

  reg("SceneObject", "getWorldBoxCenter", (this_) =>
    String(this_.position ?? "0 0 0"),
  );

  // ---- ShapeBase visual state ----

  reg("ShapeBase", "hide", (this_, value) => {
    runtime.$.setProp(this_, "hidden", !!Number(value));
  });
  reg("ShapeBase", "isHidden", (this_) => (this_.hidden ? 1 : 0));
  reg("ShapeBase", "startFade", (this_, durationMs, delayMs, fadeOut) => {
    this_._fade = {
      durationMs: Number(durationMs) || 0,
      delayMs: Number(delayMs) || 0,
      out: !!Number(fadeOut),
    };
  });
  reg("ShapeBase", "setCloaked", (this_, value) => {
    this_._cloaked = !!Number(value);
  });
  reg("ShapeBase", "setDamageState", (this_, state) => {
    runtime.$.setProp(this_, "damagestate", String(state));
  });
  reg("ShapeBase", "getDamageState", (this_) =>
    String(this_.damagestate ?? "Enabled"),
  );
  reg("ShapeBase", "setSkinName", (this_, skin) => {
    runtime.$.setProp(this_, "skin", String(skin));
  });

  // ---- ShapeBase mounting ----

  reg("ShapeBase", "mountImage", (this_, image, slot, loaded, skin) => {
    const imageObj = resolveRef(image);
    const imageName =
      imageObj?._name ?? (typeof image === "string" ? image : String(image));
    if (!this_._mountedImages) this_._mountedImages = {};
    this_._mountedImages[Number(slot) || 0] = {
      image: imageName,
      loaded: loaded == null ? true : !!Number(loaded),
      skin: skin != null && skin !== "" ? String(skin) : undefined,
    };
    bumpMountedImagesVersion(this_);
    return true;
  });
  reg("ShapeBase", "unmountImage", (this_, slot) => {
    if (this_._mountedImages) {
      delete this_._mountedImages[Number(slot) || 0];
      bumpMountedImagesVersion(this_);
    }
    return true;
  });
  reg("ShapeBase", "getMountedImage", (this_, slot) => {
    const entry = this_._mountedImages?.[Number(slot) || 0];
    if (!entry) return 0;
    return runtime.state.datablocks.get(entry.image) ?? 0;
  });
  reg("ShapeBase", "isImageMounted", (this_, image) => {
    const imageObj = resolveRef(image);
    const name = imageObj?._name ?? String(image);
    const mounted = this_._mountedImages ?? {};
    return Object.values(mounted).some(
      (m: any) => String(m.image).toLowerCase() === String(name).toLowerCase(),
    )
      ? 1
      : 0;
  });

  reg("ShapeBase", "mountObject", (this_, objRef, node) => {
    const obj = resolveRef(objRef);
    if (!obj) return false;
    if (!this_._mountedObjects) this_._mountedObjects = {};
    this_._mountedObjects[Number(node) || 0] = obj._id;
    obj._mountedTo = { objectId: this_._id, node: Number(node) || 0 };
    return true;
  });
  reg("ShapeBase", "unmountObject", (this_, objRef) => {
    const obj = resolveRef(objRef);
    if (!obj || !this_._mountedObjects) return false;
    for (const [node, id] of Object.entries(this_._mountedObjects)) {
      if (id === obj._id) delete this_._mountedObjects[node as any];
    }
    obj._mountedTo = undefined;
    return true;
  });
  reg("ShapeBase", "getObjectMount", (this_) =>
    this_._mountedTo
      ? (runtime.state.objectsById.get(this_._mountedTo.objectId) ?? 0)
      : 0,
  );
  reg("ShapeBase", "isMounted", (this_) => (this_._mountedTo ? 1 : 0));

  // ---- Mount slot transforms (from the generated GLB node table) ----

  const warnedShapes = new Set<string>();
  reg("ShapeBase", "getSlotTransform", (this_, slot) => {
    const objTransform = objectFieldsToThree(this_);
    const db = getDatablockOf(this_);
    const shapeFile = String(db?.shapefile ?? "");
    const key = shapeFile
      .replace(/\\/g, "/")
      .split("/")
      .pop()!
      .replace(/\.[^.]*$/, "")
      .toLowerCase();
    const mount = mountTransforms[key]?.[`mount${Number(slot) || 0}`];
    if (!mount) {
      if (key && !warnedShapes.has(key)) {
        warnedShapes.add(key);
        log.warn(
          "getSlotTransform: no mount%d node for shape %s; using object transform",
          Number(slot) || 0,
          key,
        );
      }
      return threeToTransformString(objTransform);
    }
    const world = composeThreeTransforms(objTransform, {
      position: mount.position as Vec3,
      quaternion: mount.rotation as Quat,
    });
    return threeToTransformString(world);
  });

  // ---- Animation thread methods (ShapeBase) ----

  reg("ShapeBase", "playThread", (this_, slot, sequence) => {
    if (!this_._threads) this_._threads = {};
    this_._threads[Number(slot)] = {
      sequence: String(sequence),
      playing: true,
      direction: true, // forward
    };
  });

  reg("ShapeBase", "stopThread", (this_, slot) => {
    if (this_._threads) {
      delete this_._threads[Number(slot)];
    }
  });

  reg("ShapeBase", "setThreadDir", (this_, slot, forward) => {
    if (!this_._threads) this_._threads = {};
    const s = Number(slot);
    if (this_._threads[s]) {
      this_._threads[s].direction = !!Number(forward);
    } else {
      this_._threads[s] = {
        sequence: "",
        playing: false,
        direction: !!Number(forward),
      };
    }
  });

  reg("ShapeBase", "pauseThread", (this_, slot) => {
    if (this_._threads?.[Number(slot)]) {
      this_._threads[Number(slot)].playing = false;
    }
  });

  // ---- Audio (no-op) ----

  reg("ShapeBase", "playAudio", () => {});
  reg("ShapeBase", "stopAudio", () => {});

  // ---- Force fields ----

  reg("ForceFieldBare", "open", (this_) => {
    runtime.$.setProp(this_, "_fieldopen", true);
  });
  reg("ForceFieldBare", "close", (this_) => {
    runtime.$.setProp(this_, "_fieldopen", false);
  });
  reg("ForceFieldBare", "isOpen", (this_) => (this_._fieldopen ? 1 : 0));

  // ---- Power / energy (GameBase) ----

  reg("GameBase", "isEnabled", () => true);
  reg("GameBase", "isDisabled", () => false);
  reg("GameBase", "setPoweredState", () => {});
  reg("GameBase", "setRechargeRate", (this_, rate) => {
    this_._rechargeRate = Number(rate) || 0;
  });
  reg("GameBase", "getRechargeRate", (this_) => this_._rechargeRate ?? 0);
  reg("GameBase", "setEnergyLevel", (this_, level) => {
    this_._energyLevel = Number(level) || 0;
  });
  reg("GameBase", "getEnergyLevel", (this_) => this_._energyLevel ?? 0);

  // ---- Damage / repair stubs (ShapeBase) ----

  reg("ShapeBase", "getDamageLevel", () => 0);
  reg("ShapeBase", "setDamageLevel", () => {});
  reg("ShapeBase", "getRepairRate", () => 0);
  reg("ShapeBase", "setRepairRate", () => {});
  reg("ShapeBase", "getDamagePercent", () => 0);

  // ---- Client / control stubs (GameBase) ----

  reg("GameBase", "getControllingClient", () => 0);
  reg("GameBase", "getTarget", (this_) => this_._target ?? -1);
  reg("GameBase", "setTarget", (this_, id) => {
    const targetId = Number(id);
    if (targetId < 0) {
      this_._target = undefined;
      return;
    }
    this_._target = targetId;
    const entry = targets.get(targetId);
    if (entry) entry.objectId = this_._id;
  });

  // ---- Object method: schedule ----
  // %obj.schedule(delay, "methodName", args...) calls the method on %obj
  // after a delay. Distinct from the global schedule() function in builtins.

  reg("SimObject", "schedule", (this_, delay, methodName, ...args) => {
    const ms = Number(delay) || 0;
    return runtime.scheduleTimeout(() => {
      try {
        runtime.$.call(this_, String(methodName), ...args);
      } catch (err) {
        log.error(
          "schedule: error calling %s on %s: %o",
          methodName,
          this_._id,
          err,
        );
      }
    }, ms);
  });

  // ---- Target system (registered as functions, shadowing builtins) ----
  // The first 32 target ids are reserved for team targets (gameBase.cs).

  const targets = new Map<
    number,
    {
      objectId?: number;
      name: string;
      skin: string;
      sensorGroup: number;
      renderMask: number;
      alwaysVisMask: number;
    }
  >();
  let nextTargetId = 32;
  let nextClientTargetId = 0;

  function resolveTargetObject(id: number): TorqueObject | undefined {
    const objectId = targets.get(id)?.objectId;
    return objectId != null
      ? runtime.state.objectsById.get(objectId)
      : undefined;
  }

  regFn("createtarget", (objRef, name, _a, _b, _typeTag, sensorGroup) => {
    const obj = resolveRef(objRef);
    const id = nextTargetId++;
    targets.set(id, {
      objectId: obj?._id,
      name: String(name ?? ""),
      skin: "",
      sensorGroup: Number(sensorGroup) || 0,
      renderMask: 0,
      alwaysVisMask: 0,
    });
    if (obj) obj._target = id;
    return id;
  });
  regFn("alloctarget", (nameTag, skinTag, _voiceTag, _typeTag, sensorGroup) => {
    const id = nextTargetId++;
    targets.set(id, {
      name: String(nameTag ?? ""),
      skin: String(skinTag ?? ""),
      sensorGroup: Number(sensorGroup) || 0,
      renderMask: 0,
      alwaysVisMask: 0,
    });
    return id;
  });
  regFn("allocclienttarget", () => {
    const id = nextClientTargetId++;
    targets.set(id, {
      name: "",
      skin: "",
      sensorGroup: 0,
      renderMask: 0,
      alwaysVisMask: 0,
    });
    return id;
  });
  regFn("freetarget", (id) => {
    const target = targets.get(Number(id));
    const obj = resolveTargetObject(Number(id));
    if (obj && obj._target === Number(id)) obj._target = undefined;
    if (target) targets.delete(Number(id));
  });
  regFn("settargetskin", (id, skin) => {
    const target = targets.get(Number(id));
    if (target) target.skin = String(skin ?? "");
    const obj = resolveTargetObject(Number(id));
    if (obj) {
      obj._targetSkin = String(skin ?? "");
      runtime.$.setProp(obj, "skin", String(skin ?? ""));
    }
  });
  regFn("settargetsensorgroup", (id, group) => {
    const target = targets.get(Number(id));
    if (target) target.sensorGroup = Number(group) || 0;
    const obj = resolveTargetObject(Number(id));
    if (obj) obj._targetSensorGroup = Number(group) || 0;
  });
  regFn("settargetname", (id, name) => {
    const target = targets.get(Number(id));
    if (target) target.name = String(name ?? "");
  });
  regFn("settargetrendermask", (id, mask) => {
    const target = targets.get(Number(id));
    if (target) target.renderMask = toU32(mask);
  });
  regFn(
    "gettargetrendermask",
    (id) => targets.get(Number(id))?.renderMask ?? 0,
  );
  regFn("settargetalwaysvismask", (id, mask) => {
    const target = targets.get(Number(id));
    if (target) target.alwaysVisMask = toU32(mask);
  });
  regFn("gettargetsensorgroup", (id) => {
    return targets.get(Number(id))?.sensorGroup ?? 0;
  });
  regFn("resettargetmanager", () => {
    targets.clear();
    nextTargetId = 32;
    nextClientTargetId = 0;
  });
  regFn("clientresettargets", () => {});

  // Seed $TypeMasks::* globals so scripts' bitmask tests work. Done here
  // (not in createRuntime) so mask values and getType() come from the same
  // table.
  for (const [name, value] of Object.entries(TYPE_MASKS)) {
    runtime.$g.set(`TypeMasks::${name}`, value);
  }
}
