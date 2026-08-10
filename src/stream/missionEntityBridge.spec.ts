import { describe, it, expect, vi } from "vitest";
import { createRuntime } from "../torqueScript/runtime";
import { registerEngineStubs } from "../torqueScript/engineMethods";
import { transpile } from "../torqueScript";
import {
  buildGameEntityFromMission,
  walkMissionTree,
  resolveTeamForObject,
} from "./missionEntityBridge";
import { DEFAULT_FLAG_SKINS } from "../stringUtils";
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
