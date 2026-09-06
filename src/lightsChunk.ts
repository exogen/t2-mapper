/**
 * Three's `lights_fragment_begin` chunk runs one loop per light type
 * (point, spot, directional, …) and calls `RE_Direct` from each. Materials
 * that treat the sun differently from dynamic lights — the terrain and
 * interior shaders compute the sun in gamma space themselves — need to
 * know which loop a call came from. Rather than guessing from the light's
 * direction, hand each loop its own function: this rewrites the chunk so
 * the directional loop calls `directional` and the point/spot loops call
 * `punctual` (either defaults to `RE_Direct`).
 */
import { ShaderChunk } from "three";

const RE_DIRECT_CALL = "RE_Direct(";

function sectionStart(source: string, lightCount: string): number {
  const i = source.indexOf(`#if ( ${lightCount} > 0 )`);
  if (i < 0) throw new Error(`lights_fragment_begin: no ${lightCount} loop`);
  return i;
}

/** The chunk's section for one light type: from its `#if` to the next section's. */
function renameCallsIn(
  source: string,
  lightCount: string,
  nextLightCount: string,
  fnName: string,
): string {
  const start = sectionStart(source, lightCount);
  const end = sectionStart(source, nextLightCount);
  const section = source.slice(start, end);
  if (!section.includes(RE_DIRECT_CALL))
    throw new Error(
      `lights_fragment_begin: no RE_Direct call in ${lightCount}`,
    );
  return (
    source.slice(0, start) +
    section.replaceAll(RE_DIRECT_CALL, `${fnName}(`) +
    source.slice(end)
  );
}

const rewritten = new Map<string, string>();

/**
 * Runs from onBeforeCompile, once per material program; the rewritten
 * chunk is memoized per function pair so repeated compiles cost a lookup.
 */
export function lightsFragmentBeginByType({
  directional = "RE_Direct",
  punctual = "RE_Direct",
}: {
  directional?: string;
  punctual?: string;
}): string {
  const key = `${directional}|${punctual}`;
  const cached = rewritten.get(key);
  if (cached !== undefined) return cached;
  let source = ShaderChunk.lights_fragment_begin;
  if (punctual !== "RE_Direct") {
    source = renameCallsIn(
      source,
      "NUM_POINT_LIGHTS",
      "NUM_SPOT_LIGHTS",
      punctual,
    );
    source = renameCallsIn(
      source,
      "NUM_SPOT_LIGHTS",
      "NUM_DIR_LIGHTS",
      punctual,
    );
  }
  if (directional !== "RE_Direct") {
    source = renameCallsIn(
      source,
      "NUM_DIR_LIGHTS",
      "NUM_RECT_AREA_LIGHTS",
      directional,
    );
  }
  rewritten.set(key, source);
  return source;
}
