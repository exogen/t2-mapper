import { describe, expect, it } from "vitest";
import { Group } from "three";
import type { GameEntity } from "../state/gameEntityTypes";
import { gameEntityStore } from "../state/gameEntityStore";
import { settingsStore } from "../state/settingsStore";
import { SceneAssets } from "../assets/sceneAssets";
import { EntityViewRegistry, installEntityViews } from "./entityViews";
import { MountPoints } from "./shapeMounts";
import type { GameEngine } from "./gameEngine";

const engine = {} as GameEngine;

function sky(id: string): GameEntity {
  return { id, renderType: "Sky" } as GameEntity;
}

function createRegistry(log: string[]) {
  return new EntityViewRegistry({
    Sky: (entity) => {
      log.push(`create ${entity.id}`);
      return {
        root: new Group(),
        dispose: () => log.push(`dispose ${entity.id}`),
      };
    },
  });
}

it("rebuilds views at scene boundaries and refreshes only textures on a quality change", () => {
  const log: string[] = [];
  const snapshot = gameEntityStore.getState();
  const { hdTexturesEnabled } = settingsStore.getState();
  const sceneAssets = new SceneAssets();
  sceneAssets.onTexturesChanged(() => log.push("refresh textures"));
  const scopedEngine = {
    entities: createRegistry(log),
    sceneAssets,
    withHost: () => () => {},
    releaseSceneAssets: () => log.push("release assets"),
    invalidate: () => log.push("invalidate"),
  } as unknown as GameEngine;
  try {
    snapshot.setAllEntities([sky("a")]);
    const stop = installEntityViews(scopedEngine);
    try {
      snapshot.setMissionInfo({ missionName: "Metadata can arrive late" });
      expect(log).toEqual(["create a"]);
      snapshot.setAllEntities([sky("b")]);
      expect(log).toEqual([
        "create a",
        "dispose a",
        "release assets",
        "create b",
      ]);
      log.length = 0;
      settingsStore.setState({ hdTexturesEnabled: !hdTexturesEnabled });
      expect(log).toEqual(["refresh textures", "invalidate"]);
      expect(scopedEngine.entities.get("b")).toBeDefined();
    } finally {
      stop();
    }
    expect(log.slice(-2)).toEqual(["dispose b", "release assets"]);
  } finally {
    sceneAssets.dispose();
    settingsStore.setState({ hdTexturesEnabled });
    gameEntityStore.setState(snapshot, true);
  }
});

it("disposes a replaced view before creating its successor under a new id", () => {
  const log: string[] = [];
  const registry = createRegistry(log);
  registry.sync([sky("a")], engine);
  registry.sync([sky("b")], engine);
  expect(log).toEqual(["create a", "dispose a", "create b"]);
});

it("keeps a view whose update accepts the new entity object", () => {
  const log: string[] = [];
  const registry = new EntityViewRegistry({
    Sky: (entity) => {
      log.push(`create ${entity.id}`);
      return {
        root: new Group(),
        update: () => true,
        dispose: () => log.push(`dispose ${entity.id}`),
      };
    },
  });
  registry.sync([sky("a")], engine);
  registry.sync([sky("a")], engine);
  expect(log).toEqual(["create a"]);
});

it("recreates a view whose update rejects the new entity object", () => {
  const log: string[] = [];
  const registry = createRegistry(log);
  registry.sync([sky("a")], engine);
  registry.sync([sky("a")], engine);
  expect(log).toEqual(["create a", "dispose a", "create a"]);
});

it("ignores hidden entities and render types it doesn't handle", () => {
  const log: string[] = [];
  const registry = createRegistry(log);
  registry.sync(
    [
      { ...sky("a"), hidden: true } as GameEntity,
      { id: "b", renderType: "Player" } as GameEntity,
    ],
    engine,
  );
  expect(log).toEqual([]);
  expect(registry.root.children).toHaveLength(0);
});

