/** Native shape geometry in Node: no images, workers, or Draco decoder. */
import { readFile } from "node:fs/promises";
import { parseDTS } from "./dts";
import { buildDTS } from "./dtsBuilder";
import { mergeDTSSequenceSources, type DTSSequenceSource } from "./dsq";
import type { DTSShape } from "./dtsModel";
import type { DTSShapeData } from "./dtsTypes";

const dataFiles = new Map<string, Promise<DTSShapeData>>();
const animatedFiles = new Map<string, Promise<DTSShapeData>>();

async function readBytes(file: string): Promise<ArrayBuffer> {
  const bytes = await readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function loadRawData(file: string): Promise<DTSShapeData> {
  let pending = dataFiles.get(file);
  if (!pending) {
    pending = readBytes(file)
      .then(parseDTS)
      .catch((error) => {
        dataFiles.delete(file);
        throw error;
      });
    dataFiles.set(file, pending);
  }
  return pending;
}

/** Shape metadata with optional external animation streams. */
export function loadDtsData(
  file: string,
  sequences: readonly DTSSequenceSource[] = [],
): Promise<DTSShapeData> {
  if (!sequences.length) return loadRawData(file);
  const key = JSON.stringify([file, sequences]);
  let pending = animatedFiles.get(key);
  if (!pending) {
    pending = loadRawData(file)
      .then((data) => mergeDTSSequenceSources(data, sequences, readBytes))
      .catch((error) => {
        animatedFiles.delete(key);
        throw error;
      });
    animatedFiles.set(key, pending);
  }
  return pending;
}

const scenes = new Map<string, Promise<DTSShape>>();
export function loadDtsScene(file: string): Promise<DTSShape> {
  let result = scenes.get(file);
  if (!result) {
    result = loadDtsData(file)
      .then((data) => buildDTS(data).scene)
      .catch((error) => {
        scenes.delete(file);
        throw error;
      });
    scenes.set(file, result);
  }
  return result;
}
