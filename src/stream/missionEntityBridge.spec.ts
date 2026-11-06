import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Quaternion, Vector3 } from "three";
import { createRuntime } from "../torqueScript/runtime";
import { registerEngineStubs } from "../torqueScript/engineMethods";
import { transpile } from "../torqueScript";
import {
  buildGameEntityFromMission,
  walkMissionTree,
  resolveTeamForObject,
} from "./missionEntityBridge";
import { DEFAULT_FLAG_SKINS } from "../stringUtils";
import type {
  ShapeEntity,
  ParticleEmissionDummyEntity,
} from "../state/gameEntityTypes";

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

describe("map-placed particle emitters", () => {
  it("harvests What on Earth's ten emitters with script units and map transforms", () => {
    const { runtime, exec } = makeRuntime();
    const asset = (path: string) =>
      readFileSync(
        new URL(
          `../../docs/base/@vl2/z_mappacks/z_DMP2-V0.6.vl2/${path}`,
          import.meta.url,
        ),
        "utf8",
      );
    exec(
      `datablock ParticleEmissionDummyData(defaultEmissionDummy) { timeMultiple = 1; };`,
    );
    exec(asset("scripts/zWOEGame.cs"));
    exec(asset("missions/woe.mis"));
    const emitters = walkMissionTree(
      runtime.getObjectByName("MissionGroup")!,
      runtime,
    ).filter(
      (e): e is ParticleEmissionDummyEntity =>
        e.renderType === "ParticleEmissionDummy",
    );
    expect(emitters).toHaveLength(10);
    expect(
      emitters.map((e) => e.particleEmitter?.particles.textureName),
    ).toEqual([
      "energyHaze",
      "energyHaze",
      "energyHaze",
      "energyHaze",
      "energyHaze",
      "energyHaze",
      "special/underwaterSpark",
      "precipitation/snowflake002",
      "precipitation/snowflake002",
      "precipitation/snowflake002",
    ]);
    expect(emitters[0]).toMatchObject({
      position: [-411.576, 143.05, -387.521],
      scale: [1, 1, 1],
      emissionVelocity: 1,
      timeMultiple: 1,
      particleEmitter: {
        ejectionVelocity: 5,
        ejectionOffset: 80,
        particles: { lifetimeMS: 3500, gravityCoefficient: -2.5 },
      },
    });
    const rain = emitters[6];
    const direction = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion(...rain.rotation!),
    );
    expect(direction.y).toBeCloseTo(-1, 4);
    expect(rain.particleEmitter).toMatchObject({
      ejectionPeriodMS: 1,
      ejectionVelocity: 350,
      orientParticles: true,
    });
    runtime.destroy();
  });

  it("resolves object datablock references and preserves zero scalar settings", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ParticleData(Smoke) { textureName = "smoke"; };
      datablock ParticleEmitterData(SmokeEmitter) { particles = Smoke; };
      datablock ParticleEmissionDummyData(Stopped) { timeMultiple = 0; };
      new ParticleEmissionDummy(Dummy) { datablock = Stopped; emitter = SmokeEmitter; velocity = 0; };
      new ParticleEmissionDummy(Unresolved) { emitter = "missing"; };
    `);
    const entity = buildGameEntityFromMission(
      runtime.getObjectByName("Dummy")!,
      runtime,
    );
    expect(entity).toMatchObject({
      renderType: "ParticleEmissionDummy",
      emissionVelocity: 0,
      timeMultiple: 0,
      particleEmitter: { particles: { textureName: "smoke" } },
    });
    expect(
      buildGameEntityFromMission(
        runtime.getObjectByName("Unresolved")!,
        runtime,
      ),
    ).toMatchObject({
      renderType: "ParticleEmissionDummy",
      particleEmitter: undefined,
      emissionVelocity: 1,
      timeMultiple: 1,
    });
    runtime.destroy();
  });

  it("resolves scripted datablock ids for the dummy, emitter and particle", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ParticleData(Smoke) { textureName = "smoke"; };
      datablock ParticleEmitterData(SmokeEmitter) { particles = "Smoke"; };
      datablock ParticleEmissionDummyData(HalfTime) { timeMultiple = 0.5; };
      SmokeEmitter.particles = Smoke.getId();
      new ParticleEmissionDummy(Dummy) {
        datablock = HalfTime.getId();
        emitter = SmokeEmitter.getId();
      };
    `);
    expect(
      buildGameEntityFromMission(runtime.getObjectByName("Dummy")!, runtime),
    ).toMatchObject({
      renderType: "ParticleEmissionDummy",
      timeMultiple: 0.5,
      particleEmitter: { particles: { textureName: "smoke" } },
    });
    runtime.destroy();
  });
});

