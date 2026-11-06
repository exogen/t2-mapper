import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LineSegments, Quaternion, Vector3 } from "three";
import { cameraTourStore } from "../state/cameraTourStore";
import type { ParticleEmissionDummyEntity } from "../state/gameEntityTypes";
import { settingsStore } from "../state/settingsStore";
import type { EntityView } from "./entityViews";
import type { GameEngine } from "./gameEngine";
import { createParticleEmissionDummyView } from "./particleEmissionDummyView";

const initialAccess = settingsStore.getState().access;
let view: EntityView | undefined;

beforeEach(() => {
  cameraTourStore.getState().cancel();
  settingsStore.setState({
    access: { ...initialAccess, canShowDebugVisuals: true },
  });
});

afterEach(() => {
  view?.dispose();
  view = undefined;
  cameraTourStore.getState().cancel();
  settingsStore.setState({ access: initialAccess });
  vi.restoreAllMocks();
});

function createView() {
  const entity: ParticleEmissionDummyEntity = {
    id: "ambient",
    className: "ParticleEmissionDummy",
    renderType: "ParticleEmissionDummy",
    position: [10, 20, 30],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    emissionVelocity: 1,
  };
  const driver = { update: vi.fn(), dispose: vi.fn() };
  const add = vi.fn(() => driver);
  const engine = { ambientParticles: { add } } as unknown as GameEngine;
  view = createParticleEmissionDummyView(entity, engine);
  return { entity, driver, add, view };
}

it("keeps one world-particle driver and refreshes frozen transforms before rendering", () => {
  const { entity, driver, add, view } = createView();
  expect(add).toHaveBeenCalledExactlyOnceWith(view.root, entity);
  expect(view.root.name).toBe(entity.id);
  expect(view.root.matrixAutoUpdate).toBe(false);
  view.root.updateWorldMatrix(true, false);
  expect(
    new Vector3().setFromMatrixPosition(view.root.matrixWorld).toArray(),
  ).toEqual([10, 20, 30]);

  const rotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 0, 1),
    Math.PI / 2,
  );
  const next: ParticleEmissionDummyEntity = {
    ...entity,
    position: [40, 50, 60],
    rotation: rotation.toArray(),
    scale: [2, 3, 4],
    emissionVelocity: 5,
  };
  expect(view.update!(next)).toBe(true);
  expect(add).toHaveBeenCalledTimes(1);
  expect(driver.update).toHaveBeenCalledExactlyOnceWith(next);
  // AmbientParticles queries the driver before the scene's render pass.
  view.root.updateWorldMatrix(true, false);
  expect(
    new Vector3().setFromMatrixPosition(view.root.matrixWorld).toArray(),
  ).toEqual([40, 50, 60]);
  const axis = new Vector3(0, 1, 0).transformDirection(view.root.matrixWorld);
  expect(axis.x).toBeCloseTo(-1);
  expect(axis.y).toBeCloseTo(0);
  expect(axis.z).toBeCloseTo(0);
  expect(
    view.update!({ id: entity.id, className: "Camera", renderType: "Camera" }),
  ).toBe(false);
  expect(driver.update).toHaveBeenCalledTimes(1);
});

it("disposes its debug marker and subscriptions together with the particle driver", () => {
  const { entity, driver, view: activeView } = createView();
  const model = activeView.root.children[0];
  const target = {
    entityId: entity.id,
    label: "Ambient",
    position: [10, 20, 30] as [number, number, number],
  };
  cameraTourStore.getState().flyTo(target, "debug");
  expect(model.children).toHaveLength(1);
  const marker = model.children[0] as LineSegments;
  const disposeGeometry = vi.spyOn(marker.geometry, "dispose");
  activeView.dispose();
  view = undefined;
  expect(driver.dispose).toHaveBeenCalledTimes(1);
  expect(driver.dispose).toHaveBeenCalledWith(false);
  expect(disposeGeometry).toHaveBeenCalledTimes(1);
  expect(model.children).toHaveLength(0);
  cameraTourStore.getState().cancel();
  cameraTourStore.getState().flyTo(target, "debug");
  settingsStore.setState({
    access: { ...initialAccess, canShowDebugVisuals: false },
  });
  settingsStore.setState({
    access: { ...initialAccess, canShowDebugVisuals: true },
  });
  expect(model.children).toHaveLength(0);
});

it("preserves particle tails only when the world object was removed", () => {
  const { driver, view: activeView } = createView();
  activeView.dispose("removed");
  view = undefined;
  expect(driver.dispose).toHaveBeenCalledExactlyOnceWith(true);
});
