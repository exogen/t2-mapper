/**
 * The subjects a CTF broadcast can be pointed at. The switcher scores
 * them every tick (see scoreSubject in switcher.ts); this is only the
 * list.
 */
import type { DirectorDataset } from "./types";

/** A thing the camera can be pointed at for a stretch of time. */
export type Subject =
  | { kind: "flag"; slot: number }
  | { kind: "base"; slot: number }
  | { kind: "bombard"; slot: number }
  | { kind: "idle" };

/** Every subject on this map: each flag, each base, each base under
 *  shelling, and the idle filler last. */
export function buildSubjects(
  dataset: DirectorDataset,
  slots: number[],
): Subject[] {
  return [
    ...slots.map((slot): Subject => ({ kind: "flag", slot })),
    ...dataset.flagStands.map((stand): Subject => ({
      kind: "base",
      slot: stand.slot,
    })),
    // Shelling competes for the shot in its own right: when the flags
    // are sitting still, a barrage on a base is the story.
    ...dataset.flagStands.map((stand): Subject => ({
      kind: "bombard",
      slot: stand.slot,
    })),
    { kind: "idle" },
  ];
}
