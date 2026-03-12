import { createLogger } from "../logger";
import type { TorqueRuntime } from "./types";

const log = createLogger("engineMethods");

/**
 * Register C++ engine method stubs that TorqueScript code expects to exist.
 * These are methods that would normally be implemented in the Torque C++ engine
 * (on classes like ShapeBase, GameBase, SimObject, SimGroup) and called by
 * game scripts (power.cs, staticShape.cs, station.cs, deployables.cs, etc.).
 */
export function registerEngineStubs(runtime: TorqueRuntime): void {
  const reg = runtime.$.registerMethod.bind(runtime.$);

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

  // ---- Object hierarchy (SimObject / SimGroup) ----

  reg("SimObject", "getDatablock", (this_) => {
    const dbName = this_.datablock;
    if (!dbName) return "";
    return runtime.getObjectByName(String(dbName)) ?? "";
  });

  reg("SimObject", "getGroup", (this_) => {
    return this_._parent ?? "";
  });

  reg("SimObject", "getName", (this_) => {
    return this_._name ?? "";
  });

  reg("SimObject", "getType", () => {
    // Return a bitmask; scripts use this with $TypeMasks checks.
    // GameBaseObjectType = 0x4000 covers StaticShape/Turret/etc.
    return 0x4000;
  });

  reg("SimGroup", "getCount", (this_) => {
    return this_._children ? this_._children.length : 0;
  });

  reg("SimGroup", "getObject", (this_, index) => {
    const children = this_._children;
    if (!children) return "";
    return children[Number(index)] ?? "";
  });

  // ---- Power / energy stubs (GameBase) ----

  reg("GameBase", "isEnabled", () => true);
  reg("GameBase", "isDisabled", () => false);
  reg("GameBase", "setPoweredState", () => {});
  reg("GameBase", "setRechargeRate", () => {});
  reg("GameBase", "getRechargeRate", () => 0);
  reg("GameBase", "setEnergyLevel", () => {});
  reg("GameBase", "getEnergyLevel", () => 0);

  // ---- Damage / repair stubs (ShapeBase) ----

  reg("ShapeBase", "getDamageLevel", () => 0);
  reg("ShapeBase", "setDamageLevel", () => {});
  reg("ShapeBase", "getRepairRate", () => 0);
  reg("ShapeBase", "setRepairRate", () => {});
  reg("ShapeBase", "getDamagePercent", () => 0);

  // ---- Client / control stubs (GameBase) ----

  reg("GameBase", "getControllingClient", () => 0);

  // ---- Object method: schedule ----
  // %obj.schedule(delay, "methodName", args...) calls the method on %obj
  // after a delay. Distinct from the global schedule() function in builtins.

  reg("SimObject", "schedule", (this_, delay, methodName, ...args) => {
    const ms = Number(delay) || 0;
    const timeoutId = setTimeout(() => {
      runtime.state.pendingTimeouts.delete(timeoutId);
      try {
        runtime.$.call(this_, String(methodName), ...args);
      } catch (err) {
        log.error(
          "schedule: error calling %s on %s: %o",
          methodName, this_._id, err,
        );
      }
    }, ms);
    runtime.state.pendingTimeouts.add(timeoutId);
    return timeoutId;
  });
}
