import { BitStreamWriter } from "./BitStreamWriter.js";

/** Hardcoded character frequency table from the V12 engine (bitStream.cc). */
const CSM_CHAR_FREQS: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 329, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 2809, 68, 0, 27, 0, 58, 3, 62, 4, 7, 0, 0, 15, 65, 554,
  3, 394, 404, 189, 117, 30, 51, 27, 15, 34, 32, 80, 1, 142, 3, 142, 39, 0, 144,
  125, 44, 122, 275, 70, 135, 61, 127, 8, 12, 113, 246, 122, 36, 185, 1, 149,
  309, 335, 12, 11, 14, 54, 151, 0, 0, 2, 0, 0, 211, 0, 2090, 344, 736, 993,
  2872, 701, 605, 646, 1552, 328, 305, 1240, 735, 1533, 1713, 562, 3, 1775,
  1149, 1469, 979, 407, 553, 59, 279, 31, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

const PROB_BOOST = 1;

function isAlphaNumeric(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

interface HuffLeaf {
  pop: number;
  symbol: number;
  numBits: number;
  code: number;
}

interface HuffNode {
  pop: number;
  index0: number;
  index1: number;
}

interface HuffWrap {
  node: HuffNode | null;
  leaf: HuffLeaf | null;
}

function wrapGetPop(w: HuffWrap): number {
  return w.node ? w.node.pop : w.leaf!.pop;
}

let leaves: HuffLeaf[] = [];
let tablesBuilt = false;

function buildTables(): void {
  if (tablesBuilt) return;
  tablesBuilt = true;

  leaves = [];
  for (let i = 0; i < 256; i++) {
    leaves.push({
      pop:
        CSM_CHAR_FREQS[i] + (isAlphaNumeric(i) ? PROB_BOOST : 0) + PROB_BOOST,
      symbol: i,
      numBits: 0,
      code: 0,
    });
  }

  const nodes: HuffNode[] = [{ pop: 0, index0: 0, index1: 0 }];
  let currWraps = 256;
  const wraps: HuffWrap[] = [];
  for (let i = 0; i < 256; i++) {
    wraps.push({ node: null, leaf: leaves[i] });
  }

  while (currWraps !== 1) {
    let min1 = 0xfffffffe;
    let min2 = 0xffffffff;
    let index1 = -1;
    let index2 = -1;

    for (let i = 0; i < currWraps; i++) {
      const pop = wrapGetPop(wraps[i]);
      if (pop < min1) {
        min2 = min1;
        index2 = index1;
        min1 = pop;
        index1 = i;
      } else if (pop < min2) {
        min2 = pop;
        index2 = i;
      }
    }

    const determineIndex = (wrap: HuffWrap): number => {
      if (wrap.leaf !== null) {
        return -(leaves.indexOf(wrap.leaf) + 1);
      }
      return nodes.indexOf(wrap.node!);
    };

    const newNode: HuffNode = {
      pop: wrapGetPop(wraps[index1]) + wrapGetPop(wraps[index2]),
      index0: determineIndex(wraps[index1]),
      index1: determineIndex(wraps[index2]),
    };
    nodes.push(newNode);

    const mergeIndex = index1 < index2 ? index1 : index2;
    const nukeIndex = index1 > index2 ? index1 : index2;
    wraps[mergeIndex] = { node: newNode, leaf: null };
    if (nukeIndex !== currWraps - 1) {
      wraps[nukeIndex] = wraps[currWraps - 1];
    }
    currWraps--;
  }

  nodes[0] = wraps[0].node!;

  function generateCodes(code: number, nodeIndex: number, depth: number): void {
    if (nodeIndex < 0) {
      const leaf = leaves[-(nodeIndex + 1)];
      leaf.code = code;
      leaf.numBits = depth;
    } else {
      const node = nodes[nodeIndex];
      generateCodes(code, node.index0, depth + 1);
      generateCodes(code | (1 << depth), node.index1, depth + 1);
    }
  }

  generateCodes(0, 0, 0);
}

/** Write a Huffman-encoded string to a BitStreamWriter. */
export function writeHuffBuffer(bs: BitStreamWriter, str: string): void {
  buildTables();

  // Always use Huffman compression (flag=true)
  bs.writeFlag(true);
  bs.writeInt(str.length, 8);

  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i) & 0xff;
    const leaf = leaves[charCode];
    // Write Huffman code bits LSB-first
    for (let b = 0; b < leaf.numBits; b++) {
      bs.writeFlag((leaf.code & (1 << b)) !== 0);
    }
  }
}

/**
 * Write a Huffman-encoded string (readString inverse).
 * When the server's BitStream has a stringBuffer set (compression point),
 * readString reads an extra flag before the Huffman data. We must write
 * that flag. Since we don't track buffer state, we always write false
 * (no prefix match), then the full Huffman string.
 */
export function writeString(
  bs: BitStreamWriter,
  str: string,
  compressed: boolean = false,
): void {
  if (compressed) {
    // Compression buffer is active on the reader side.
    // Write false = no prefix match with buffer, send full string.
    bs.writeFlag(false);
  }
  writeHuffBuffer(bs, str);
}

/**
 * Pack a net string (inverse of BitStream.unpackNetString).
 * Code 0 = empty, code 1 = Huffman string, code 3 = integer.
 */
export function packNetString(
  bs: BitStreamWriter,
  str: string,
  compressed: boolean = false,
): void {
  if (str === "" || str == null) {
    bs.writeInt(0, 2);
    return;
  }

  // Check if it's a tagged string (\x01<id>)
  if (str.charCodeAt(0) === 1) {
    bs.writeInt(2, 2);
    const tag = parseInt(str.slice(1), 10);
    bs.writeInt(tag, 10);
    return;
  }

  // Check if it's a simple integer
  const num = parseInt(str, 10);
  if (!isNaN(num) && String(num) === str) {
    bs.writeInt(3, 2);
    const neg = num < 0;
    const absNum = Math.abs(num);
    bs.writeFlag(neg);
    if (absNum < 128) {
      bs.writeFlag(true);
      bs.writeInt(absNum, 7);
    } else if (absNum < 32768) {
      bs.writeFlag(false);
      bs.writeFlag(true);
      bs.writeInt(absNum, 15);
    } else {
      bs.writeFlag(false);
      bs.writeFlag(false);
      bs.writeInt(absNum, 31);
    }
    return;
  }

  // Normal string
  bs.writeInt(1, 2);
  writeString(bs, str, compressed);
}
