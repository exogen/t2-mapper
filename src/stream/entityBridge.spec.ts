import { describe, expect, it } from "vitest";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "./entityBridge";
import type { StreamEntity } from "./types";
import type {
  PlayerEntity,
  ShapeEntity,
  ForceFieldBareEntity,
} from "../state/gameEntityTypes";
import { ForceFieldState } from "./forceFieldState";

function shape(overrides: Partial<StreamEntity> = {}): StreamEntity {
  return {
    id: "shape",
    type: "StaticShape",
    className: "StaticShape",
    dataBlock: "station_generator_large.dts",
    health: 1,
    damageState: 0,
    fadeVal: 1,
    cloakLevel: 0,
    ...overrides,
  };
}

describe("streamed render entity updates", () => {
  it.each(["StaticShape", "Player", "WheeledVehicle"])(
    "keeps %s damage, repair, fade and cloak current without a React update",
    (className) => {
      const initial = shape({ className });
      const rendered = streamEntityToGameEntity(initial) as
        ShapeEntity | PlayerEntity;
      for (const state of [
        { health: 0.5, damageState: 0, fadeVal: 0.5, cloakLevel: 0.25 },
        { health: 0, damageState: 2, fadeVal: 1, cloakLevel: 1 },
        { health: 1, damageState: 0, fadeVal: 1, cloakLevel: 0 },
      ]) {
        expect(
          updateGameEntityFromStream(rendered, { ...initial, ...state }),
        ).toBe(false);
        expect(rendered).toMatchObject(state);
      }
    },
  );

  it("initializes an already cloaked or faded player the same as later updates", () => {
    const initial = shape({ className: "Player" });
    const hidden = { ...initial, fadeVal: 0, cloakLevel: 1 };
    const rendered = streamEntityToGameEntity(initial);
    updateGameEntityFromStream(rendered, hidden);
    const fresh = streamEntityToGameEntity(hidden);
    expect(fresh).toMatchObject({ fadeVal: 0, cloakLevel: 1 });
    expect(rendered).toEqual(fresh);
  });

  it.each(["StaticShape", "Player"])(
    "requests a React update when %s changes or clears its skin",
    (className) => {
      const initial = shape({ className, skinName: "base" });
      const rendered = streamEntityToGameEntity(initial) as
        ShapeEntity | PlayerEntity;
      const changed = { ...initial, skinName: "beagle" };
      expect(updateGameEntityFromStream(rendered, changed)).toBe(true);
      expect(rendered.skinName).toBe("beagle");
      expect(updateGameEntityFromStream(rendered, changed)).toBe(false);
      expect(
        updateGameEntityFromStream(rendered, {
          ...initial,
          skinName: undefined,
        }),
      ).toBe(true);
      expect(rendered.skinName).toBeUndefined();
    },
  );

  it("updates a preferred player skin even when the base skin is unchanged", () => {
    const initial = shape({
      className: "Player",
      skinName: "base",
      skinPrefName: "customA",
    });
    const rendered = streamEntityToGameEntity(initial) as PlayerEntity;
    const changed = { ...initial, skinPrefName: "customB" };
    expect(updateGameEntityFromStream(rendered, changed)).toBe(true);
    expect(rendered.skinPrefName).toBe("customB");
    expect(updateGameEntityFromStream(rendered, changed)).toBe(false);
    expect(
      updateGameEntityFromStream(rendered, {
        ...initial,
        skinPrefName: undefined,
      }),
    ).toBe(true);
    expect(rendered.skinPrefName).toBeUndefined();
  });

  it("replaces wheel samples and steering on the existing vehicle, including stops and seeks", () => {
    const initial = shape({
      className: "WheeledVehicle",
      wheels: [
        {
          speed: 3,
          lateralSlip: 0,
          longitudinalSlip: 0,
          rotation: 0.2,
          timeSec: 10,
        },
      ],
      steeringYaw: 0.2,
      maxSteeringAngle: 0.3,
      frozen: false,
    });
    const rendered = streamEntityToGameEntity(initial) as ShapeEntity;
    for (const [speed, timeSec, frozen] of [
      [0, 20, true],
      [-1, 5, false],
    ] as const) {
      const changed = {
        ...initial,
        wheels: [{ ...initial.wheels![0], speed, timeSec, rotation: 0.8 }],
        steeringYaw: 0,
        maxSteeringAngle: 0.5,
        frozen,
      };
      expect(updateGameEntityFromStream(rendered, changed)).toBe(false);
      expect(rendered.wheels).toBe(changed.wheels);
      expect(rendered.steeringYaw).toBe(0);
      expect(rendered.maxSteeringAngle).toBe(0.5);
      expect(rendered.frozen).toBe(frozen);
      expect(rendered).toEqual(streamEntityToGameEntity(changed));
    }
  });

  it("still notifies React of mounting, unmounting and force field state changes", () => {
    const initial = shape();
    const rendered = streamEntityToGameEntity(initial);
    expect(
      updateGameEntityFromStream(rendered, {
        ...initial,
        mountObjectId: "mpb",
        mountNode: 2,
      }),
    ).toBe(true);
    expect(updateGameEntityFromStream(rendered, initial)).toBe(true);
    const field = shape({
      className: "ForceFieldBare",
      forceFieldState: ForceFieldState.Closed,
    });
    const renderedField = streamEntityToGameEntity(
      field,
    ) as ForceFieldBareEntity;
    expect(
      updateGameEntityFromStream(renderedField, {
        ...field,
        forceFieldState: ForceFieldState.Open,
      }),
    ).toBe(true);
    expect(renderedField.fieldOpen).toBe(true);
    expect(updateGameEntityFromStream(renderedField, field)).toBe(true);
    expect(renderedField.fieldOpen).toBeUndefined();
  });
});
