import { expect, it } from "vitest";
import { GroundEffectHistory } from "./groundEffectHistory";
it("retains only recent immutable inputs and restores them without sharing mutable arrays", () => {
  const h = new GroundEffectHistory();
  for (let t = 0; t <= 10; t++)
    h.append({ timeSec: t, gravity: -9.81, actors: [] });
  const checkpoint = h.save();
  expect(checkpoint.frames.map((f) => f.timeSec)).toEqual([
    2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  h.append({ timeSec: 11, gravity: -9.81, actors: [] });
  h.restore(checkpoint);
  h.append({ timeSec: 10.5, gravity: -9.81, actors: [] });
  const visited: number[] = [];
  h.visit(9, 20, (f) => visited.push(f.timeSec));
  expect(visited).toEqual([10, 10.5]);
  expect(checkpoint.frames.at(-1)?.timeSec).toBe(10);
  expect(h.generation).toBe(1);
});
it("bounds storage during long playback", () => {
  const h = new GroundEffectHistory();
  for (let i = 0; i < 40000; i++)
    h.append({ timeSec: i * 0.032, gravity: -9.81, actors: [] });
  expect(h.save().frames.length).toBeLessThanOrEqual(251);
  expect(h.save().frames.at(-1)?.timeSec).toBeCloseTo(39999 * 0.032);
});
