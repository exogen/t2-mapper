import { Box3, Vector3 } from "three";
import { expect, it } from "vitest";
import { segmentBoxEntry } from "./segmentBoxEntry";

const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));

it.each([
  { start: [-2, 0, 0], end: [2, 0, 0], t: 0.25 },
  { start: [2, 2, 0], end: [0, 0, 0], t: 0.5 },
  { start: [0, 0, 0], end: [2, 0, 0], t: 0 },
  { start: [0, 0, 0], end: [0, 0, 0], t: 0 },
  { start: [2, 0, 0], end: [1, 0, 0], t: 1 },
  { start: [2, 0, 0], end: [1.1, 0, 0], t: null },
  { start: [-2, 2, 0], end: [2, 2, 0], t: null },
])("clips a finite segment from $start to $end", ({ start, end, t }) => {
  expect(
    segmentBoxEntry(
      new Vector3().fromArray(start),
      new Vector3().fromArray(end),
      box,
    ),
  ).toBe(t);
});
