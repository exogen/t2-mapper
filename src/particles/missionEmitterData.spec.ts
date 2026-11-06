import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createRuntime } from "../torqueScript/runtime";
import type { TorqueRuntime } from "../torqueScript/types";
import { EmitterInstance } from "./ParticleSystem";
import { resolveMissionEmitterData } from "./missionEmitterData";

let runtime: TorqueRuntime | undefined;
afterEach(() => runtime?.destroy());

async function execute(source: string): Promise<TorqueRuntime> {
  runtime = createRuntime();
  (await runtime.loadFromSource(source)).execute();
  return runtime;
}

describe("script-native emitter data", () => {
  it("resolves inherited datablocks and authored units without modifying them", async () => {
    const rt = await execute(`
      datablock ParticleData(BaseParticle) {
        dragCoefficient = "0.75";
        gravityCoefficient = "-2.5";
        lifetimeMS = "3500";
        spinRandomMin = "-50";
        spinRandomMax = "50";
        textureName = "energyHaze";
        colors[0] = "0 0.5 1 0";
        colors[1] = "0 0.5 1 0.2";
        sizes[0] = "50";
        times[0] = "0.1";
        times[1] = "0.2";
      };
      datablock ParticleData(HazeParticle) : BaseParticle { lifetimeVarianceMS = "500"; };
      datablock ParticleEmitterData(BaseEmitter) {
        particles = "Missing HazeParticle";
        ejectionVelocity = "5";
        ejectionOffset = "80";
        overrideAdvance = "1";
      };
      datablock ParticleEmitterData(HazeEmitter) : BaseEmitter { ejectionPeriodMS = "2"; };
    `);
    const emitter = rt.state.datablocks.get("HazeEmitter")!;
    const particle = rt.state.datablocks.get("HazeParticle")!;
    const beforeEmitter = { ...emitter },
      beforeParticle = { ...particle };
    const resolved = resolveMissionEmitterData(emitter, rt)!;
    expect(resolved).toMatchObject({
      ejectionPeriodMS: 2,
      ejectionVelocity: 5,
      ejectionOffset: 80,
      overrideAdvances: true,
      particles: {
        dragCoefficient: 0.75,
        gravityCoefficient: -2.5,
        lifetimeMS: 3500,
        lifetimeVarianceMS: 500,
        spinRandomMin: -50,
        spinRandomMax: 50,
        textureName: "energyHaze",
      },
    });
    expect(resolved.particles.keys[0]).toEqual({
      r: 0,
      g: 0.5,
      b: 1,
      a: 0,
      size: 50,
      time: 0,
    });
    expect(emitter).toEqual(beforeEmitter);
    expect(particle).toEqual(beforeParticle);
    emitter.position = "10 20 30";
    expect(resolveMissionEmitterData(emitter, rt)).toBe(resolved);
    emitter.ejectionvelocity = 6;
    const editedEmitter = resolveMissionEmitterData(emitter, rt)!;
    expect(editedEmitter).not.toBe(resolved);
    expect(editedEmitter.ejectionVelocity).toBe(6);
    expect(resolveMissionEmitterData(emitter, rt)).toBe(editedEmitter);
    particle.gravitycoefficient = -1;
    const editedParticle = resolveMissionEmitterData(emitter, rt)!;
    expect(editedParticle).not.toBe(editedEmitter);
    expect(editedParticle.particles.gravityCoefficient).toBe(-1);
  });

  it("uses native defaults and validates periods, lifetimes and key times", async () => {
    const rt = await execute(`
      datablock ParticleData(DefaultParticle) {};
      datablock ParticleEmitterData(DefaultEmitter) { particles = "DefaultParticle"; };
      datablock ParticleData(FixedParticle) {
        lifetimeMS = 0;
        lifetimeVarianceMS = 100;
        dragCoefficient = -1;
        times[1] = 0.8;
        times[2] = 0.3;
      };
      datablock ParticleEmitterData(FixedEmitter) {
        particles = "FixedParticle";
        ejectionPeriodMS = 0;
        periodVarianceMS = 10;
        ejectionVelocity = -10;
        velocityVariance = 20;
        ejectionOffset = -1;
        thetaMin = 200;
        thetaMax = 190;
        phiVariance = 400;
        lifetimeMS = -1;
        lifetimeVarianceMS = 20;
      };
    `);
    const defaults = resolveMissionEmitterData(
      rt.state.datablocks.get("DefaultEmitter")!,
      rt,
    )!;
    expect(defaults).toMatchObject({
      ejectionPeriodMS: 100,
      ejectionVelocity: 2,
      velocityVariance: 1,
      thetaMin: 0,
      thetaMax: 90,
      phiVariance: 360,
      overrideAdvances: false,
      orientOnVelocity: true,
      particles: {
        lifetimeMS: 1000,
        windCoefficient: 1,
        spinRandomMin: 0,
        spinRandomMax: 0,
      },
    });
    const fixed = resolveMissionEmitterData(
      rt.state.datablocks.get("FixedEmitter")!,
      rt,
    )!;
    expect(fixed).toMatchObject({
      ejectionPeriodMS: 1,
      periodVarianceMS: 0,
      ejectionVelocity: 0,
      velocityVariance: 0,
      ejectionOffset: 0,
      thetaMin: 180,
      thetaMax: 180,
      phiVariance: 360,
      lifetimeMS: 0,
      lifetimeVarianceMS: 0,
      particles: { lifetimeMS: 1, lifetimeVarianceMS: 0, dragCoefficient: 0 },
    });
    expect(fixed.particles.keys.map((key) => key.time)).toEqual([
      0, 0.8, 0.8, 2,
    ]);
  });

  it("returns null without a valid particle datablock", async () => {
    const rt = await execute(`
      datablock ParticleData(InvalidParticle) { spinRandomMin = 50; spinRandomMax = -50; };
      datablock ParticleEmitterData(InvalidEmitter) { particles = "Missing InvalidParticle"; };
    `);
    expect(
      resolveMissionEmitterData(rt.state.datablocks.get("InvalidEmitter")!, rt),
    ).toBeNull();
  });

  it("resolves particle datablock handles and numeric ids like native pointer fields", async () => {
    const rt = await execute(`
      datablock ParticleData(Smoke) { textureName = "smoke"; };
      datablock ParticleEmitterData(SmokeEmitter) { particles = "Smoke"; };
    `);
    const emitter = rt.state.datablocks.get("SmokeEmitter")!;
    const particle = rt.state.datablocks.get("Smoke")!;
    const named = resolveMissionEmitterData(emitter, rt);
    for (const reference of [particle, particle._id, String(particle._id)]) {
      emitter.particles = reference;
      expect(resolveMissionEmitterData(emitter, rt)).toBe(named);
    }
  });
});

