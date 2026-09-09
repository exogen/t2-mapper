/** External DTS animation streams, following TSShape::importSequences. */
import { readDTSSequence, validateDTS } from "./dts";
import { DTSStream } from "./dtsReader";
import {
  DTSSequenceFlags,
  type DTSObjectState,
  type DTSSequence,
  type DTSShapeData,
  type DTSTrigger,
} from "./dtsTypes";

export interface DSQData {
  version: number;
  nodeNames: string[];
  sequenceNames: string[];
  rotations: Int16Array;
  translations: Float32Array;
  uniformScales: Float32Array;
  alignedScales: Float32Array;
  arbitraryScaleRotations: Int16Array;
  arbitraryScaleFactors: Float32Array;
  groundTranslations: Float32Array;
  groundRotations: Int16Array;
  objectStates: DTSObjectState[];
  sequences: DTSSequence[];
  triggers: DTSTrigger[];
}

export function parseDSQ(buffer: ArrayBuffer): DSQData {
  const r = new DTSStream(buffer),
    version = r.u32() & 255;
  if (version < 22 || version > 26)
    r.fail(`unsupported DSQ version ${version}; expected 22–26`);
  const nodeNames = Array.from({ length: r.count(4) }, () =>
    r.string(r.count()),
  );
  r.u32();
  r.u32(); // Legacy object counts. Objects in DSQ address the source shape directly.
  const rotations = r.shorts(r.count(8) * 4);
  const translations = r.floats(r.count(12) * 3);
  const uniformScales = r.floats(r.count(4));
  const alignedScales = r.floats(r.count(12) * 3);
  const arbitrary = r.count(20);
  const arbitraryScaleRotations = r.shorts(arbitrary * 4);
  const arbitraryScaleFactors = r.floats(arbitrary * 3);
  const ground = r.count(20);
  const groundTranslations = r.floats(ground * 3),
    groundRotations = r.shorts(ground * 4);
  const objectStates = Array.from({ length: r.count(12) }, () => ({
    visibility: r.f32(),
    frame: r.i32(),
    materialFrame: r.i32(),
  }));
  const sequenceNames: string[] = [];
  const sequences = Array.from({ length: r.count() }, (_, i) => {
    sequenceNames.push(r.string(r.count()));
    return readDTSSequence(r, version, i);
  });
  const triggers = Array.from({ length: r.count(8) }, () => ({
    state: r.u32(),
    position: r.f32(),
  }));
  return {
    version,
    nodeNames,
    sequenceNames,
    rotations,
    translations,
    uniformScales,
    alignedScales,
    arbitraryScaleRotations,
    arbitraryScaleFactors,
    groundTranslations,
    groundRotations,
    objectStates,
    sequences,
    triggers,
  };
}

type Samples = Int16Array | Float32Array;
function concat<T extends Samples>(chunks: readonly T[]): T {
  const result = new (chunks[0].constructor as { new (length: number): T })(
    chunks.reduce((n, a) => n + a.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Merge many DSQs in one allocation per channel. Neither input is mutated. */
export function mergeDSQ(
  shape: DTSShapeData,
  sources: readonly { data: DSQData; name?: string }[],
): DTSShapeData {
  const result = {
    ...shape,
    names: shape.names.slice(),
    sequences: shape.sequences.slice(),
    objectStates: shape.objectStates.slice(),
    triggers: shape.triggers.slice(),
  };
  const channels = {
    rotations: [shape.rotations],
    translations: [shape.translations],
    uniformScales: [shape.uniformScales],
    alignedScales: [shape.alignedScales],
    arbitraryScaleFactors: [shape.arbitraryScaleFactors],
    arbitraryScaleRotations: [shape.arbitraryScaleRotations],
    groundTranslations: [shape.groundTranslations],
    groundRotations: [shape.groundRotations],
  };
  const lengths = Object.fromEntries(
    Object.entries(channels).map(([key, chunks]) => [key, chunks[0].length]),
  );
  const nodes = new Map(
    shape.nodes.map((node, i) => [
      shape.names[node.nameIndex].toLowerCase(),
      i,
    ]),
  );
  for (const { data, name } of sources) {
    const nodeMap = data.nodeNames.map((n) => nodes.get(n.toLowerCase()));
    const groundOffset = lengths.groundTranslations / 3,
      objectOffset = result.objectStates.length,
      triggerOffset = result.triggers.length;
    channels.groundTranslations.push(data.groundTranslations);
    lengths.groundTranslations += data.groundTranslations.length;
    channels.groundRotations.push(data.groundRotations);
    lengths.groundRotations += data.groundRotations.length;
    result.objectStates.push(...data.objectStates);
    result.triggers.push(...data.triggers);
    for (const original of data.sequences) {
      const s = { ...original };
      const remap = (members: number[]) =>
        members
          .filter((i) => i < nodeMap.length)
          .map((index, rank) => ({ index: nodeMap[index], rank }))
          .filter(
            (p): p is { index: number; rank: number } => p.index !== undefined,
          )
          .sort((a, b) => a.index - b.index);
      const append = (
        key: keyof typeof channels,
        width: number,
        base: number,
        pairs: { index: number; rank: number }[],
      ) => {
        const target = channels[key] as Samples[],
          source = data[key];
        const newBase = lengths[key] / width;
        for (const { rank } of pairs) {
          const start = (base + rank * s.numKeyframes) * width,
            end = start + s.numKeyframes * width;
          if (start < 0 || end > source.length)
            throw new Error(`DSQ: invalid ${key} keyframe range`);
          target.push(source.subarray(start, end));
          lengths[key] += end - start;
        }
        return newBase;
      };
      let pairs = remap(s.rotationMatters);
      s.baseRotation = append("rotations", 4, s.baseRotation, pairs);
      s.rotationMatters = pairs.map((p) => p.index);
      pairs = remap(s.translationMatters);
      s.baseTranslation = append("translations", 3, s.baseTranslation, pairs);
      s.translationMatters = pairs.map((p) => p.index);
      pairs = remap(s.scaleMatters);
      if (s.flags & DTSSequenceFlags.UniformScale)
        s.baseScale = append("uniformScales", 1, s.baseScale, pairs);
      else if (s.flags & DTSSequenceFlags.AlignedScale)
        s.baseScale = append("alignedScales", 3, s.baseScale, pairs);
      else if (s.flags & DTSSequenceFlags.ArbitraryScale) {
        append("arbitraryScaleRotations", 4, s.baseScale, pairs);
        s.baseScale = append("arbitraryScaleFactors", 3, s.baseScale, pairs);
      }
      s.scaleMatters = pairs.map((p) => p.index);
      s.firstGroundFrame += groundOffset;
      s.baseObjectState += objectOffset;
      s.firstTrigger += triggerOffset;
      s.nameIndex = result.names.length;
      const embeddedName = data.sequenceNames[original.nameIndex];
      result.names.push(
        name
          ? data.sequences.length === 1
            ? name
            : `${name}_${embeddedName}`
          : embeddedName,
      );
      result.sequences.push(s);
    }
  }
  result.rotations = concat(channels.rotations);
  result.translations = concat(channels.translations);
  result.uniformScales = concat(channels.uniformScales);
  result.alignedScales = concat(channels.alignedScales);
  result.arbitraryScaleFactors = concat(channels.arbitraryScaleFactors);
  result.arbitraryScaleRotations = concat(channels.arbitraryScaleRotations);
  result.groundTranslations = concat(channels.groundTranslations);
  result.groundRotations = concat(channels.groundRotations);
  validateDTS(result);
  return result;
}
