import { describe, expect, it, vi } from "vitest";
import { Group, PerspectiveCamera } from "three";
import { ProjectilePool } from "./ProjectilePool";
import type { ProjectileView, ProjectileFactory } from "./types";
import type { SpriteEntity, GameEntity } from "../../state/gameEntityTypes";
import {
  gameEntityStore,
  selectSceneEntities,
} from "../../state/gameEntityStore";

const projectile = (id: string): SpriteEntity => ({
  id,
  className: "LinearProjectile",
  renderType: "Sprite",
  spawnTime: 0,
  visual: {
    kind: "sprite",
    texture: "test",
    color: { r: 1, g: 1, b: 1 },
    size: 1,
  },
});
function fixture(maxIdle = 128) {
  const views: ProjectileView[] = [];
  const factory = vi.fn(() => {
    const view = {
      root: new Group(),
      reset: vi.fn(),
      update: vi.fn(),
      animate: vi.fn(),
      release: vi.fn(),
      dispose: vi.fn(),
    };
    views.push(view);
    return view;
  });
  const load = vi.fn(async () => factory);
  const root = new Group(),
    pool = new ProjectilePool(root, load, vi.fn(), maxIdle);
  return { pool, root, views, factory, load };
}
const tick = async (pool: ProjectilePool, entities: GameEntity[]) => {
  pool.sync(new Map(entities.map((e) => [e.id, e])));
  await Promise.resolve();
  pool.prepare(0.016);
};

describe("pooled projectile lifecycle", () => {
  it("recycles detached visuals, resets their state and updates the current entity", async () => {
    const { pool, root, views, factory } = fixture();
    const first = projectile("first"),
      next = projectile("next");
    await tick(pool, [first]);
    const view = views[0];
    view.root.position.set(9, 8, 7);
    await tick(pool, [next]);
    pool.update(new PerspectiveCamera(), 0.016);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(root.children).toEqual([view.root]);
    expect(view.root.name).toBe("next");
    expect(view.root.position.toArray()).toEqual([0, 0, 0]);
    expect(view.release).toHaveBeenCalledTimes(1);
    expect(view.reset).toHaveBeenLastCalledWith(next);
    expect(view.update).toHaveBeenCalledWith(
      next,
      expect.any(PerspectiveCamera),
      0.016,
    );
    await tick(pool, []);
    expect(root.children).toHaveLength(0);
    expect(view.root.parent).toBeNull();
    pool.dispose();
    expect(view.dispose).toHaveBeenCalledTimes(1);
  });
  it("does not restart animation for a replacement record with unchanged identity/configuration", async () => {
    const { pool, views } = fixture();
    const first = projectile("same");
    await tick(pool, [first]);
    const updated = { ...first, hidden: true };
    await tick(pool, [updated]);
    expect(views[0].reset).toHaveBeenCalledTimes(1);
    expect(views[0].root.visible).toBe(false);
    const changed = { ...first, spawnTime: 2 };
    await tick(pool, [changed]);
    expect(views[0].reset).toHaveBeenCalledTimes(2);
    expect(views[0].reset).toHaveBeenLastCalledWith(changed);
    pool.dispose();
  });
  it("ignores completed loads after removal, seek, or disposal", async () => {
    let resolve!: (factory: ProjectileFactory) => void;
    const pending = new Promise<ProjectileFactory>((r) => {
      resolve = r;
    });
    const factory = vi.fn(() => ({
      root: new Group(),
      reset() {},
      update() {},
      release() {},
      dispose() {},
    }));
    const root = new Group(),
      pool = new ProjectilePool(root, () => pending);
    await tick(pool, [projectile("gone")]);
    pool.reset();
    resolve(factory);
    await Promise.resolve();
    pool.prepare(0);
    expect(root.children).toHaveLength(0);
    expect(factory).not.toHaveBeenCalled();
    await tick(pool, [projectile("new")]);
    expect(root.children).toHaveLength(1);
    pool.dispose();
    pool.prepare(0);
    expect(root.children).toHaveLength(0);
  });
  it.each(["hidden", "debugHidden"] as const)(
    "restores visibility after %s clears without restarting animation",
    async (flag) => {
      const { pool, views } = fixture();
      const first = projectile("toggle");
      const camera = new PerspectiveCamera();
      await tick(pool, [{ ...first, [flag]: true }]);
      pool.update(camera, 0.016);
      expect(views[0].root.visible).toBe(false);
      await tick(pool, [first]);
      pool.update(camera, 0.016);
      expect(views[0].root.visible).toBe(true);
      expect(views[0].reset).toHaveBeenCalledOnce();
      // A view can still hide itself for its own lifetime rules.
      vi.mocked(views[0].update).mockImplementation(() => {
        views[0].root.visible = false;
      });
      pool.update(camera, 0.016);
      expect(views[0].root.visible).toBe(false);
      pool.dispose();
    },
  );
  it("bounds idle storage and keeps incompatible visuals in separate buckets", async () => {
    const { pool, views, load } = fixture(1);
    const a = projectile("a"),
      b = projectile("b"),
      c = projectile("c");
    c.visual = { ...c.visual, size: 2 };
    await tick(pool, [a, b, c]);
    expect(load).toHaveBeenCalledTimes(2);
    await tick(pool, []);
    expect(
      views.filter((v) => vi.mocked(v.dispose).mock.calls.length),
    ).toHaveLength(2);
    pool.dispose();
    for (const view of views) expect(view.dispose).toHaveBeenCalledTimes(1);
  });
  it("removes transient membership from the React scene selector while keeping it in game state", () => {
    const state = gameEntityStore.getState();
    const tree: GameEntity = {
      id: "tree",
      className: "TSStatic",
      renderType: "Shape",
      shapeName: "borg18",
    };
    const shape: GameEntity = {
      id: "mortar",
      className: "GrenadeProjectile",
      renderType: "Shape",
      shapeName: "mortar_projectile",
    };
    const entities = new Map(
      [tree, shape, projectile("bolt")].map((e) => [e.id, e]),
    );
    const selected = selectSceneEntities({
      ...state,
      dataSource: "demo",
      streamEntities: entities,
    });
    expect(selected).toEqual([tree]);
    expect(entities.size).toBe(3);
  });
});
