import type { AnimationClip } from "three";

/**
 * Morph-target frame clips by the lower-cased sequence they belong to.
 * The addon exports DTS mesh frame animation as "{Sequence}_{Mesh}_frame"
 * clips that must play alongside the sequence's node clip.
 */
export function collectMorphClips(
  animations: readonly AnimationClip[],
  sequenceNames: Iterable<string>,
): Map<string, AnimationClip[]> {
  const names = [...sequenceNames].map((n) => n.toLowerCase());
  const bySeq = new Map<string, AnimationClip[]>();
  for (const clip of animations) {
    const lower = clip.name.toLowerCase();
    if (!lower.endsWith("_frame")) continue;
    const seqName = names.find(
      (n) => lower.startsWith(n + "_") && lower.length > n.length + 1 + 5,
    );
    if (!seqName) continue;
    let list = bySeq.get(seqName);
    if (!list) {
      list = [];
      bySeq.set(seqName, list);
    }
    list.push(clip);
  }
  return bySeq;
}

/** True for a clip collectMorphClips would claim for some sequence. */
export function isMorphClip(
  clip: AnimationClip,
  morphClipsBySeq: ReadonlyMap<string, AnimationClip[]>,
): boolean {
  for (const list of morphClipsBySeq.values()) {
    if (list.includes(clip)) return true;
  }
  return false;
}
