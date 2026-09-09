import { describe, expect, it } from "vitest";
import type { StreamEntity, StreamSnapshot } from "../stream/types";
import { ParticleSnapshotIndex } from "./particleSnapshot";

function snapshot(entities: StreamEntity[], timeSec = 1) {
  return { entities, timeSec } as StreamSnapshot;
}

describe("particle snapshot index", () => {
  it("scans once between simulation ticks, but refreshes on same-time seeks", () => {
    const index = new ParticleSnapshotIndex();
    const first = snapshot([{ id: "1", type: "Explosion" }]);
    expect(index.update(first)).toBe(true);
    for (let i = 0; i < 120; i++) expect(index.update(first)).toBe(false);
    const replacement = snapshot([
      { id: "1", type: "Projectile", maintainEmitterId: 10 },
    ]);
    expect(index.update(replacement)).toBe(true);
    expect(index.entities.get("1")).toBe(replacement.entities[0]);
    expect(index.explosions).toHaveLength(0);
    expect(index.trails).toEqual(replacement.entities);
    expect(index.audio).toEqual(replacement.entities);
    index.update(snapshot([]));
    expect(index.entities.size).toBe(0);
    expect(index.trails).toHaveLength(0);
    expect(index.audio).toHaveLength(0);
  });

  it("keeps driver lookup for all entities while excluding scenery from effect scans", () => {
    const index = new ParticleSnapshotIndex();
    const staticShape = { id: "static", type: "StaticShape" };
    const explosion = { id: "explosion", type: "Explosion" };
    const bolt = {
      id: "bolt",
      type: "Projectile",
      visual: { kind: "shockLance" },
    } as StreamEntity;
    index.update(snapshot([staticShape, explosion, bolt]));
    expect(index.entities.get("static")).toBe(staticShape);
    expect(index.explosions).toEqual([explosion]);
    expect(index.shockLances).toEqual([bolt]);
    expect(index.audio).toEqual([explosion, bolt]);
    expect(index.trails).toHaveLength(0);
  });
});
