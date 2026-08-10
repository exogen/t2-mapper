import type { TorqueObject, TorqueRuntime } from "../torqueScript";
import { gameEntityStore } from "../state/gameEntityStore";
import {
  buildGameEntityFromMission,
  resolveTeamForObject,
} from "./missionEntityBridge";
import type { GameEntity } from "../state/gameEntityTypes";

/** Fields whose changes require rebuilding the affected entity. */
const REBUILD_FIELDS = new Set([
  "hidden",
  "team",
  "skin",
  "position",
  "rotation",
  "scale",
  "datablock",
  "initialbarrel",
  "_fieldopen",
  "_mountedimagesversion",
]);

/**
 * Methods whose calls require rebuilding the target entity. Note:
 * setTargetSkin is a global function (no method.called event); its skin
 * change arrives via the reactive `skin` field instead.
 */
const REBUILD_METHODS = new Set([
  "hide",
  "mountimage",
  "unmountimage",
  "open",
  "close",
  "settransform",
  "setscale",
]);

const MISSION_ROOTS = new Set(["missiongroup", "missioncleanup"]);

function isUnderMissionRoots(object: TorqueObject): boolean {
  for (
    let group: TorqueObject | undefined = object._parent;
    group;
    group = group._parent
  ) {
    const name = group._name?.toLowerCase();
    if (name && MISSION_ROOTS.has(name)) return true;
  }
  return false;
}

/**
 * Keeps gameEntityStore's mission entities in sync with runtime mutations
 * after the initial walkMissionTree harvest: script-spawned objects (e.g.
 * vehicle station terminals), deletions, and whitelisted field/method
 * changes trigger targeted entity rebuilds. Rebuilds land in a single
 * setEntities write per batch; deletions (rare in mission mode) are
 * removed individually. Returns an unsubscribe function.
 */
export function createMissionEntityObserver(
  runtime: TorqueRuntime,
  missionType?: string,
): () => void {
  return runtime.subscribeRuntimeEvents((event) => {
    if (event.type !== "batch.flushed") return;

    const dirtyIds = new Set<number>();
    const deletedIds = new Set<number>();

    for (const mutation of event.events) {
      switch (mutation.type) {
        case "object.created":
          dirtyIds.add(mutation.objectId);
          break;
        case "object.deleted":
          dirtyIds.delete(mutation.objectId);
          deletedIds.add(mutation.objectId);
          break;
        case "field.changed":
          if (REBUILD_FIELDS.has(mutation.field.toLowerCase())) {
            dirtyIds.add(mutation.objectId);
          }
          break;
        case "method.called":
          if (
            mutation.objectId != null &&
            REBUILD_METHODS.has(mutation.methodName.toLowerCase())
          ) {
            dirtyIds.add(mutation.objectId);
          }
          break;
      }
    }
    if (dirtyIds.size === 0 && deletedIds.size === 0) return;

    const store = gameEntityStore.getState();
    const rebuilt: GameEntity[] = [];
    for (const id of dirtyIds) {
      const object = runtime.state.objectsById.get(id);
      // Only mission-owned, unmounted objects become entities; mounted
      // objects (vehicle assemblies) are deferred. An object that no
      // longer qualifies (mounted, reparented out of the mission roots)
      // must not linger in the store — deleteEntity no-ops when absent.
      if (!object || object._mountedTo || !isUnderMissionRoots(object)) {
        deletedIds.add(id);
        continue;
      }
      const entity = buildGameEntityFromMission(
        object,
        runtime,
        resolveTeamForObject(object),
        missionType,
      );
      if (entity) rebuilt.push(entity);
    }

    if (rebuilt.length > 0) {
      store.setEntities(rebuilt);
    }
    for (const id of deletedIds) {
      store.deleteEntity(String(id));
    }
  });
}
