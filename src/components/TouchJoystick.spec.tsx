import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TouchJoystick } from "./TouchJoystick";

const test = vi.hoisted(() => ({
  touchMode: "dualStick",
  zones: [] as HTMLElement[],
  stateIndex: 0,
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  move: { angle: 0, force: 0 },
  look: { angle: 0, force: 0 },
  create: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [test.zones[test.stateIndex++] ?? null, () => {}],
  useEffect: (effect: () => void | (() => void)) => test.effects.push(effect),
}));
vi.mock("nipplejs", () => ({ create: test.create }));
vi.mock("./SettingsProvider", () => ({
  useControls: () => ({ touchMode: test.touchMode }),
}));
vi.mock("./JoystickContext", () => ({
  useJoystick: () => ({
    setMoveState: (state: Partial<typeof test.move>) =>
      Object.assign(test.move, state),
    setLookState: (state: Partial<typeof test.look>) =>
      Object.assign(test.look, state),
  }),
}));

type MoveEvent = { data: { angle: { radian: number }; force: number } };

function createManager() {
  const handlers = new Map<string, (event: MoveEvent) => void>();
  const actives = new Map<number, { end: () => void }>();
  const end = vi.fn(() => {
    actives.clear();
    handlers.get("end")?.({ data: { angle: { radian: 0 }, force: 0 } });
  });
  return {
    actives,
    end,
    on: (type: string, handler: (event: MoveEvent) => void) =>
      handlers.set(type, handler),
    destroy: vi.fn(),
    move: (angle: number, force: number) => {
      actives.set(1, { end });
      handlers.get("move")!({ data: { angle: { radian: angle }, force } });
    },
  };
}

function mount() {
  TouchJoystick();
  for (const effect of test.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) test.cleanups.push(cleanup);
  }
}

function unmount() {
  for (const cleanup of test.cleanups.splice(0)) cleanup();
}

function mountSticks() {
  mount();
  expect(test.create).toHaveBeenCalledTimes(2);
  return test.create.mock.results.map(
    (result) => result.value as ReturnType<typeof createManager>,
  );
}

beforeEach(() => {
  test.touchMode = "dualStick";
  test.stateIndex = 0;
  test.zones = [
    { querySelector: () => null } as unknown as HTMLElement,
    { querySelector: () => null } as unknown as HTMLElement,
  ];
  test.move = { angle: 0, force: 0 };
  test.look = { angle: 0, force: 0 };
  test.create.mockReset().mockImplementation(createManager);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { hidden: false }),
  );
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

it("reads v1 event payloads, clamps force, and stops sticks independently", () => {
  const [move, look] = mountSticks();
  move.move(Math.PI / 2, 0.5);
  look.move(Math.PI, 1.5);
  expect(test.move).toEqual({ angle: Math.PI / 2, force: 0.5 });
  expect(test.look).toEqual({ angle: Math.PI, force: 1 });
  move.end();
  expect(test.move.force).toBe(0);
  expect(test.look.force).toBe(1);
  look.end();
  expect(test.look.force).toBe(0);
});

it("ends held sticks before destroying managers, stopping their pressure timers", () => {
  const managers = mountSticks();
  managers.forEach((manager) => manager.move(0, 0.8));
  unmount();
  expect(test.move.force).toBe(0);
  expect(test.look.force).toBe(0);
  for (const manager of managers) {
    expect(manager.end).toHaveBeenCalledOnce();
    expect(manager.destroy).toHaveBeenCalledOnce();
    expect(manager.end.mock.invocationCallOrder[0]).toBeLessThan(
      manager.destroy.mock.invocationCallOrder[0],
    );
  }
});

it("releases held sticks on focus loss and allows new input afterward", () => {
  const [move, look] = mountSticks();
  move.move(0, 0.5);
  look.move(Math.PI, 0.8);
  window.dispatchEvent(new Event("blur"));
  expect(test.move.force).toBe(0);
  expect(test.look.force).toBe(0);
  expect(move.end).toHaveBeenCalledOnce();
  expect(look.end).toHaveBeenCalledOnce();
  move.move(Math.PI / 2, 0.6);
  expect(test.move).toEqual({ angle: Math.PI / 2, force: 0.6 });
});

it("releases held sticks when the document is hidden, without resetting on visibility restoration", () => {
  const [move, look] = mountSticks();
  move.move(0, 0.5);
  look.move(0, 0.8);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(test.move.force).toBe(0.5);
  expect(test.look.force).toBe(0.8);
  Object.assign(document, { hidden: true });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(test.move.force).toBe(0);
  expect(test.look.force).toBe(0);
});

it("removes focus and visibility handlers on unmount", () => {
  mountSticks();
  unmount();
  test.move.force = test.look.force = 0.4;
  window.dispatchEvent(new Event("blur"));
  Object.assign(document, { hidden: true });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(test.move.force).toBe(0.4);
  expect(test.look.force).toBe(0.4);
});

it("only creates a movement stick in single-stick mode", () => {
  test.touchMode = "moveLookStick";
  test.zones.pop();
  mount();
  expect(test.create).toHaveBeenCalledOnce();
  expect(test.create.mock.lastCall![0].zone).toBe(test.zones[0]);
});

it("waits for DOM zones before creating sticks", () => {
  test.zones = [];
  mount();
  expect(test.create).not.toHaveBeenCalled();
});