it("distinguishes object removal from hiding, replacement and shutdown", () => {
  const reasons: (string | undefined)[] = [];
  const registry = new EntityViewRegistry({
    Sky: () => ({
      root: new Group(),
      dispose: (reason) => reasons.push(reason),
    }),
  });
  registry.sync([sky("a")], engine);
  registry.sync([{ ...sky("a"), debugHidden: true }], engine);
  registry.sync([sky("a")], engine);
  registry.sync([sky("a")], engine);
  registry.sync([], engine);
  registry.sync([sky("a")], engine);
  registry.dispose();
  expect(reasons).toEqual(["hidden", "replaced", "removed", "shutdown"]);
});

describe("mounted objects", () => {
  function shape(id: string, fields: Partial<GameEntity> = {}): GameEntity {
    return { id, renderType: "Shape", ...fields } as GameEntity;
  }
  function player(id: string, mountObjectId?: string): GameEntity {
    return {
      id,
      renderType: "Player",
      mountObjectId,
      mountNode: 1,
    } as GameEntity;
  }
  function createMountRegistry(log: string[], reuse = false) {
    const view = (
      entity: GameEntity,
      _engine: GameEngine,
      mounted: boolean,
    ) => {
      log.push(`create ${entity.id}${mounted ? " mounted" : ""}`);
      const root = new Group();
      root.name = entity.id;
      // The model's mount nodes live under the view's root.
      const scene = new Group();
      root.add(scene);
      for (const point of [1, 2]) {
        const node = new Group();
        node.name = `mount${point}`;
        scene.add(node);
      }
      const mounts = new MountPoints();
      mounts.setScene(scene);
      return {
        root,
        mounts,
        update: () => reuse,
        dispose: () => log.push(`dispose ${entity.id}`),
      };
    };
    return new EntityViewRegistry({ Shape: view, Player: view });
  }

  it("attaches a mounted player to its vehicle, not the entity root", () => {
    const log: string[] = [];
    const registry = createMountRegistry(log);
    // The rider comes first in the list; its vehicle is still built first.
    registry.sync([player("pilot", "jeep"), shape("jeep")], engine);
    expect(log).toEqual(["create jeep", "create pilot mounted"]);
    expect(registry.root.children.map((c) => c.name)).toEqual(["jeep"]);
    const pilot = registry.get("pilot")!.root;
    expect(pilot.parent?.name).toBe("mount1");
    expect(pilot.parent?.parent?.parent).toBe(registry.get("jeep")!.root);
  });

  it("reattaches a rider who changes seats without rebuilding its view", () => {
    const log: string[] = [];
    const registry = createMountRegistry(log, true);
    const jeep = shape("jeep");
    const rider = player("rider", "jeep");
    registry.sync([jeep, rider], engine);
    const view = registry.get("rider")!;
    expect(view.root.parent?.name).toBe("mount1");

    rider.mountNode = 2;
    registry.sync([jeep, { ...rider }], engine);
    expect(registry.get("rider")).toBe(view);
    expect(view.root.parent?.name).toBe("mount2");
    expect(log).toEqual(["create jeep", "create rider mounted"]);
  });

  it("moves a dismounting player back to the entity root", () => {
    const log: string[] = [];
    const registry = createMountRegistry(log);
    const jeep = shape("jeep");
    registry.sync([jeep, player("pilot", "jeep")], engine);
    registry.sync([jeep, player("pilot")], engine);
    expect(log.slice(2)).toEqual(["dispose pilot", "create pilot"]);
    expect(registry.get("pilot")!.root.parent).toBe(registry.root);
  });

  it("rebuilds the rider when its vehicle's view is recreated", () => {
    const log: string[] = [];
    const registry = createMountRegistry(log);
    registry.sync([shape("jeep"), player("pilot", "jeep")], engine);
    registry.sync([shape("jeep"), player("pilot", "jeep")], engine);
    expect(log.slice(2)).toEqual([
      "dispose jeep",
      "create jeep",
      "dispose pilot",
      "create pilot mounted",
    ]);
  });

  it("hides riders of a hidden vehicle", () => {
    const log: string[] = [];
    const registry = createMountRegistry(log);
    registry.sync(
      [shape("jeep", { hidden: true }), player("pilot", "jeep")],
      engine,
    );
    expect(log).toEqual([]);
  });
});
