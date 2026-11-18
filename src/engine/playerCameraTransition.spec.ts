import { expect, it } from "vitest";
import { advancePlayerCameraBlend } from "../stream/playerCameraBlend";
import { PlayerCameraTransition } from "./playerCameraTransition";

it("moves between first and third person in 100 ms at the stock speed", () => {
  const camera = new PlayerCameraTransition();
  expect(camera.update("body", 1, true, 0.02)).toBe(0);
  expect(camera.update("body", 1, false, 0.25)).toBe(0);
  expect(camera.update("body", 1, false, 0.02)).toBeCloseTo(0.2);
  expect(camera.update("body", 1, false, 0.08)).toBe(1);
  expect(camera.update("body", 1, true, 0.25)).toBe(1);
  expect(camera.update("body", 1, true, 0.04)).toBeCloseTo(0.6);
  expect(camera.update("body", 1, true, 0.06)).toBe(0);
});

it("reverses in place if the perspective is toggled mid-transition", () => {
  const camera = new PlayerCameraTransition();
  camera.update("body", 1, true, 0);
  expect(camera.update("body", 1, false, 0.05)).toBe(0);
  expect(camera.update("body", 1, false, 0.05)).toBe(0.5);
  expect(camera.update("body", 1, true, 0)).toBe(0.5);
  expect(camera.update("body", 1, true, 0.01)).toBeCloseTo(0.4);
  expect(camera.update("body", 1, false, 0.01)).toBeCloseTo(0.4);
  expect(camera.update("body", 1, false, 0.01)).toBeCloseTo(0.5);
});

it("cuts on a different body, a seek, or a camera ownership reset", () => {
  const camera = new PlayerCameraTransition();
  camera.update("old-body", 1, false, 0);
  camera.update("old-body", 1, true, 0.01);
  expect(camera.update("new-body", 1, true, 0.01)).toBe(0);
  expect(camera.update("new-body", 2, false, 0.01)).toBe(1);
  camera.reset();
  expect(camera.update("new-body", 2, true, 0.01)).toBe(0);
});

it("advances a partial recorded camera position at its own speed", () => {
  expect(advancePlayerCameraBlend(0.25, false, 0.05, 5)).toBe(0.5);
  expect(advancePlayerCameraBlend(0.75, true, 0.05, 5)).toBe(0.5);
});
