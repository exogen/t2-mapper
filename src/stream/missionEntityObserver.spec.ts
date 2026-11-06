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

  it("publishes native weather commands, sky wind changes and scripted storms", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock PrecipitationData(RainData) { type = 0; };
      datablock LightningData(StormData) {};
      new SimGroup(MissionGroup) {
        new Precipitation(Rain) { dataBlock = RainData; percentage = 1; };
        new Lightning(Storm) { dataBlock = StormData; strikesPerMinute = 5; };
        new Sky(WeatherSky) { windVelocity = "1 0 0"; };
      };
    `);
    gameEntityStore
      .getState()
      .setAllEntities(
        walkMissionTree(runtime.getObjectByName("MissionGroup")!, runtime),
      );
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime);
    try {
      const rainId = String(runtime.getObjectByName("Rain")!._id);
      const stormId = String(runtime.getObjectByName("Storm")!._id);
      const skyId = String(runtime.getObjectByName("WeatherSky")!._id);
      exec(`
        Rain.setPercentage(0.25);
        Rain.stormPrecipitation(0, 2);
        Storm.strikeRandomPoint();
        Storm.strikeRandomPoint();
        Storm.strikesPerMinute = 10;
        WeatherSky.windVelocity = "0 1 0";
        WeatherSky.windEffectPrecipitation = true;
      `);
      await flush();
      expect(entities().get(rainId)).toMatchObject({
        renderType: "Precipitation",
        precipitation: {
          drawCount: 500,
          storm: { duration: 2.048, startPercentage: 0.25, endPercentage: 0 },
        },
      });
      expect(entities().get(stormId)).toMatchObject({
        renderType: "Lightning",
        lightning: { strikesPerMinute: 10 },
        lightningRequests: [{ sequence: 1 }, { sequence: 2 }],
      });
      expect(entities().get(skyId)).toMatchObject({
        renderType: "Sky",
        skyData: {
          windVelocity: { x: 0, y: 1, z: 0 },
          windEffectPrecipitation: true,
        },
      });
      exec(`
        Rain.stormShow(false);
        new SimGroup(MissionCleanup) {};
        $instantGroup = "MissionCleanup";
        new Precipitation(SpawnedRain) { dataBlock = RainData; };
        Storm.delete();
      `);
      await flush();
      expect(entities().get(rainId)).toMatchObject({
        precipitation: { enabled: false },
      });
      expect(
        entities().get(String(runtime.getObjectByName("SpawnedRain")!._id)),
      ).toMatchObject({ renderType: "Precipitation" });
      expect(entities().has(stormId)).toBe(false);
    } finally {
      unsubscribe();
      runtime.destroy();
    }
  });

  it("publishes native Sky storms and keeps raw wind distinct from the render cache", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(MissionGroup) {
        new Sky(WeatherSky) {
          fogVolume1 = "400 0 200";
          windVelocity = "1 0 0";
        };
      };
    `);
    gameEntityStore
      .getState()
      .setAllEntities(
        walkMissionTree(runtime.getObjectByName("MissionGroup")!, runtime),
      );
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime);
    try {
      const skyId = String(runtime.getObjectByName("WeatherSky")!._id);
      exec(`
        WeatherSky.stormCloudsShow(false);
        WeatherSky.stormClouds(1, 3);
        WeatherSky.stormFogShow(false);
        WeatherSky.stormFog(1, 2);
        WeatherSky.setWindVelocity(0, 2, 4);
      `);
      await flush();
      expect(entities().get(skyId)).toMatchObject({
        renderType: "Sky",
        skyData: {
          windVelocity: { x: 0, y: 2, z: 4 },
          weather: {
            renderWind: { x: 1, y: 0, z: 0 },
            cloudsOn: true,
            cloudStorm: { state: 1, duration: 3.072 },
            fog: [{ from: 0, to: 1, duration: 2.048 }],
          },
        },
      });
    } finally {
      unsubscribe();
      runtime.destroy();
    }
  });

  it("observes ambient emitter changes, transforms, scripted spawns and deletions", async () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ParticleData(FirstParticle) { textureName = "first"; };
      datablock ParticleData(SecondParticle) { textureName = "second"; };
      datablock ParticleEmitterData(FirstEmitter) { particles = FirstParticle; };
      datablock ParticleEmitterData(SecondEmitter) { particles = SecondParticle; };
      new SimGroup(MissionGroup) {
        new ParticleEmissionDummy(Dummy) { emitter = "FirstEmitter"; velocity = 1; };
      };
    `);
    gameEntityStore
      .getState()
      .setAllEntities(
        walkMissionTree(runtime.getObjectByName("MissionGroup")!, runtime),
      );
    await flush();
    const unsubscribe = createMissionEntityObserver(runtime);
    const id = String(runtime.getObjectByName("Dummy")!._id);
    exec(
      `Dummy.emitter = SecondEmitter; Dummy.velocity = 0; Dummy.position = "1 2 3"; Dummy.scale = "4 5 6";`,
    );
    await flush();
    expect(entities().get(id)).toMatchObject({
      renderType: "ParticleEmissionDummy",
      emissionVelocity: 0,
      position: [2, 3, 1],
      scale: [5, 6, 4],
      particleEmitter: { particles: { textureName: "second" } },
    });
    exec(
      `new SimGroup(MissionCleanup) {}; $instantGroup = "MissionCleanup"; new ParticleEmissionDummy(Spawned) { emitter = FirstEmitter; };`,
    );
    await flush();
    const spawnedId = String(runtime.getObjectByName("Spawned")!._id);
    expect(entities().get(spawnedId)).toMatchObject({
      renderType: "ParticleEmissionDummy",
    });
    exec(`Dummy.delete(); Spawned.delete();`);
    await flush();
    expect(entities().has(id)).toBe(false);
    expect(entities().has(spawnedId)).toBe(false);
    unsubscribe();
    runtime.destroy();
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
