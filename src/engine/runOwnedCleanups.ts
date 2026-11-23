import type { Cleanup } from "./storeReaction";

/** Finish an owner's independent teardown steps before reporting failures.
 * This does not change reaction/combineCleanups behavior elsewhere. */
export function runOwnedCleanups(cleanups: readonly Cleanup[]): void {
  const errors: unknown[] = [];
  for (const cleanup of cleanups) {
    try {
      cleanup?.();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Resource teardown failed");
}
