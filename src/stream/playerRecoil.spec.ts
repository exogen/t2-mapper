import { AnimationClip, AnimationMixer, Object3D } from "three";
import { expect, it, vi } from "vitest";
import { createPlayerRecoil, playerRecoilStartAt } from "./playerRecoil";
import { TestLiveStream } from "./streamTestFixtures";

it("holds earlier authored recoil clips at zero and restarts the last one", () => {
  const mixer = new AnimationMixer(new Object3D());
  const light = mixer.clipAction(new AnimationClip("light_recoil", 0.6, []));
  const heavy = mixer.clipAction(new AnimationClip("heavy_recoil", 0.4, []));
  const actions = new Map([
    [light.getClip().name, light],
    [heavy.getClip().name, heavy],
  ]);
  const sample = createPlayerRecoil(
    (name) => actions.get(name),
    () => false,
  )!;

  sample(0.2, 0.3);
  expect(light.isScheduled()).toBe(true);
  expect(light.time).toBe(0);
  expect(heavy.time).toBe(0);

  sample(0.32, playerRecoilStartAt(0.34, 0.12, 0.32));
  expect(heavy.time).toBeCloseTo(0.2);

  sample(0.35, playerRecoilStartAt(0.34, 0.12, 0.35));
  expect(heavy.time).toBeCloseTo(0.01);
  expect(light.time).toBe(0);
  sample(0.9, 0.34);
  expect(heavy.time).toBe(0.4);
});

function streamWithRecoil() {
  const stream = new TestLiveStream("play", "Player");
  const weapon = {
    shapeName: "weapon.dts",
    states: [
      { index: 0, name: "Ready" },
      { index: 1, name: "Fire", fire: true, recoil: 1, timeoutValue: 0.3 },
    ],
  };
  vi.spyOn(stream, "getDataBlockData").mockImplementation((id) =>
    id === 1 ? { shapeName: "armor.dts" } : weapon,
  );
  return stream;
}

it("retains a player's recoil across image changes and checkpoint restore", () => {
  const stream = streamWithRecoil();
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    position: { x: 0, y: 0, z: 100 },
    images: [{ index: 0, dataBlockId: 2, fireCount: 0 }],
  });
  stream.stepToTime(0.032);
  stream.updateGhost(4, {
    images: [{ index: 0, dataBlockId: 2, fireCount: 1 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.032);
  stream.stepToTime(0.064);
  stream.updateGhost(4, {
    images: [{ index: 0 }, { index: 1, dataBlockId: 2, fireCount: 0 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.032);
  const checkpoint = stream.checkpoint();
  stream.roundTripCheckpoint();
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.032);

  // Legacy state tables keep the old shape of each image state. Refresh
  // those tables from the datablock so the next shot can trigger recoil.
  for (const shared of checkpoint.shared.values()) {
    if (!shared.imageSlots) continue;
    shared.imageSlots = shared.imageSlots.map(
      (slot) =>
        slot && {
          ...slot,
          imageStates: slot.imageStates?.map((state) => ({
            ...state,
            recoil: undefined,
          })),
        },
    );
  }
  checkpoint.state.entities.forEach((entity) => {
    delete entity.recoilStartedAtSec;
  });
  stream.restore(checkpoint);
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBeUndefined();

  stream.stepToTime(0.096);
  stream.updateGhost(4, {
    images: [{ index: 1, dataBlockId: 2, fireCount: 1 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.096);
  stream.stepToTime(0.128);
  stream.updateGhost(4, {
    images: [{ index: 1, dataBlockId: 2, fireCount: 1 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.096);
});

it("keeps recoil and animation clocks when a weapon changes skin", () => {
  const stream = streamWithRecoil();
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    position: { x: 0, y: 0, z: 100 },
    images: [{ index: 0, dataBlockId: 2, skinName: "base", fireCount: 0 }],
  });

  stream.stepToTime(0.032);
  stream.updateGhost(4, {
    images: [{ index: 0, dataBlockId: 2, skinName: "storm", fireCount: 1 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.032);
  expect(stream.entityAt(4)?.imageSlots?.[0]).toMatchObject({
    skinName: "storm",
    mountedAtSec: 0,
    animation: { changedAtSec: 0.032, state: { isFiring: true } },
  });

  stream.stepToTime(0.064);
  stream.updateGhost(4, {
    images: [{ index: 0, dataBlockId: 2, skinName: "inferno", fireCount: 1 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.032);
  expect(stream.entityAt(4)?.imageSlots?.[0]).toMatchObject({
    skinName: "inferno",
    mountedAtSec: 0,
    animation: { changedAtSec: 0.032, state: { isFiring: true } },
  });
});

it("recognizes a shot on the same packet that replaces a mounted weapon", () => {
  const stream = streamWithRecoil();
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    position: { x: 0, y: 0, z: 100 },
    images: [{ index: 0, dataBlockId: 2, fireCount: 7, imageExtraFlag: false }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBeUndefined();

  stream.stepToTime(0.032);
  stream.updateGhost(4, {
    images: [{ index: 0, dataBlockId: 3, fireCount: 0 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0.032);
  expect(stream.entityAt(4)?.imageSlots?.[0]?.animation?.state.isFiring).toBe(
    true,
  );
});

it("retains the slot's last fire count across unmounts and seeks", () => {
  const stream = streamWithRecoil();
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    position: { x: 0, y: 0, z: 100 },
    images: [{ index: 0, dataBlockId: 2, fireCount: 4, imageExtraFlag: true }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0);

  stream.stepToTime(0.032);
  stream.updateGhost(4, {
    images: [{ index: 0, dataBlockId: 0, fireCount: 4 }],
  });
  stream.roundTripCheckpoint();
  stream.stepToTime(0.064);
  stream.updateGhost(4, {
    images: [{ index: 0, dataBlockId: 3, fireCount: 4 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBe(0);
  expect(stream.entityAt(4)?.imageSlots?.[0]?.animation?.state.isFiring).toBe(
    false,
  );
});

it("seeds the fire count of an empty slot in a live catch-up create", () => {
  const stream = streamWithRecoil();
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    position: { x: 0, y: 0, z: 100 },
    images: [
      { index: 0, dataBlockId: 0, fireCount: 4 },
      { index: 1, dataBlockId: 2, fireCount: 6 },
    ],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBeUndefined();

  stream.stepToTime(0.032);
  stream.updateGhost(4, {
    images: [{ index: 0, dataBlockId: 3, fireCount: 4 }],
  });
  expect(stream.entityAt(4)?.recoilStartedAtSec).toBeUndefined();
  expect(stream.entityAt(4)?.imageSlots?.[0]?.animation?.state.isFiring).toBe(
    false,
  );
});
