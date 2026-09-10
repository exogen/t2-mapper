/** The client's cosmetic RNG isn't recorded. Seed it from the event's stable
 * time/identity/position so reconstructing the same event yields the same pose. */
export function timelineRandom(
  ...values: number[]
): (() => number) & { state: number } {
  let state = 2166136261;
  for (const value of values)
    state = Math.imul(state ^ Math.trunc(value * 1000), 16777619);
  const random = () => {
    random.state = (Math.imul(random.state, 1664525) + 1013904223) | 0;
    return (random.state >>> 0) / 4294967296;
  };
  random.state = state;
  return random;
}
