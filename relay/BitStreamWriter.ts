/**
 * Bit-level stream writer, mirroring the V12 engine's BitStream write methods.
 * Bits are written LSB-first within each byte, matching the read convention.
 */
export class BitStreamWriter {
  private data: Uint8Array;
  private bitNum: number;
  private maxBitNum: number;
  private growable: boolean;

  constructor(maxBytes = 1500, options: { growable?: boolean } = {}) {
    this.data = new Uint8Array(maxBytes);
    this.bitNum = 0;
    this.maxBitNum = maxBytes << 3;
    this.growable = options.growable ?? false;
  }

  /** Grow (when growable) or throw when bitCount more bits won't fit. */
  private ensure(bitCount: number): void {
    if (this.bitNum + bitCount <= this.maxBitNum) return;
    if (!this.growable) {
      throw new RangeError(
        `BitStreamWriter overflow: need ${bitCount} bits at position ${this.bitNum}, max ${this.maxBitNum}`,
      );
    }
    let newBytes = this.data.length;
    while (this.bitNum + bitCount > newBytes << 3) {
      newBytes *= 2;
    }
    const grown = new Uint8Array(newBytes);
    grown.set(this.data);
    this.data = grown;
    this.maxBitNum = newBytes << 3;
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
    this.ensure(1);
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
    this.ensure(bitCount);
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

  /** Advance to the next byte boundary, zero-filling any remaining bits. */
  alignToByte(): void {
    const rem = this.bitNum & 0x7;
    if (rem) this.writeInt(0, 8 - rem);
  }

  /** Write raw bits from a Uint8Array. */
  writeBitsBuffer(data: Uint8Array, bitCount: number): void {
    this.ensure(bitCount);
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
