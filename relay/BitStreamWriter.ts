/**
 * Bit-level stream writer, mirroring the V12 engine's BitStream write methods.
 * Bits are written LSB-first within each byte, matching the read convention.
 */
export class BitStreamWriter {
  private data: Uint8Array;
  private bitNum: number;
  private maxBitNum: number;

  constructor(maxBytes = 1500) {
    this.data = new Uint8Array(maxBytes);
    this.bitNum = 0;
    this.maxBitNum = maxBytes << 3;
  }

  getCurPos(): number {
    return this.bitNum;
  }

  setCurPos(pos: number): void {
    this.bitNum = pos;
  }

  getBytePosition(): number {
    return (this.bitNum + 7) >> 3;
  }

  getByteCount(): number {
    return this.getBytePosition();
  }

  /** Get a copy of the written bytes. */
  getBuffer(): Uint8Array {
    return this.data.slice(0, this.getByteCount());
  }

  writeFlag(value: boolean): void {
    if (this.bitNum >= this.maxBitNum) {
      throw new RangeError(
        `BitStreamWriter overflow: writeFlag at position ${this.bitNum}, max ${this.maxBitNum}`,
      );
    }
    if (value) {
      this.data[this.bitNum >> 3] |= 1 << (this.bitNum & 0x7);
    } else {
      this.data[this.bitNum >> 3] &= ~(1 << (this.bitNum & 0x7));
    }
    this.bitNum++;
  }

  /** Write N bits from an unsigned integer, LSB-first. */
  writeInt(value: number, bitCount: number): void {
    if (bitCount === 0) return;
    if (this.bitNum + bitCount > this.maxBitNum) {
      throw new RangeError(
        `BitStreamWriter overflow: need ${bitCount} bits at position ${this.bitNum}, max ${this.maxBitNum}`,
      );
    }
    value = value >>> 0;
    for (let i = 0; i < bitCount; i++) {
      if (value & (1 << i)) {
        this.data[this.bitNum >> 3] |= 1 << (this.bitNum & 0x7);
      } else {
        this.data[this.bitNum >> 3] &= ~(1 << (this.bitNum & 0x7));
      }
      this.bitNum++;
    }
  }

  /** Write a signed integer: 1-bit sign flag + (bitCount-1) magnitude bits. */
  writeSignedInt(value: number, bitCount: number): void {
    if (value < 0) {
      this.writeFlag(true);
      this.writeInt(-value, bitCount - 1);
    } else {
      this.writeFlag(false);
      this.writeInt(value, bitCount - 1);
    }
  }

  writeU8(value: number): void {
    this.writeInt(value & 0xff, 8);
  }

  writeU16(value: number): void {
    this.writeInt(value & 0xffff, 16);
  }

  writeU32(value: number): void {
    this.writeInt(value >>> 0, 32);
  }

  writeS32(value: number): void {
    this.writeU32(value | 0);
  }

  /** Shared buffer for F32 writes. */
  private static readonly f32Buf = new ArrayBuffer(4);
  private static readonly f32View = new DataView(BitStreamWriter.f32Buf);
  private static readonly f32U8 = new Uint8Array(BitStreamWriter.f32Buf);

  writeF32(value: number): void {
    BitStreamWriter.f32View.setFloat32(0, value, true);
    for (let i = 0; i < 4; i++) {
      this.writeU8(BitStreamWriter.f32U8[i]);
    }
  }

  /** Write a float normalized to [0, 1]. */
  writeFloat(value: number, bitCount: number): void {
    const maxVal = (1 << bitCount) - 1;
    this.writeInt(Math.round(value * maxVal), bitCount);
  }

  /** Write a float normalized to [-1, 1]. */
  writeSignedFloat(value: number, bitCount: number): void {
    const maxVal = (1 << bitCount) - 1;
    this.writeInt(Math.round((value + 1.0) * 0.5 * maxVal), bitCount);
  }

  writeRangedU32(value: number, rangeStart: number, rangeEnd: number): void {
    const rangeSize = rangeEnd - rangeStart + 1;
    const rangeBits = Math.ceil(Math.log2(rangeSize)) || 1;
    this.writeInt(value - rangeStart, rangeBits);
  }

  /** Write raw bits from a Uint8Array. */
  writeBitsBuffer(data: Uint8Array, bitCount: number): void {
    if (this.bitNum + bitCount > this.maxBitNum) {
      throw new RangeError(
        `BitStreamWriter overflow: need ${bitCount} bits at position ${this.bitNum}, max ${this.maxBitNum}`,
      );
    }
    for (let i = 0; i < bitCount; i++) {
      const byteIndex = i >> 3;
      const bitIndex = i & 0x7;
      const bit = (data[byteIndex] >> bitIndex) & 1;
      if (bit) {
        this.data[this.bitNum >> 3] |= 1 << (this.bitNum & 0x7);
      } else {
        this.data[this.bitNum >> 3] &= ~(1 << (this.bitNum & 0x7));
      }
      this.bitNum++;
    }
  }

  writeBytes(bytes: Uint8Array): void {
    this.writeBitsBuffer(bytes, bytes.length * 8);
  }
}