describe("mission datablock references", () => {
  it("keeps resolved names in shape and camera entities for id and object references", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ItemData(Flag) { shapeFile = "flag.dts"; };
      datablock CameraData(Observer) {};
      new Item(NumericFlag) { datablock = Flag.getId(); team = 2; };
      new Camera(HandleCamera) {};
    `);
    const camera = runtime.getObjectByName("HandleCamera")!;
    camera.datablock = runtime.state.datablocks.get("Observer");
    expect(
      buildGameEntityFromMission(
        runtime.getObjectByName("NumericFlag")!,
        runtime,
      ),
    ).toMatchObject({
      renderType: "Shape",
      dataBlock: "Flag",
      shapeName: "flag.dts",
      skinName: DEFAULT_FLAG_SKINS[2],
    });
    expect(buildGameEntityFromMission(camera, runtime)).toMatchObject({
      renderType: "Camera",
      cameraDataBlock: "Observer",
    });
    runtime.destroy();
  });
});

describe("mission-type visibility fidelity", () => {
  it("keeps interiors with mismatched missionTypesList visible", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(MissionGroup) {
        new InteriorInstance() {
          position = "0 0 0";
          interiorFile = "pmisc3.dif";
          missionTypesList = "Siege";
        };
      };
    `);
    const entities = walkMissionTree(
      runtime.getObjectByName("MissionGroup")!,
      runtime,
      "CTF",
    );
    const interior = entities.find((e) => e.className === "InteriorInstance");
    expect(interior).toBeDefined();
    expect(interior!.hidden).toBeUndefined();
  });

  it("hides ShapeBase objects with mismatched missionTypesList when scripts did not run", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new SimGroup(MissionGroup) {
        new StaticShape(OnlySiege) {
          position = "0 0 0";
          dataBlock = "GeneratorLarge";
          missionTypesList = "Siege";
        };
        new StaticShape(AllTypes) {
          position = "0 0 0";
          dataBlock = "GeneratorLarge";
        };
      };
    `);
    const entities = walkMissionTree(
      runtime.getObjectByName("MissionGroup")!,
      runtime,
      "CTF",
    );
    const hiddenShape = entities.find((e) => e.id.length && e.hidden);
    expect(hiddenShape).toBeDefined();
    const visible = entities.filter((e) => !e.hidden);
    expect(visible).toHaveLength(1);
  });

  it("does not hide ForceFieldBare by mission type (GameBase, not ShapeBase)", () => {
    // ShapeBase::cleanNonType only hides ShapeBase-derived objects;
    // ForceFieldBare descends from GameBase and gets the SimObject no-op.
    const { runtime, exec } = makeRuntime();
    exec(`
      new ForceFieldBare(F) {
        position = "0 0 0";
        scale = "4 4 8";
        missionTypesList = "Siege";
      };
    `);
    const entity = buildGameEntityFromMission(
      runtime.getObjectByName("F")!,
      runtime,
      undefined,
      "CTF",
    );
    expect(entity!.hidden).toBeUndefined();
  });

  it("prefers script truth over the missionTypesList fallback", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new StaticShape(KeptVisible) {
        position = "0 0 0";
        missionTypesList = "Siege";
      };
      new StaticShape(ScriptHidden) {
        position = "0 0 0";
      };
      KeptVisible.hide(0);
      ScriptHidden.hide(1);
    `);
    const kept = buildGameEntityFromMission(
      runtime.getObjectByName("KeptVisible")!,
      runtime,
      undefined,
      "CTF",
    );
    const hidden = buildGameEntityFromMission(
      runtime.getObjectByName("ScriptHidden")!,
      runtime,
      undefined,
      "CTF",
    );
    expect(kept!.hidden).toBeUndefined();
    expect(hidden!.hidden).toBe(true);
  });
});

