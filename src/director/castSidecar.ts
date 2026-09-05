/**
 * The cast.json envelope: a plan, and which demo it belongs to.
 *
 * One writer and one reader, shared by the R2 backfill, the headless
 * cast script and the browser's adoption of a pre-generated plan. They
 * used to each carry their own idea of the format — the backfill wrote
 * version 2, the browser accepted only version 1, the headless script
 * wrote no envelope at all — so every sidecar was silently rejected and
 * the browser re-planned from scratch. The version that matters is the
 * plan's own `contractVersion`; the envelope adds nothing but the name.
 */
import { CAST_CONTRACT_VERSION } from "./castContract";
import type { ShotPlan } from "./types";

export const CAST_SIDECAR_FORMAT = "castgenius-plan";

/**
 * One commentary track generated from this cast. Its files are
 * `<demo>.rec[.<suffix>].commentary.json` (the cue transcript) and
 * `.m4a` beside the cast; the unsuffixed pair is the original,
 * labelled "Default".
 */
export interface CastCommentaryTrack {
  /** Shown in the picker: the suffix, or "Default" for the unsuffixed pair. */
  label: string;
  /** The filename infix between `.rec.` and `.commentary.*`. Absent for
   *  the default pair. */
  suffix?: string;
  /** The model that wrote it, for information. */
  model?: string;
  generatedAt?: string;
}

export interface CastSidecar {
  format: typeof CAST_SIDECAR_FORMAT;
  /** The demo's file name. */
  demo: string;
  plan: ShotPlan;
  /**
   * The commentary tracks generated from this cast, in the order they
   * were made; the first plays unless the viewer picks another. The
   * CastGenius scripts append to this (locally when a transcript is
   * written, in R2 on upload); a re-cast carries the list over. It
   * lives here rather than in the demo's record because casts and
   * commentary are made and tried locally, while the record stays in
   * the bucket.
   */
  commentary?: CastCommentaryTrack[];
}

export function castSidecar(
  plan: ShotPlan,
  demo: string,
  commentary?: CastCommentaryTrack[],
): CastSidecar {
  return {
    format: CAST_SIDECAR_FORMAT,
    demo,
    plan,
    ...(commentary && commentary.length > 0 ? { commentary } : {}),
  };
}

/** The tracks a sidecar lists, in order; empty for none or junk. */
export function commentaryFromSidecar(doc: unknown): CastCommentaryTrack[] {
  if (!doc || typeof doc !== "object") return [];
  const { format, commentary } = doc as Partial<CastSidecar>;
  if (format !== CAST_SIDECAR_FORMAT || !Array.isArray(commentary)) return [];
  return commentary.filter(
    (t): t is CastCommentaryTrack =>
      t != null && typeof t === "object" && typeof t.label === "string",
  );
}

/**
 * The plan inside a sidecar this build understands, or null: wrong
 * envelope, a plan written against another contract, or nothing in it.
 */
export function planFromSidecar(doc: unknown): ShotPlan | null {
  if (!doc || typeof doc !== "object") return null;
  const { format, plan, version } = doc as Partial<CastSidecar> & {
    version?: number;
  };
  if (format !== CAST_SIDECAR_FORMAT || !plan) return null;
  // The bucket holds 207 casts written before the contract existed:
  // envelope `version` 1 or 2, no `contractVersion` on the plan. Their
  // shots are the same runtime shapes (every field added since is
  // optional, and the rig defaults it), so they are adopted as they
  // are — the commentary rendered against them depends on it. A plan
  // that DOES name a contract must name this one.
  const legacy =
    plan.contractVersion == null && (version === 1 || version === 2);
  if (!legacy && plan.contractVersion !== CAST_CONTRACT_VERSION) return null;
  if (!Array.isArray(plan.shots) || plan.shots.length === 0) return null;
  return plan;
}
