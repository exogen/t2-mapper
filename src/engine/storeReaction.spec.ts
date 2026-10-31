import { expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { combineCleanups, reaction } from "./storeReaction";

it("runs now and on every change, cleaning up the previous run first", () => {
  const store = createStore(() => ({ mode: "a", other: 0 }));
  const log: string[] = [];
  const stop = reaction(
    store,
    (state) => state.mode,
    (mode) => {
      log.push(`start ${mode}`);
      return () => log.push(`stop ${mode}`);
    },
  );
  store.setState({ other: 1 });
  store.setState({ mode: "b" });
  stop();
  store.setState({ mode: "c" });
  expect(log).toEqual(["start a", "stop a", "start b", "stop b"]);
});

it("cleans up in reverse order", () => {
  const log: number[] = [];
  combineCleanups(
    () => log.push(1),
    undefined,
    () => log.push(2),
  )();
  expect(log).toEqual([2, 1]);
});