describe("script-mounted images", () => {
  it("retains inherited image offset and rotation for mounted and initial barrels", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ShapeBaseImageData(OffsetBase) {
        shapeFile = "turret_sentry_barrel.dts";
        offset = "1 2 3";
        rotation = "0 0 1 90";
      };
      datablock ShapeBaseImageData(OffsetImage) : OffsetBase { mountPoint = 4; };
      new Turret(Mounted) {position = "0 0 0";};
      new Turret(Initial) {position = "0 0 0";initialBarrel = "OffsetImage";};
      Mounted.mountImage(OffsetImage, 0, true);
    `);
    const mounted = buildGameEntityFromMission(
      runtime.getObjectByName("Mounted")!,
      runtime,
    ) as ShapeEntity;
    const initial = buildGameEntityFromMission(
      runtime.getObjectByName("Initial")!,
      runtime,
    ) as ShapeEntity;
    const slot = mounted.imageSlots![0]!;
    expect(slot.mountPoint).toBe(4);
    expect(slot.mountOffset!.position).toEqual([-1, 3, 2]);
    expect(slot.mountOffset!.quaternion[1]).toBeCloseTo(-Math.SQRT1_2);
    expect(slot.mountOffset!.quaternion[3]).toBeCloseTo(Math.SQRT1_2);
    expect(initial.imageSlots![0]!.mountOffset).toBe(slot.mountOffset);
  });
  it("lifts imageSlots from _mountedImages", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ShapeBaseImageData(SentryBarrel) {
        shapeFile = "turret_sentry_barrel.dts";
        mountPoint = 1;
      };
      new Turret(T) {
        position = "0 0 0";
        dataBlock = "SentryBase";
      };
      T.mountImage(SentryBarrel, 0, true, "base");
    `);
    const entity = buildGameEntityFromMission(
      runtime.getObjectByName("T")!,
      runtime,
    ) as ShapeEntity;
    expect(entity.imageSlots?.[0]).toEqual({
      shapeName: "turret_sentry_barrel.dts",
      mountPoint: 1,
      dataBlockId: 0,
      skinName: "base",
    });
  });

  it("falls back to initialBarrel when no images are mounted", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ShapeBaseImageData(MortarBarrelLarge) {
        shapeFile = "turret_mortar_large.dts";
        mountPoint = 0;
      };
      new Turret(T) {
        position = "0 0 0";
        initialBarrel = "MortarBarrelLarge";
      };
    `);
    const entity = buildGameEntityFromMission(
      runtime.getObjectByName("T")!,
      runtime,
    ) as ShapeEntity;
    expect(entity.imageSlots?.[0]?.shapeName).toBe("turret_mortar_large.dts");
  });
});

describe("force field open state", () => {
  it("lifts fieldOpen from script open()/close()", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      new ForceFieldBare(F) { position = "0 0 0"; scale = "4 4 8"; };
      F.open();
    `);
    const obj = runtime.getObjectByName("F")!;
    let entity = buildGameEntityFromMission(obj, runtime);
    expect(entity).toMatchObject({ fieldOpen: true });
    exec(`F.close();`);
    entity = buildGameEntityFromMission(obj, runtime);
    expect((entity as { fieldOpen?: boolean }).fieldOpen).toBeUndefined();
  });
});

describe("team resolution", () => {
  it("resolves team from SimGroup ancestry and applies flag skins", () => {
    const { runtime, exec } = makeRuntime();
    exec(`
      datablock ItemData(Flag) { shapeFile = "flag.dts"; };
      new SimGroup(MissionGroup) {
        new SimGroup(Teams) {
          new SimGroup(Team2) {
            new Item(TheFlag) {
              position = "0 0 0";
              dataBlock = "Flag";
            };
          };
        };
      };
    `);
    const flagObj = runtime.getObjectByName("TheFlag")!;
    expect(resolveTeamForObject(flagObj)).toBe(2);
    const entities = walkMissionTree(
      runtime.getObjectByName("MissionGroup")!,
      runtime,
      "CTF",
    );
    const flag = entities.find((e) => e.className === "Item") as ShapeEntity;
    expect(flag.teamId).toBe(2);
    expect(flag.skinName).toBe(DEFAULT_FLAG_SKINS[2]);
  });

  it("returns undefined for ungrouped objects", () => {
    const { runtime, exec } = makeRuntime();
    exec(`new StaticShape(Loner) { position = "0 0 0"; };`);
    expect(
      resolveTeamForObject(runtime.getObjectByName("Loner")!),
    ).toBeUndefined();
  });
});
