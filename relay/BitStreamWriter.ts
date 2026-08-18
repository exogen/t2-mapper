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

  writeU8(value: number): void {
    this.writeInt(value & 0xff, 8);
  }

  writeU32(value: number): void {
    this.writeInt(value >>> 0, 32);
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
}
