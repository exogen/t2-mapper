import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRuntime } from "../torqueScript/runtime";
import { registerEngineStubs } from "../torqueScript/engineMethods";
import { transpile } from "../torqueScript";
import { gameEntityStore } from "../state/gameEntityStore";
import { walkMissionTree } from "./missionEntityBridge";
import { createMissionEntityObserver } from "./missionEntityObserver";
import type { ShapeEntity } from "../state/gameEntityTypes";

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
}));

vi.mock("../logger", () => ({
  createLogger: () => mockLogger,
}));

function makeRuntime() {
  const runtime = createRuntime();
  registerEngineStubs(runtime);
  const exec = (script: string) => {
    const { code } = transpile(script);
    const $l = runtime.$.locals();
    new Function("$", "$f", "$g", "$l", code)(
      runtime.$,
      runtime.$f,
      runtime.$g,
      $l,
    );
  };
  return { runtime, exec };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function entities() {
  return gameEntityStore.getState().missionEntities;
}

describe("createMissionEntityObserver", () => {
  beforeEach(() => {
    gameEntityStore.getState().clearEntities();
  });

  it("adds script-spawned objects under MissionGroup to the store", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(MissionGroup) {};
      $instantGroup = "MissionGroup";
    `);
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime, "CTF");

    exec(`new StaticShape(Terminal) { position = "5 6 7"; };`);
    await flush();

    const spawned = runtime.getObjectByName("Terminal")!;
    const entity = entities().get(String(spawned._id));
    expect(entity).toBeDefined();
    expect(entity!.className).toBe("StaticShape");
    unsubscribe();
  });

  it("ignores objects created outside mission roots", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(ServerGroup) {};
      $instantGroup = "ServerGroup";
    `);
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime);

    exec(`new StaticShape(Hidden) { position = "0 0 0"; };`);
    await flush();

    expect(entities().size).toBe(0);
    unsubscribe();
  });

  it("rebuilds entities on hide() and preserves untouched identities", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(MissionGroup) {
        new StaticShape(A) { position = "0 0 0"; };
        new StaticShape(B) { position = "1 1 1"; };
      };
    `);
    const missionGroup = runtime.getObjectByName("MissionGroup")!;
    gameEntityStore
      .getState()
      .setAllEntities(walkMissionTree(missionGroup, runtime, "CTF"));
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime, "CTF");

    const aId = String(runtime.getObjectByName("A")!._id);
    const bId = String(runtime.getObjectByName("B")!._id);
    const bBefore = entities().get(bId);

    exec(`A.hide(1);`);
    await flush();

    expect(entities().get(aId)!.hidden).toBe(true);
    expect(entities().get(bId)).toBe(bBefore);
    unsubscribe();
  });

  it("removes deleted objects from the store", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(MissionGroup) {
        new StaticShape(Doomed) { position = "0 0 0"; };
      };
    `);
    const missionGroup = runtime.getObjectByName("MissionGroup")!;
    const doomedId = String(runtime.getObjectByName("Doomed")!._id);
    gameEntityStore
      .getState()
      .setAllEntities(walkMissionTree(missionGroup, runtime));
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime);
    expect(entities().has(doomedId)).toBe(true);

    exec(`Doomed.delete();`);
    await flush();

    expect(entities().has(doomedId)).toBe(false);
    unsubscribe();
  });

  it("lifts mounted images on mountImage()", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ShapeBaseImageData(BarrelImage) {
        shapeFile = "barrel.dts";
        mountPoint = 2;
      };
      new SimGroup(MissionGroup) {
        new Turret(T) { position = "0 0 0"; };
      };
    `);
    const missionGroup = runtime.getObjectByName("MissionGroup")!;
    gameEntityStore
      .getState()
      .setAllEntities(walkMissionTree(missionGroup, runtime));
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime);

    exec(`T.mountImage(BarrelImage, 0);`);
    await flush();

    const tId = String(runtime.getObjectByName("T")!._id);
    const entity = entities().get(tId) as ShapeEntity;
    expect(entity.imageSlots?.[0]?.shapeName).toBe("barrel.dts");
    expect(entity.imageSlots?.[0]?.mountPoint).toBe(2);
    unsubscribe();
  });
});
