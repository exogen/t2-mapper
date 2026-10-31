import { describe, expect, it } from "vitest";
import { Group } from "three";
import type { GameEntity } from "../state/gameEntityTypes";
import { EntityViewRegistry } from "./entityViews";
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
  function createMountRegistry(log: string[]) {
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
      const mounts = new MountPoints();
      mounts.setScene(scene);
      return {
        root,
        mounts,
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
    expect(pilot.parent?.parent).toBe(registry.get("jeep")!.root);
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