const woeSource = new URL(
  "../../docs/base/@vl2/z_mappacks/z_DMP2-V0.6.vl2/scripts/zWOEGame.cs",
  import.meta.url,
);
describe.skipIf(!fs.existsSync(woeSource))(
  "What on Earth ambient particles",
  () => {
    it("resolves all ten mission emitters and simulates their native particle data", async () => {
      const rt = await execute(
        [
          fs.readFileSync(woeSource, "utf8"),
          fs.readFileSync(
            new URL(
              "../../docs/base/@vl2/scripts.vl2/scripts/particleDummies.cs",
              import.meta.url,
            ),
            "utf8",
          ),
          fs.readFileSync(
            new URL(
              "../../docs/base/@vl2/z_mappacks/z_DMP2-V0.6.vl2/missions/woe.mis",
              import.meta.url,
            ),
            "utf8",
          ),
        ].join("\n"),
      );
      const dummies = [...rt.state.objectsById.values()].filter(
        (object) => object._class === "particleemissiondummy",
      );
      expect(dummies).toHaveLength(10);
      const names: Record<string, number> = {};
      for (const dummy of dummies) {
        names[dummy.emitter] = (names[dummy.emitter] ?? 0) + 1;
        const resolved = resolveMissionEmitterData(
          rt.state.datablocks.get(dummy.emitter)!,
          rt,
        )!;
        expect(resolved).not.toBeNull();
        const simulation = new EmitterInstance(resolved, 256, () => 0.5);
        simulation.emitPeriodic([0, 0, 0], [0, 0, 0], 16);
        simulation.update(16);
        expect(simulation.particles.length).toBeGreaterThan(0);
        expect(
          simulation.particles.every((particle) =>
            particle.pos.every(Number.isFinite),
          ),
        ).toBe(true);
      }
      expect(names).toEqual({
        energyHazeEmitter: 2,
        energyHazeEmitter2: 4,
        RainEmitter: 1,
        SnowEmitter4: 3,
      });
      const haze = resolveMissionEmitterData(
        rt.state.datablocks.get("energyHazeEmitter")!,
        rt,
      )!;
      expect(haze).toMatchObject({
        ejectionOffset: 80,
        particles: { lifetimeMS: 3500, gravityCoefficient: -2.5 },
      });
      expect(haze.particles.keys[0].time).toBe(0);
    });
  },
);
