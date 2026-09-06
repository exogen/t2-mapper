/**
 * Read a binary glTF's JSON chunk without three.js: 12-byte header (magic
 * "glTF") then chunks of [length, type, data]; the first chunk is JSON.
 * Used where a GLB is fetched for its metadata rather than rendered.
 */

interface GlbMaterial {
  name?: string;
  extras?: { resource_path?: string; flag_names?: string[] };
}

interface GlbJson {
  materials?: GlbMaterial[];
  animations?: { name?: string; samplers?: { input: number }[] }[];
  accessors?: { max?: number[] }[];
  scenes?: { extras?: Record<string, unknown> }[];
}

export function parseGlbJson(buffer: ArrayBuffer): GlbJson | undefined {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    return undefined;
  }
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a || 20 + chunkLength > buffer.byteLength) {
    return undefined;
  }
  try {
    return JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 20, chunkLength)),
    ) as GlbJson;
  } catch {
    return undefined;
  }
}

/** Each named animation's duration (seconds): its largest input accessor max. */
export function glbAnimationDurations(
  json: GlbJson,
): { name: string; duration: number }[] {
  const out: { name: string; duration: number }[] = [];
  for (const anim of json.animations ?? []) {
    if (!anim.name) continue;
    let duration = 0;
    for (const sampler of anim.samplers ?? []) {
      const max = json.accessors?.[sampler.input]?.max?.[0];
      if (typeof max === "number") duration = Math.max(duration, max);
    }
    out.push({ name: anim.name, duration });
  }
  return out;
}
