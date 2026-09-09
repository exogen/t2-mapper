/** Bounds-checked little-endian reads, with zero-copy aligned numeric arrays. */
export class DTSStream {
  readonly buffer: ArrayBuffer;
  readonly end: number;
  readonly label: string;
  readonly view: DataView;
  offset: number;
  constructor(
    buffer: ArrayBuffer,
    start = 0,
    end = buffer.byteLength,
    label = "DTS",
  ) {
    this.buffer = buffer;
    this.end = end;
    this.label = label;
    this.view = new DataView(buffer);
    this.offset = start;
    if (start < 0 || end < start || end > buffer.byteLength)
      this.fail("invalid buffer range");
  }
  fail(message: string): never {
    throw new Error(`${this.label} at byte ${this.offset}: ${message}`);
  }
  require(bytes: number) {
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      bytes > this.end - this.offset
    )
      this.fail(`truncated data (${bytes} bytes requested)`);
  }
  skip(bytes: number) {
    this.require(bytes);
    this.offset += bytes;
  }
  u8() {
    this.require(1);
    return this.view.getUint8(this.offset++);
  }
  u16() {
    this.require(2);
    const n = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return n;
  }
  i16() {
    this.require(2);
    const n = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return n;
  }
  u32() {
    this.require(4);
    const n = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return n;
  }
  i32() {
    this.require(4);
    const n = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return n;
  }
  f32() {
    this.require(4);
    const n = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    if (!Number.isFinite(n)) this.fail("non-finite float");
    return n;
  }
  count(stride = 1) {
    const n = this.u32();
    this.require(n * stride);
    return n;
  }
  bytes(n: number) {
    this.require(n);
    const a = new Uint8Array(this.buffer, this.offset, n);
    this.offset += n;
    return a;
  }
  floats(n: number): Float32Array {
    this.require(n * 4);
    if (this.offset % 4) {
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++)
        a[i] = this.view.getFloat32(this.offset + i * 4, true);
      this.offset += n * 4;
      if (!a.every(Number.isFinite)) this.fail("non-finite float array");
      return a;
    }
    const a = new Float32Array(this.buffer, this.offset, n);
    this.offset += n * 4;
    if (!a.every(Number.isFinite)) this.fail("non-finite float array");
    return a;
  }
  ints(n: number): Int32Array {
    this.require(n * 4);
    if (this.offset % 4) {
      const a = new Int32Array(n);
      for (let i = 0; i < n; i++)
        a[i] = this.view.getInt32(this.offset + i * 4, true);
      this.offset += n * 4;
      return a;
    }
    const a = new Int32Array(this.buffer, this.offset, n);
    this.offset += n * 4;
    return a;
  }
  uints(n: number): Uint32Array {
    const a = this.ints(n);
    return new Uint32Array(a.buffer, a.byteOffset, a.length);
  }
  shorts(n: number): Int16Array {
    this.require(n * 2);
    if (this.offset % 2) {
      const a = new Int16Array(n);
      for (let i = 0; i < n; i++)
        a[i] = this.view.getInt16(this.offset + i * 2, true);
      this.offset += n * 2;
      return a;
    }
    const a = new Int16Array(this.buffer, this.offset, n);
    this.offset += n * 2;
    return a;
  }
  ushorts(n: number): Uint16Array {
    const a = this.shorts(n);
    return new Uint16Array(a.buffer, a.byteOffset, a.length);
  }
  string(n: number) {
    return textDecoder.decode(this.bytes(n));
  }
  cstring() {
    const start = this.offset;
    while (this.u8() !== 0) {
      /* terminated in the byte lane */
    }
    return textDecoder.decode(
      new Uint8Array(this.buffer, start, this.offset - start - 1),
    );
  }
}
const textDecoder = new TextDecoder();

/** DTS 19+ interleaves logical records across separate 32/16/8-bit lanes. */
export class DTSAllocation {
  readonly lane32: DTSStream;
  readonly lane16: DTSStream;
  readonly lane8: DTSStream;
  private guardIndex = 0;
  constructor(stream: DTSStream) {
    const size = stream.u32(),
      start16 = stream.u32(),
      start8 = stream.u32();
    if (start16 > start8 || start8 > size)
      stream.fail("invalid DTS lane offsets");
    stream.require(size * 4);
    const start = stream.offset;
    this.lane32 = new DTSStream(
      stream.buffer,
      start,
      start + start16 * 4,
      "DTS 32-bit lane",
    );
    this.lane16 = new DTSStream(
      stream.buffer,
      start + start16 * 4,
      start + start8 * 4,
      "DTS 16-bit lane",
    );
    this.lane8 = new DTSStream(
      stream.buffer,
      start + start8 * 4,
      start + size * 4,
      "DTS 8-bit lane",
    );
    stream.skip(size * 4);
  }
  fail(message: string): never {
    return this.lane32.fail(message);
  }
  i32() {
    return this.lane32.i32();
  }
  u32() {
    return this.lane32.u32();
  }
  f32() {
    return this.lane32.f32();
  }
  u8() {
    return this.lane8.u8();
  }
  u16() {
    return this.lane16.u16();
  }
  floats(n: number) {
    return this.lane32.floats(n);
  }
  ints(n: number) {
    return this.lane32.ints(n);
  }
  uints(n: number) {
    return this.lane32.uints(n);
  }
  shorts(n: number) {
    return this.lane16.shorts(n);
  }
  ushorts(n: number) {
    return this.lane16.ushorts(n);
  }
  bytes(n: number) {
    return this.lane8.bytes(n);
  }
  count() {
    const n = this.u32();
    if (n > this.lane32.buffer.byteLength) this.fail(`invalid count ${n}`);
    return n;
  }
  guard() {
    const expected = this.guardIndex++;
    if (
      this.u32() !== expected ||
      this.u16() !== (expected & 0xffff) ||
      this.u8() !== (expected & 0xff)
    )
      this.fail(`invalid synchronization guard ${expected}`);
  }
}

export type DTSNumbers = Pick<
  DTSStream,
  | "i32"
  | "u32"
  | "f32"
  | "floats"
  | "ints"
  | "uints"
  | "shorts"
  | "ushorts"
  | "bytes"
  | "u8"
  | "u16"
  | "fail"
  | "count"
>;
export function readDTSSet(r: DTSStream): number[] {
  r.u32(); // obsolete numInts
  const words = r.uints(r.count(4));
  const members: number[] = [];
  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    while (word) {
      const bit = 31 - Math.clz32(word & -word);
      members.push(i * 32 + bit);
      word = (word & (word - 1)) >>> 0;
    }
  }
  return members;
}
