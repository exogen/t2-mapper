import fs from "node:fs";
import { inspect } from "node:util";
import { parseInteriorBuffer } from "@/src/interior";

const interiorFile = process.argv[2];
const interiorBuffer = fs.readFileSync(interiorFile);
const interiorArrayBuffer = interiorBuffer.buffer.slice(
  interiorBuffer.byteOffset,
  interiorBuffer.byteOffset + interiorBuffer.byteLength
);

console.log(
  inspect(parseInteriorBuffer(interiorArrayBuffer), {
    colors: true,
    depth: Infinity,
  })
);
