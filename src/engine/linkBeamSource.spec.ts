import fs from "node:fs/promises";
import { expect, it } from "vitest";
import { Group, Object3D, Vector3 } from "three";
import { DTSLoader } from "../dts/dtsLoader";
import {
  muzzleWorldPosition,
  registerImageMuzzle,
  sourceAimDirection,
} from "./linkBeamSource";
import { gameEntityStore } from "../state/gameEntityStore";
import type { PlayerEntity } from "../state/gameEntityTypes";

it.each([
  "weapon_repair",
  "weapon_elf",
  "turret_elf_large",
  "weapon_shocklance",
])(
  "resolves %s's lazy muzzle and follows the mounted hierarchy",
  async (name) => {
    const bytes = await fs.readFile(
      `docs/base/@vl2/shapes.vl2/shapes/${name}.dts`,
    );
    const model = new DTSLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const names: string[] = [];
    model.scene.traverse((node) => names.push(node.name.toLowerCase()));
    expect(names).not.toContain("muzzlepoint");
    const player = new Group(),
      mount = new Group();
    player.position.set(10, 20, 30);
    player.add(mount);
    mount.position.set(0.5, 1.5, -0.5);
    mount.rotation.y = 1;
    mount.add(model.scene);
    const unregister = registerImageMuzzle("repairer", 0, model.scene);
    try {
      const muzzle = model.scene.getNodeByName("muzzlePoint")!;
      const actual = new Vector3(),
        expected = new Vector3();
      for (const yaw of [0, 1, -1]) {
        player.rotation.y = yaw;
        muzzleWorldPosition("repairer", player, 0, actual);
        muzzle.getWorldPosition(expected);
        expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
        expect(actual.distanceTo(player.position)).toBeGreaterThan(0.5);
      }
    } finally {
      unregister();
    }
  },
);

it("selects the source image slot and invalidates replacements and unmounts immediately", () => {
  const world = new Group(),
    player = new Group();
  world.position.set(10, 0, 0);
  world.add(player);
  player.position.set(2, 3, 4);
  const image = (x: number) => {
    const root = new Group(),
      muzzle = new Object3D();
    muzzle.name = "MuzzlePoint";
    muzzle.position.x = x;
    root.add(muzzle);
    player.add(root);
    return root;
  };
  const gun = image(1),
    pack = image(5),
    replacement = image(2);
  const stopGun = registerImageMuzzle("owner", 0, gun),
    stopPack = registerImageMuzzle("owner", 2, pack);
  const out = new Vector3();
  expect(muzzleWorldPosition("owner", player, 0, out).toArray()).toEqual([
    13, 3, 4,
  ]);
  expect(muzzleWorldPosition("owner", player, 2, out).toArray()).toEqual([
    17, 3, 4,
  ]);
  const stopReplacement = registerImageMuzzle("owner", 0, replacement);
  stopGun();
  expect(muzzleWorldPosition("owner", player, 0, out).toArray()).toEqual([
    14, 3, 4,
  ]);
  stopReplacement();
  expect(muzzleWorldPosition("owner", player, 0, out).toArray()).toEqual([
    12, 3, 4,
  ]);
  stopPack();
});

it("uses the image transform when its own muzzle is absent, excluding mounted children", () => {
  const player = new Group(),
    image = new Group(),
    child = new Group(),
    decoy = new Object3D();
  image.position.set(1, 2, 3);
  player.add(image);
  child.userData.objectMount = true;
  decoy.name = "muzzlePoint";
  decoy.position.set(100, 100, 100);
  child.add(decoy);
  image.add(child);
  const unregister = registerImageMuzzle("no-muzzle", 0, image);
  expect(
    muzzleWorldPosition("no-muzzle", player, 0, new Vector3()).toArray(),
  ).toEqual([1, 2, 3]);
  unregister();
});

it("aims non-player beams along the selected mounted muzzle, including parent pitch and roll", () => {
  const vehicle = new Group(),
    turret = new Group(),
    barrel = new Group(),
    muzzle = new Object3D();
  vehicle.rotation.set(0.2, 0.7, -0.3);
  vehicle.add(turret);
  turret.rotation.y = -0.8;
  turret.add(barrel);
  barrel.rotation.x = 0.6;
  muzzle.name = "muzzlePoint";
  muzzle.rotation.y = Math.PI / 2;
  barrel.add(muzzle);
  const unregister = registerImageMuzzle("turret", 1, barrel);
  try {
    const expected = new Vector3(1, 0, 0)
      .applyEuler(barrel.rotation)
      .applyEuler(turret.rotation)
      .applyEuler(vehicle.rotation);
    expect(
      sourceAimDirection("turret", turret, 1, new Vector3()).distanceTo(
        expected,
      ),
    ).toBeLessThan(1e-8);
    // An empty slot falls back to the source's native forward axis.
    expected
      .set(1, 0, 0)
      .applyEuler(turret.rotation)
      .applyEuler(vehicle.rotation);
    expect(
      sourceAimDirection("turret", turret, 0, new Vector3()).distanceTo(
        expected,
      ),
    ).toBeLessThan(1e-8);
  } finally {
    unregister();
  }
});

it("preserves the player's look-direction override instead of following the gun's animated tilt", () => {
  const previous = gameEntityStore.getState().streamEntities;
  const player: PlayerEntity = {
    id: "player",
    className: "Player",
    renderType: "Player",
    headPitch: 0.4,
    headYaw: 0,
  };
  gameEntityStore.setState({ streamEntities: new Map([[player.id, player]]) });
  const root = new Group(),
    gun = new Group();
  root.rotation.y = 0.7;
  root.add(gun);
  gun.rotation.x = -1.2;
  const unregister = registerImageMuzzle(player.id, 0, gun);
  try {
    const expected = new Vector3(Math.cos(0.6), -Math.sin(0.6), 0).applyEuler(
      root.rotation,
    );
    expect(
      sourceAimDirection(player.id, root, 0, new Vector3()).distanceTo(
        expected,
      ),
    ).toBeLessThan(1e-8);
  } finally {
    unregister();
    gameEntityStore.setState({ streamEntities: previous });
  }
});
