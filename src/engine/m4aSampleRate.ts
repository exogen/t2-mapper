interface ByteRange {
  start: number;
  end: number;
}

const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350,
] as const;

function findBox(
  data: DataView,
  type: string,
  start: number,
  end: number,
): ByteRange | undefined {
  const tag =
    (type.charCodeAt(0) << 24) |
    (type.charCodeAt(1) << 16) |
    (type.charCodeAt(2) << 8) |
    type.charCodeAt(3);
  for (let offset = start; offset + 8 <= end;) {
    const size = data.getUint32(offset);
    if (size < 8 || size > end - offset) return;
    if (data.getInt32(offset + 4) === tag)
      return { start: offset + 8, end: offset + size };
    offset += size;
  }
}

function readDescriptor(
  data: DataView,
  tag: number,
  start: number,
  end: number,
): ByteRange | undefined {
  if (start >= end || data.getUint8(start++) !== tag) return;
  let length = 0;
  // MPEG-4 descriptor lengths use up to four continuation bytes.
  for (let i = 0; i < 4 && start < end; i++) {
    const byte = data.getUint8(start++);
    length = (length << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0)
      return length <= end - start ? { start, end: start + length } : undefined;
  }
}

/** Recognize the AAC-LC sample descriptions in converted game audio.
 * Unrecognized formats continue through the ordinary audio decoder. */
export function readM4aSampleRate(bytes: ArrayBuffer): number | undefined {
  const data = new DataView(bytes);
  const length = data.byteLength;
  if (length < 8 || data.getUint32(4) !== 0x66747970 /* ftyp */) return;
  const movie = findBox(data, "moov", 0, length);
  if (!movie) return;
  const track = findBox(data, "trak", movie.start, movie.end);
  if (!track || findBox(data, "trak", track.end, movie.end)) return;
  const media = findBox(data, "mdia", track.start, track.end);
  if (!media) return;
  const handler = findBox(data, "hdlr", media.start, media.end);
  if (
    !handler ||
    handler.end - handler.start < 12 ||
    data.getUint32(handler.start + 8) !== 0x736f756e /* soun */
  )
    return;
  const mediaInfo = findBox(data, "minf", media.start, media.end);
  if (!mediaInfo) return;
  const samples = findBox(data, "stbl", mediaInfo.start, mediaInfo.end);
  if (!samples) return;
  const descriptions = findBox(data, "stsd", samples.start, samples.end);
  if (
    !descriptions ||
    descriptions.end - descriptions.start < 8 ||
    data.getUint32(descriptions.start + 4) !== 1
  )
    return;
  const entry = findBox(data, "mp4a", descriptions.start + 8, descriptions.end);
  // A version-0 AudioSampleEntry has a 28-byte header ending in a 16.16 rate.
  if (
    !entry ||
    entry.end - entry.start < 28 ||
    data.getUint16(entry.start + 8) !== 0
  )
    return;
  const declaredRate = data.getUint32(entry.start + 24) / 65536;

  const esds = findBox(data, "esds", entry.start + 28, entry.end);
  if (!esds) return;
  const stream = readDescriptor(data, 3, esds.start + 4, esds.end);
  if (
    !stream ||
    stream.end - stream.start < 3 ||
    (data.getUint8(stream.start + 2) & 0xe0) !== 0
  )
    return;
  const decoder = readDescriptor(data, 4, stream.start + 3, stream.end);
  if (
    !decoder ||
    decoder.end - decoder.start < 13 ||
    data.getUint8(decoder.start) !== 0x40 // MPEG-4 Audio
  )
    return;
  const config = readDescriptor(data, 5, decoder.start + 13, decoder.end);
  if (!config) return;
  const configLength = config.end - config.start;
  // FFmpeg also writes an explicit SBR-disabled extension (56 e5 00).
  if (
    configLength !== 2 &&
    (configLength !== 5 ||
      data.getUint16(config.start + 2) !== 0x56e5 ||
      data.getUint8(config.start + 4) !== 0)
  )
    return;
  const descriptor = data.getUint16(config.start);
  if (descriptor >> 11 !== 2 || (descriptor & 7) !== 0) return;
  const rate = AAC_SAMPLE_RATES[(descriptor >> 7) & 15];
  return rate === declaredRate ? rate : undefined;
}
