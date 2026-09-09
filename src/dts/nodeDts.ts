/** Native shape geometry in Node: no images, workers, or Draco decoder. */
import { readFile } from "node:fs/promises";
import { DTSLoader } from "./dtsLoader";
import type { DTSShape } from "./dtsModel";

const scenes = new Map<string, Promise<DTSShape>>();
export function loadDtsScene(file: string): Promise<DTSShape> {
  let result = scenes.get(file);
  if (!result) {
    result = readFile(file)
      .then(
        (bytes) =>
          new DTSLoader().parse(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          ).scene,
      )
      .catch((error) => {
        scenes.delete(file);
        throw error;
      });
    scenes.set(file, result);
  }
  return result;
}
